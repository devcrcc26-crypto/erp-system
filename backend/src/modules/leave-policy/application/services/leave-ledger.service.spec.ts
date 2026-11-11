import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { LeaveType, Prisma } from '@prisma/client';
import { LeaveLedgerService } from './leave-ledger.service';
import {
  anniversaryInYear,
  fullServiceYears,
  isEmploymentAnniversary,
  leaveYearFor,
  planCarryOver,
} from '../utils/leave-year.util';
import { calculateLeaveDaysForRange } from '../../../leave/application/utils/leave-days.util';

function d(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

type Row = Record<string, unknown>;

/** Minimal in-memory Prisma for the ledger (only what the service calls). */
function createFakePrisma(seed: {
  users: Row[];
  contracts?: Row[];
  leaves?: Row[];
}) {
  const entries: Row[] = [];
  const balances: Row[] = [];
  const contracts: Row[] = seed.contracts ?? [];
  const leaves: Row[] = seed.leaves ?? [];

  const matches = (row: Row, where: Row = {}): boolean =>
    Object.entries(where).every(([key, condition]) => {
      if (key === 'OR' || key === 'AND' || key === 'NOT') {
        return true;
      }
      const value = row[key];
      if (condition && typeof condition === 'object' && !(condition instanceof Date)) {
        const c = condition as Row;
        if ('in' in c) {
          return (c.in as unknown[]).includes(value);
        }
        if ('not' in c) {
          return c.not === null ? value != null : value !== c.not;
        }
        if ('lt' in c) {
          return (value as Date).getTime() < (c.lt as Date).getTime();
        }
        if ('startsWith' in c) {
          return (
            typeof value === 'string' &&
            value.startsWith(String(c.startsWith))
          );
        }
        return true;
      }
      if (condition instanceof Date) {
        return value instanceof Date && value.getTime() === condition.getTime();
      }
      if (condition === null) {
        return value == null;
      }
      return value === condition;
    });

  const prisma = {
    user: {
      findFirst: async ({ where }: { where: Row }) => {
        const user = seed.users.find((u) => u.id === where.id && u.companyId === where.companyId);
        if (!user) return null;
        return { ...user, leavePolicy: user.leavePolicy ?? null };
      },
    },
    employeeContract: {
      findFirst: async ({ where, orderBy }: { where: Row; orderBy?: Row }) => {
        const rows = contracts.filter((c) => matches(c, where) && c.deletedAt == null);
        if (orderBy) rows.sort((a, b) => (a.startDate as Date).getTime() - (b.startDate as Date).getTime());
        return rows[0] ?? null;
      },
      count: async ({ where }: { where: Row }) =>
        contracts.filter((c) => matches(c, where) && c.deletedAt == null).length,
      findMany: async ({ where }: { where: Row }) =>
        contracts
          .filter((c) => matches(c, where) && c.deletedAt == null)
          .sort((a, b) => (a.startDate as Date).getTime() - (b.startDate as Date).getTime()),
    },
    leaveRequest: {
      findFirst: async ({ where }: { where: Row }) => {
        const leave = leaves.find((l) => l.id === where.id) ?? null;
        if (!leave) {
          return null;
        }
        return { ...leave, periods: (leave.periods as Row[]) ?? [] };
      },
    },
    leaveBalanceEntry: {
      create: async ({ data }: { data: Row }) => {
        if (data.dedupeKey && entries.some((e) => e.dedupeKey === data.dedupeKey)) {
          throw new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' });
        }
        const row: Row = { ...data, createdAt: new Date() };
        entries.push(row);
        return { id: row.id };
      },
      findUnique: async ({ where }: { where: Row }) =>
        entries.find((e) => (where.dedupeKey ? e.dedupeKey === where.dedupeKey : e.id === where.id)) ?? null,
      findUniqueOrThrow: async ({ where }: { where: Row }) => {
        const row = entries.find((e) => e.id === where.id);
        if (!row) throw new Error('not found');
        return { ...row, createdBy: null };
      },
      findMany: async ({ where }: { where: Row }) =>
        entries.filter((e) => matches(e, where)).map((e) => ({ ...e, createdBy: null })),
      count: async ({ where }: { where: Row }) => entries.filter((e) => matches(e, where)).length,
      deleteMany: async ({ where }: { where: Row }) => {
        let count = 0;
        for (let i = entries.length - 1; i >= 0; i -= 1) {
          if (matches(entries[i]!, where)) {
            entries.splice(i, 1);
            count += 1;
          }
        }
        return { count };
      },
      aggregate: async ({ where }: { where: Row }) => ({
        _sum: {
          days: entries
            .filter((e) => matches(e, where))
            .reduce((sum, e) => sum + Number(e.days), 0),
        },
      }),
      groupBy: async ({ where }: { where: Row }) => {
        const groups = new Map<string, { leaveType: unknown; kind: unknown; _sum: { days: number } }>();
        for (const e of entries.filter((row) => matches(row, where))) {
          const key = `${String(e.leaveType)}|${String(e.kind)}`;
          const group = groups.get(key) ?? { leaveType: e.leaveType, kind: e.kind, _sum: { days: 0 } };
          group._sum.days += Number(e.days);
          groups.set(key, group);
        }
        return [...groups.values()];
      },
    },
    leaveBalance: {
      findMany: async ({ where }: { where: Row }) => balances.filter((b) => matches(b, where)),
      findUnique: async ({ where }: { where: { companyId_employeeId_year_leaveType: Row } }) => {
        const key = where.companyId_employeeId_year_leaveType;
        return balances.find((b) => matches(b, key)) ?? null;
      },
      upsert: async ({ where, create, update }: { where: { companyId_employeeId_year_leaveType: Row }; create: Row; update: Row }) => {
        const existing = balances.find((b) => matches(b, where.companyId_employeeId_year_leaveType));
        if (existing) {
          Object.assign(existing, update);
          return existing;
        }
        const row = { ...create };
        balances.push(row);
        return row;
      },
    },
  };

  return { prisma, entries, balances, contracts };
}

const COMPANY = 'c1';
const ANNUAL_POLICY = {
  id: 'policy-1',
  rules: [
    {
      leaveType: LeaveType.ANNUAL,
      baseDays: 16,
      isProgressive: true,
      incrementDays: 1,
      incrementEveryYears: 2,
      minimumServiceMonths: 0,
      maxDaysCap: 30,
      maxCarryForwardDays: 5,
      requiresReceipt: false,
    },
  ],
};

function employee(overrides: Row = {}): Row {
  return {
    id: 'e1',
    companyId: COMPANY,
    employmentDate: d('2020-08-01'),
    excludedFromHrProcesses: false,
    leavePolicyId: ANNUAL_POLICY.id,
    leavePolicy: ANNUAL_POLICY,
    ...overrides,
  };
}

function contract(id: string, startDate: string, employeeId = 'e1'): Row {
  return { id, companyId: COMPANY, employeeId, startDate: d(startDate), deletedAt: null };
}

function build(seed: Parameters<typeof createFakePrisma>[0]) {
  const fake = createFakePrisma(seed);
  const audit = { create: jest.fn(async () => undefined) };
  const service = new LeaveLedgerService(fake.prisma as never, audit as never);
  const annual = (start: string): Row[] =>
    fake.entries.filter(
      (e) => e.leaveType === LeaveType.ANNUAL && (e.leaveYearStart as Date).getTime() === d(start).getTime(),
    );
  const sum = (rows: Row[]): number => rows.reduce((total, e) => total + Number(e.days), 0);
  return { ...fake, service, audit, annual, sum };
}

describe('leave year (employment anniversary)', () => {
  it('leave year follows employmentDate, not the calendar or contract start', () => {
    const year = leaveYearFor(d('2020-08-01'), d('2027-03-10'));
    expect(year.label).toBe(2026);
    expect(year.start).toEqual(d('2026-08-01'));
    expect(year.end).toEqual(d('2027-07-31'));
  });

  it('service years are full years since employmentDate', () => {
    expect(fullServiceYears(d('2020-08-01'), d('2025-07-31'))).toBe(4);
    expect(fullServiceYears(d('2020-08-01'), d('2025-08-01'))).toBe(5);
  });

  it('Feb 29 anniversaries fall on Feb 28 in non-leap years', () => {
    expect(anniversaryInYear(d('2020-02-29'), 2023)).toEqual(d('2023-02-28'));
    expect(isEmploymentAnniversary(d('2020-02-29'), d('2023-02-28'))).toBe(true);
    expect(isEmploymentAnniversary(d('2020-08-01'), d('2020-08-01'))).toBe(false);
  });

  it('carry-over is capped; the rest expires', () => {
    expect(planCarryOver(12, 5)).toEqual({ carriedIn: 5, expired: 7 });
    expect(planCarryOver(3, 5)).toEqual({ carriedIn: 3, expired: 0 });
    expect(planCarryOver(-2, 5)).toEqual({ carriedIn: 0, expired: 0 });
    expect(planCarryOver(8, null)).toEqual({ carriedIn: 8, expired: 0 });
  });
});

/** Runs `fn` with "today" set to `key` (activation depends on today's date). */
async function on<T>(key: string, fn: () => Promise<T>): Promise<T> {
  jest.setSystemTime(d(key));
  return fn();
}

const NO_CARRY_CAP_POLICY = {
  id: 'policy-2',
  rules: [{ ...ANNUAL_POLICY.rules[0]!, maxCarryForwardDays: null }],
};

describe('LeaveLedgerService - contract hook', () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(d('2026-10-30'));
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('a renewal opens a leave year on its start date, once (re-saving never grants twice)', async () => {
    const t = build({
      users: [employee()],
      contracts: [contract('k1', '2024-08-01'), contract('k2', '2025-08-01')],
    });
    const first = await on('2025-08-01', () => t.service.onContractActivated('k2', 'hr'));
    await t.service.onContractActivated('k2', 'hr');
    await t.service.onContractActivated('k2', 'hr');

    expect(first.renewal).toBe(true);
    expect(first.leaveYear?.start).toBe('2025-08-01');
    const grants = t.annual('2025-08-01').filter((e) => e.kind === 'ENTITLEMENT');
    expect(grants).toHaveLength(1);
    expect(grants[0]!.sourceContractId).toBe('k2');
  });

  it('a mid-year renewal starts a new leave year and carries the previous contract over', async () => {
    const t = build({
      users: [employee()],
      contracts: [contract('k1', '2025-08-01'), contract('k2', '2026-02-15')],
    });
    await on('2025-08-01', () => t.service.onContractActivated('k1', 'hr'));
    const result = await on('2026-02-15', () => t.service.onContractActivated('k2', 'hr'));

    expect(result.leaveYear).toEqual({ label: 2026, start: '2026-02-15', end: '2027-02-14' });
    const next = t.annual('2026-02-15');
    // Service counts from employmentDate 2020-08-01: 5 years → 18 days.
    expect(t.sum(next.filter((e) => e.kind === 'ENTITLEMENT'))).toBe(18);
    // k1's year (18 unused) closes: 5 carry (policy cap), 13 expire.
    expect(t.sum(next.filter((e) => e.kind === 'CARRY_OVER'))).toBe(5);
    expect(t.sum(t.annual('2025-08-01').filter((e) => e.kind === 'EXPIRED'))).toBe(-13);
  });

  it('the first contract opens its first leave year', async () => {
    const t = build({ users: [employee()], contracts: [contract('k1', '2026-03-01')] });
    const result = await on('2026-03-01', () => t.service.onContractActivated('k1', 'hr'));
    expect(result.renewal).toBe(false);
    expect(t.sum(t.annual('2026-03-01').filter((e) => e.kind === 'ENTITLEMENT'))).toBe(18);
  });

  it('a future start opens nothing until the day; the daily job opens it then', async () => {
    const t = build({
      users: [employee()],
      contracts: [contract('k1', '2025-08-01'), contract('k2', '2026-02-15')],
    });
    const early = await on('2026-01-10', () => t.service.onContractActivated('k2', 'hr'));
    expect(early.leaveYear).toBeNull();
    expect(t.annual('2026-02-15')).toHaveLength(0);

    expect(await t.service.openLeaveYearStartingOn('e1', COMPANY, d('2026-02-14'))).toBe(false);
    expect(await t.service.openLeaveYearStartingOn('e1', COMPANY, d('2026-02-15'))).toBe(true);
    expect(t.annual('2026-02-15').filter((e) => e.kind === 'ENTITLEMENT')).toHaveLength(1);
  });

  it('contract anniversaries (not employment anniversaries) start each leave year', async () => {
    // Two-year contract from 2025-03-01; employment anniversary is 1 August.
    const t = build({ users: [employee()], contracts: [contract('k1', '2025-03-01')] });
    await on('2025-03-01', () => t.service.onContractActivated('k1', 'hr'));

    expect(await t.service.openLeaveYearStartingOn('e1', COMPANY, d('2025-08-01'))).toBe(false);
    expect(await t.service.openLeaveYearStartingOn('e1', COMPANY, d('2026-03-01'))).toBe(true);
    const second = t.annual('2026-03-01');
    // 5 service years at 2026-03-01 (from 2020-08-01) → 18; first year's 18 unused → 5 carried.
    expect(t.sum(second.filter((e) => e.kind === 'ENTITLEMENT'))).toBe(18);
    expect(t.sum(second.filter((e) => e.kind === 'CARRY_OVER'))).toBe(5);
  });

  it('service-year step from the policy is applied at the right contract year', async () => {
    // 16 base, +1 every 2 service years: 4 yrs → 18, 5 yrs → 18, 6 yrs → 19.
    const t = build({
      users: [employee()],
      contracts: [
        contract('k0', '2020-08-01'),
        contract('k4', '2024-08-01'),
        contract('k5', '2025-08-01'),
        contract('k6', '2026-08-01'),
      ],
    });
    await on('2024-08-01', () => t.service.onContractActivated('k4', 'hr'));
    await on('2025-08-01', () => t.service.onContractActivated('k5', 'hr'));
    await on('2026-08-01', () => t.service.onContractActivated('k6', 'hr'));
    const grant = (start: string): number =>
      t.sum(t.annual(start).filter((e) => e.kind === 'ENTITLEMENT'));
    expect(grant('2024-08-01')).toBe(18);
    expect(grant('2025-08-01')).toBe(18);
    expect(grant('2026-08-01')).toBe(19);
  });

  it('carry-over is capped by the policy and the excess expires', async () => {
    const t = build({
      users: [employee()],
      contracts: [
        contract('k0', '2020-08-01'),
        contract('k4', '2024-08-01'),
        contract('k5', '2025-08-01'),
      ],
    });
    // Previous leave year (2024-08-01): 18 granted, 6 used → 12 unused.
    await on('2024-08-01', () => t.service.onContractActivated('k4', 'hr'));
    t.entries.push({
      id: 'u1', companyId: COMPANY, employeeId: 'e1', leaveType: LeaveType.ANNUAL,
      leaveYearStart: d('2024-08-01'), leaveYearEnd: d('2025-07-31'),
      kind: 'USED', days: -6, dedupeKey: 'USED:x',
    });
    await on('2025-08-01', () => t.service.onContractActivated('k5', 'hr'));

    const prev = t.annual('2024-08-01');
    const next = t.annual('2025-08-01');
    expect(t.sum(next.filter((e) => e.kind === 'CARRY_OVER'))).toBe(5);
    expect(t.sum(prev.filter((e) => e.kind === 'CARRY_OVER'))).toBe(-5);
    expect(t.sum(prev.filter((e) => e.kind === 'EXPIRED'))).toBe(-7);
    expect(t.sum(prev)).toBe(0);
    expect(t.sum(next)).toBe(18 + 5);
  });

  it('an HR-entered (imported) balance carries in full into the next contract', async () => {
    const t = build({
      users: [employee({ leavePolicyId: NO_CARRY_CAP_POLICY.id, leavePolicy: NO_CARRY_CAP_POLICY })],
      contracts: [contract('k4', '2024-08-01'), contract('k5', '2025-08-01')],
    });
    t.entries.push({
      id: 'o1', companyId: COMPANY, employeeId: 'e1', leaveType: LeaveType.ANNUAL,
      leaveYearStart: d('2024-08-01'), leaveYearEnd: d('2025-07-31'),
      kind: 'OPENING_BALANCE', days: 12.5, dedupeKey: 'OPENING:x', createdById: 'hr',
    });
    await on('2025-08-01', () => t.service.onContractActivated('k5', 'hr'));

    const next = t.annual('2025-08-01');
    expect(t.sum(next.filter((e) => e.kind === 'CARRY_OVER'))).toBe(12.5);
    expect(t.sum(next)).toBe(12.5 + 18);
  });

  it('a back-dated contract whose first leave year is over grants nothing', async () => {
    const t = build({ users: [employee()], contracts: [contract('k1', '2024-01-01')] });
    const result = await t.service.onContractActivated('k1', 'hr');
    expect(result.leaveYear).toBeNull();
    expect(t.entries).toHaveLength(0);
  });

  it('back-dated contract change recomputes only that contract’s entries; adjustments survive', async () => {
    const current = leaveYearFor(d('2020-08-01'), new Date());
    const startKey = current.start.toISOString().slice(0, 10);
    const t = build({
      users: [employee()],
      contracts: [contract('k1', `${current.label - 1}-08-01`), contract('k2', startKey)],
    });
    await t.service.onContractActivated('k2', 'hr');
    await t.service.addAdjustment({
      employeeId: 'e1', companyId: COMPANY, leaveType: LeaveType.ANNUAL,
      days: 2.5, reason: 'Overtime compensation', actorUserId: 'hr',
    });
    const before = t.sum(t.annual(startKey));

    await t.service.recomputeContractEntries('k2', 'hr');
    await t.service.recomputeContractEntries('k2', 'hr');

    const after = t.annual(startKey);
    expect(after.filter((e) => e.kind === 'ADJUSTMENT')).toHaveLength(1);
    expect(after.filter((e) => e.kind === 'ENTITLEMENT')).toHaveLength(1);
    expect(t.sum(after)).toBe(before);
    expect(t.audit.create).toHaveBeenCalledTimes(1);
  });

  it('recompute regenerates a past first leave year it had opened', async () => {
    const t = build({
      users: [employee()],
      contracts: [contract('k1', '2024-08-01'), contract('k2', '2025-08-01')],
    });
    await on('2025-08-01', () => t.service.onContractActivated('k2', 'hr'));
    jest.setSystemTime(d('2026-10-30'));
    await t.service.recomputeContractEntries('k2', 'hr');
    expect(t.annual('2025-08-01').filter((e) => e.kind === 'ENTITLEMENT')).toHaveLength(1);
  });

  it('excluded (approver-only) users get no entitlement', async () => {
    const t = build({
      users: [employee({ excludedFromHrProcesses: true })],
      contracts: [contract('k1', '2024-08-01'), contract('k2', '2025-08-01')],
    });
    await on('2025-08-01', () => t.service.onContractActivated('k2', 'hr'));
    await t.service.openLeaveYearForDate('e1', COMPANY, d('2025-08-01'), 'cron');
    expect(await t.service.openLeaveYearStartingOn('e1', COMPANY, d('2026-08-01'))).toBe(false);
    await t.service.ensureLeaveYear('e1', COMPANY, leaveYearFor(d('2020-08-01'), new Date()).label);
    expect(t.entries.filter((e) => e.kind === 'ENTITLEMENT')).toHaveLength(0);
  });
});

