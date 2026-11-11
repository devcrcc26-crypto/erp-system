import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { EmploymentLifecycleService } from './employment-lifecycle.service';
import { todayInAddisUtc } from '../../../../shared/employment/separation-dates.util';
import { leaveYearFor } from '../../../leave-policy/application/utils/leave-year.util';

const COMPANY = 'company-1';
const HR = 'hr-1';
const EMP = 'emp-1';
const DAY = 86_400_000;
const d = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));
const ymd = (date: Date): string => date.toISOString().slice(0, 10);

interface InactiveRow {
  id: string;
  userId: string;
  type: 'SUSPENDED' | 'LONG_LEAVE' | 'OTHER';
  fromDate: Date;
  toDate: Date | null;
  reason: string;
  createdAt: Date;
  endedAt: Date | null;
  loginDisabledByInactive: boolean;
}

interface State {
  user: {
    id: string;
    companyId: string;
    employmentDate: Date;
    employmentStatus: 'ACTIVE' | 'INACTIVE' | 'SEPARATED';
    isActive: boolean;
    mustChangePassword?: boolean;
  };
  periods: Array<{ id: string; userId: string; startDate: Date; endDate: Date | null }>;
  inactive: InactiveRow[];
  sessions: number;
  contracts: Array<Record<string, unknown>>;
}

function makeState(overrides: Partial<State> = {}): State {
  return {
    user: { id: EMP, companyId: COMPANY, employmentDate: d(2024, 3, 1), employmentStatus: 'ACTIVE', isActive: true },
    periods: [{ id: 'p1', userId: EMP, startDate: d(2024, 3, 1), endDate: null }],
    inactive: [],
    sessions: 2,
    contracts: [],
    ...overrides,
  };
}

const overlaps = (row: InactiveRow, where: any): boolean => {
  if (where.fromDate?.lte && row.fromDate > where.fromDate.lte) return false;
  if (where.OR) {
    return where.OR.some((c: any) =>
      c.toDate === null ? row.toDate === null : row.toDate !== null && row.toDate >= c.toDate.gte,
    );
  }
  return true;
};

function makeService(state: State) {
  const prisma: any = {
    user: {
      findFirst: jest.fn(async () => ({ ...state.user })),
      findUnique: jest.fn(async () => ({ ...state.user })),
      update: jest.fn(async ({ data }: any) => Object.assign(state.user, data)),
    },
    employmentPeriod: {
      findFirst: jest.fn(async () => state.periods.find((p) => p.endDate === null) ?? null),
      findMany: jest.fn(async () =>
        [...state.periods].sort((a, b) => b.startDate.getTime() - a.startDate.getTime()),
      ),
      create: jest.fn(async ({ data }: any) => {
        const row = { id: `p${state.periods.length + 1}`, endDate: null, ...data };
        state.periods.push(row);
        return row;
      }),
    },
    inactivePeriod: {
      findFirst: jest.fn(async ({ where }: any) => state.inactive.find((r) => overlaps(r, where)) ?? null),
      // Same object references, as Prisma rows are passed to inactiveSpanOn.
      findMany: jest.fn(async () => state.inactive),
      create: jest.fn(async ({ data }: any) => {
        const row: InactiveRow = {
          id: `i${state.inactive.length + 1}`,
          createdAt: new Date(),
          endedAt: null,
          loginDisabledByInactive: false,
          ...data,
        };
        state.inactive.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }: any) =>
        Object.assign(state.inactive.find((r) => r.id === where.id)!, data),
      ),
      updateMany: jest.fn(async ({ where, data }: any) => {
        state.inactive.filter((r) => where.id.in.includes(r.id)).forEach((r) => Object.assign(r, data));
      }),
      delete: jest.fn(async ({ where }: any) => {
        state.inactive = state.inactive.filter((r) => r.id !== where.id);
      }),
    },
    userSession: { deleteMany: jest.fn(async () => { state.sessions = 0; }) },
    payrollRun: { findMany: jest.fn(async () => []), updateMany: jest.fn() },
    policySetting: { findMany: jest.fn(async () => []) },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const audit = { create: jest.fn(async () => undefined), buildFromRequestContext: (x: any) => x };
  const notifications = { send: jest.fn(async () => undefined) };
  const attendance = { recalculateEmployeeAttendanceFromDate: jest.fn(async () => undefined) };
  const contracts = {
    createContract: jest.fn(async (dto: any) => {
      state.contracts.push(dto);
      return dto;
    }),
  };
  const passwords = { hash: jest.fn(async (p: string) => `hash:${p}`) };
  const service = new EmploymentLifecycleService(
    prisma,
    audit as any,
    notifications as any,
    attendance as any,
    contracts as any,
    passwords as any,
  );
  return { service, prisma, audit, attendance, contracts };
}