describe('LeaveLedgerService - renewal preview', () => {
  /** k4 opened 2024-08-01 with 18 days; 6 used → 12 unused before k5. */
  async function withUnusedTwelve(k5Start = '2025-08-01') {
    const t = build({
      users: [employee()],
      contracts: [
        contract('k0', '2020-08-01'),
        contract('k4', '2024-08-01'),
        contract('k5', k5Start),
      ],
    });
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    await on('2024-08-01', () => t.service.onContractActivated('k4', 'hr'));
    t.entries.push({
      id: 'u1', companyId: COMPANY, employeeId: 'e1', leaveType: LeaveType.ANNUAL,
      leaveYearStart: d('2024-08-01'), leaveYearEnd: d('2025-07-31'),
      kind: 'USED', days: -6, dedupeKey: 'USED:x',
    });
    return t;
  }
  afterEach(() => {
    jest.useRealTimers();
  });

  it('matches what activation then writes', async () => {
    const t = await withUnusedTwelve();
    const entriesBefore = t.entries.length;
    const preview = await t.service.previewRenewal('e1', COMPANY, d('2025-08-01'));
    expect(preview).toMatchObject({
      isRenewal: true,
      alreadyOpen: false,
      currentRemaining: 12,
      carryForward: 5,
      expired: 7,
      serviceYears: 5,
      newEntitlement: 18,
      projectedOpeningBalance: 23,
    });
    expect(preview.newYear.start).toBe('2025-08-01');
    expect(t.entries).toHaveLength(entriesBefore); // preview wrote nothing

    await on('2025-08-01', () => t.service.onContractActivated('k5', 'hr'));
    expect(t.sum(t.annual('2025-08-01'))).toBe(preview.projectedOpeningBalance);
  });

  it('a mid-year renewal previews a leave year starting on the contract start', async () => {
    const t = await withUnusedTwelve('2025-03-01');
    const preview = await t.service.previewRenewal('e1', COMPANY, d('2025-03-01'));
    expect(preview.newYear).toEqual({ label: 2025, start: '2025-03-01', end: '2026-02-28' });
    expect(preview.currentYear.start).toBe('2024-08-01');
    expect(preview.serviceYears).toBe(4);

    await on('2025-03-01', () => t.service.onContractActivated('k5', 'hr'));
    expect(t.sum(t.annual('2025-03-01'))).toBe(preview.projectedOpeningBalance);
  });

  it('after the leave year is open, reports the recorded figures', async () => {
    const t = await withUnusedTwelve();
    await on('2025-08-01', () => t.service.onContractActivated('k5', 'hr'));
    const preview = await t.service.previewRenewal('e1', COMPANY, d('2025-08-01'));
    expect(preview).toMatchObject({
      alreadyOpen: true,
      carryForward: 5,
      newEntitlement: 18,
      projectedOpeningBalance: 23,
    });
  });

  it('a first contract is not a renewal', async () => {
    const t = build({ users: [employee()], contracts: [] });
    const preview = await t.service.previewRenewal('e1', COMPANY, d('2025-08-01'));
    expect(preview.isRenewal).toBe(false);
  });
});