const ctx = { companyId: COMPANY, userId: HR };

describe('EmploymentLifecycleService', () => {
  describe('inactive periods', () => {
    it('suspension (unpaid, no login by default): INACTIVE, login blocked, sessions revoked, audited, attendance recalculated', async () => {
      const state = makeState();
      const { service, audit, attendance } = makeService(state);
      const today = todayInAddisUtc();
      const from = new Date(today.getTime() - 2 * DAY);
      const to = new Date(today.getTime() + 7 * DAY); // 10 days

      await service.setInactive(ctx, EMP, {
        type: 'SUSPENDED',
        fromDate: ymd(from),
        toDate: ymd(to),
        reason: 'Disciplinary suspension',
      });

      expect(state.user.employmentStatus).toBe('INACTIVE');
      expect(state.user.isActive).toBe(false);
      expect(state.sessions).toBe(0);
      expect(state.inactive[0].loginDisabledByInactive).toBe(true);
      expect(attendance.recalculateEmployeeAttendanceFromDate).toHaveBeenCalledWith(EMP, COMPANY, from);
      expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'set_inactive' }));
    });

    it('long leave keeps login (inactiveCanLogin.LONG_LEAVE = true by default)', async () => {
      const state = makeState();
      const { service } = makeService(state);
      const today = todayInAddisUtc();
      await service.setInactive(ctx, EMP, {
        type: 'LONG_LEAVE',
        fromDate: ymd(today),
        reason: 'Extended medical leave',
      });
      expect(state.user.employmentStatus).toBe('INACTIVE');
      expect(state.user.isActive).toBe(true);
      expect(state.sessions).toBe(2);
    });

    it('a future period changes nothing until the daily job reaches its start', async () => {
      const state = makeState();
      const { service } = makeService(state);
      const today = todayInAddisUtc();
      const from = new Date(today.getTime() + 3 * DAY);
      await service.setInactive(ctx, EMP, { type: 'SUSPENDED', fromDate: ymd(from), reason: 'Upcoming' });
      expect(state.user.employmentStatus).toBe('ACTIVE');
      expect(state.user.isActive).toBe(true);

      await service.applyInactiveStatus(EMP, from);
      expect(state.user.employmentStatus).toBe('INACTIVE');
      expect(state.user.isActive).toBe(false);
    });

    it('reactivate ends the period and restores the login it had turned off', async () => {
      const state = makeState();
      const { service, audit } = makeService(state);
      const today = todayInAddisUtc();
      await service.setInactive(ctx, EMP, {
        type: 'SUSPENDED',
        fromDate: ymd(new Date(today.getTime() - 5 * DAY)),
        reason: 'Suspension',
      });
      expect(state.user.isActive).toBe(false);

      await service.reactivate(ctx, EMP);
      expect(state.inactive[0].toDate).toEqual(new Date(today.getTime() - DAY));
      expect(state.user.employmentStatus).toBe('ACTIVE');
      expect(state.user.isActive).toBe(true);
      expect(state.inactive[0].loginDisabledByInactive).toBe(false);
      expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'reactivate' }));
    });

    it('reactivate never re-enables a login that HR disabled for another reason', async () => {
      const state = makeState({ user: { ...makeState().user, isActive: false } });
      const { service } = makeService(state);
      const today = todayInAddisUtc();
      await service.setInactive(ctx, EMP, {
        type: 'SUSPENDED',
        fromDate: ymd(today),
        reason: 'Suspension',
      });
      expect(state.inactive[0].loginDisabledByInactive).toBe(false);
      await service.reactivate(ctx, EMP);
      expect(state.user.isActive).toBe(false);
    });

    it('rejects overlapping periods, separated employees and missing reasons', async () => {
      const state = makeState();
      const { service } = makeService(state);
      const today = todayInAddisUtc();
      await service.setInactive(ctx, EMP, { type: 'OTHER', fromDate: ymd(today), reason: 'First' });
      await expect(
        service.setInactive(ctx, EMP, { type: 'OTHER', fromDate: ymd(new Date(today.getTime() + DAY)), reason: 'Second' }),
      ).rejects.toThrow('overlaps');
      await expect(
        service.setInactive(ctx, EMP, { type: 'OTHER', fromDate: ymd(today), reason: '  ' }),
      ).rejects.toBeInstanceOf(BadRequestException);

      const separated = makeState({ user: { ...makeState().user, employmentStatus: 'SEPARATED' } });
      await expect(
        makeService(separated).service.setInactive(ctx, EMP, { type: 'OTHER', fromDate: ymd(today), reason: 'x' }),
      ).rejects.toThrow('Separated');
    });
  });

  describe('rehire', () => {
    const separatedState = (): State =>
      makeState({
        user: { id: EMP, companyId: COMPANY, employmentDate: d(2022, 5, 1), employmentStatus: 'SEPARATED', isActive: false },
        periods: [{ id: 'p1', userId: EMP, startDate: d(2022, 5, 1), endDate: d(2025, 6, 30) }],
      });
    const input = {
      startDate: '2026-11-02',
      signedAt: '2026-10-20',
      contractType: 'FIXED_TERM' as const,
      endDate: '2027-11-01',
      basicSalary: 15000,
      reason: 'Returning to the project',
    };

    it('new period + contract, employmentDate = new start, old period kept, login re-enabled with a temporary password', async () => {
      const state = separatedState();
      const { service, contracts, audit } = makeService(state);
      const result = await service.rehire(ctx, EMP, input);

      expect(contracts.createContract).toHaveBeenCalledWith(
        expect.objectContaining({ employeeId: EMP, startDate: '2026-11-02', basicSalary: 15000 }),
        COMPANY,
        HR,
      );
      expect(state.periods).toHaveLength(2);
      expect(state.periods[0]).toMatchObject({ id: 'p1', endDate: d(2025, 6, 30) });
      expect(state.periods[1]).toMatchObject({ startDate: d(2026, 11, 2), endDate: null });
      expect(state.user).toMatchObject({
        employmentDate: d(2026, 11, 2),
        employmentStatus: 'ACTIVE',
        isActive: true,
        mustChangePassword: true,
      });
      expect(result.mustChangePassword).toBe(true);
      expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);
      expect((state.user as any).passwordHash).toBe(`hash:${result.temporaryPassword}`);
      expect(audit.create).toHaveBeenCalledWith(expect.objectContaining({ action: 'rehire' }));

      // Leave years now run from the new employment date.
      const year = leaveYearFor(state.user.employmentDate, '2027-01-15');
      expect(ymd(new Date(year.start))).toBe('2026-11-02');
    });

    it('only separated employees, and only after the last working day', async () => {
      await expect(makeService(makeState()).service.rehire(ctx, EMP, input)).rejects.toThrow(
        'Only separated employees',
      );
      await expect(
        makeService(separatedState()).service.rehire(ctx, EMP, { ...input, startDate: '2025-06-30' }),
      ).rejects.toThrow('after the last working day (2025-06-30)');
    });
  });
});