describe('LeaveLedgerService - HR entries and used days', () => {
  it('opening balance + used = expected; the cache matches the ledger', async () => {
    const leave = {
      id: 'lv1', companyId: COMPANY, employeeId: 'e1', leaveType: LeaveType.ANNUAL,
      startDate: new Date(), days: 2.5, requestNumber: 'LR-1',
    };
    const t = build({ users: [employee()], leaves: [leave] });
    await t.service.setOpeningBalance({
      employeeId: 'e1', companyId: COMPANY, leaveType: LeaveType.ANNUAL,
      days: 10, reason: 'Go-live balance', actorUserId: 'hr',
    });
    await t.service.recordLeaveUsed('lv1');
    await t.service.recordLeaveUsed('lv1'); // approval event delivered twice

    const label = leaveYearFor(d('2020-08-01'), new Date()).label;
    expect(await t.service.balance('e1', COMPANY, LeaveType.ANNUAL, label)).toBe(7.5);
    const cache = t.balances.find((b) => b.leaveType === LeaveType.ANNUAL && b.year === label)!;
    expect(Number(cache.entitled)).toBe(10);
    expect(Number(cache.used)).toBe(2.5);

    await expect(
      t.service.setOpeningBalance({
        employeeId: 'e1', companyId: COMPANY, leaveType: LeaveType.ANNUAL,
        days: 3, reason: 'again', actorUserId: 'hr',
      }),
    ).rejects.toThrow('Use Adjust balance instead');
  });

  it('cancelling approved leave reverses its used days once', async () => {
    const leave = {
      id: 'lv2', companyId: COMPANY, employeeId: 'e1', leaveType: LeaveType.ANNUAL,
      startDate: new Date(), days: 3, requestNumber: 'LR-2',
    };
    const t = build({ users: [employee()], leaves: [leave] });
    const label = leaveYearFor(d('2020-08-01'), new Date()).label;
    await t.service.recordLeaveUsed('lv2');
    expect(await t.service.balance('e1', COMPANY, LeaveType.ANNUAL, label)).toBe(-3);
    await t.service.reverseLeaveUsed('lv2', 'hr');
    await t.service.reverseLeaveUsed('lv2', 'hr');
    expect(await t.service.balance('e1', COMPANY, LeaveType.ANNUAL, label)).toBe(0);
  });

  it('unpaid leave does not write USED entries against annual balance', async () => {
    const leave = {
      id: 'lv-unpaid',
      companyId: COMPANY,
      employeeId: 'e1',
      leaveType: LeaveType.UNPAID,
      startDate: new Date(),
      days: 5,
      requestNumber: 'LR-U',
    };
    const t = build({ users: [employee()], leaves: [leave] });
    await t.service.setOpeningBalance({
      employeeId: 'e1',
      companyId: COMPANY,
      leaveType: LeaveType.ANNUAL,
      days: 20,
      reason: 'Go-live balance',
      actorUserId: 'hr',
    });
    await t.service.recordLeaveUsed('lv-unpaid');
    const label = leaveYearFor(d('2020-08-01'), new Date()).label;
    expect(await t.service.balance('e1', COMPANY, LeaveType.ANNUAL, label)).toBe(
      20,
    );
    expect(t.entries.filter((e) => e.sourceLeaveRequestId === 'lv-unpaid')).toHaveLength(
      0,
    );
  });

  it('adjustments must be non-zero 0.5 steps with a reason', async () => {
    const t = build({ users: [employee()] });
    const base = { employeeId: 'e1', companyId: COMPANY, leaveType: LeaveType.ANNUAL, actorUserId: 'hr' };
    await expect(t.service.addAdjustment({ ...base, days: 0.3, reason: 'x y z' })).rejects.toThrow('0.5');
    await expect(t.service.addAdjustment({ ...base, days: 0, reason: 'x y z' })).rejects.toThrow('0.5');
    await expect(t.service.addAdjustment({ ...base, days: 1, reason: '  ' })).rejects.toThrow('reason');
    const entry = await t.service.addAdjustment({ ...base, days: -1.5, reason: 'Correction' });
    expect(entry.kind).toBe('ADJUSTMENT');
    expect(entry.days).toBe(-1.5);
  });

  it('approved leave with a Saturday deducts 0.5 for the Saturday', async () => {
    // Fri 2026-10-09 + Sat 2026-10-10 (half day) + Sun 2026-10-11 (off).
    const schedule = (date: Date) => {
      const dow = date.getUTCDay();
      if (dow === 0) return { isWorkingDay: false, isHalfDay: false };
      return { isWorkingDay: true, isHalfDay: dow === 6 };
    };
    const counted = calculateLeaveDaysForRange(d('2026-10-09'), d('2026-10-11'), schedule, []);
    expect(Number(counted.totalDays)).toBe(1.5);

    const leave = {
      id: 'lv3', companyId: COMPANY, employeeId: 'e1', leaveType: LeaveType.ANNUAL,
      startDate: d('2026-10-09'), days: Number(counted.totalDays), requestNumber: 'LR-3',
    };
    const t = build({ users: [employee()], leaves: [leave] });
    await t.service.recordLeaveUsed('lv3');
    const used = t.entries.find((e) => e.kind === 'USED')!;
    expect(Number(used.days)).toBe(-1.5);
    expect(used.leaveYearStart).toEqual(d('2026-08-01'));
  });
});
