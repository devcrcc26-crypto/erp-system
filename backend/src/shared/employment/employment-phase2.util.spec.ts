import { describe, expect, it, jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import {
  assertNotInUnpaidInactivePeriod,
  assertWithinEmploymentWindow,
  datesInRange,
  findDateOutsideEmployment,
} from './employment-guard.util';
import { inactiveDaysByType, inactiveSpanOn, type InactiveSpan } from './inactive-period.util';
import { isVacantApprover, vacantApproverMessage } from './vacant-approver.util';
import {
  contractHoldoverEndedOn,
  resolveEmploymentWindow,
  withContractHoldover,
} from './employment-window.util';

const d = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));

describe('findDateOutsideEmployment (requests outside the employment window)', () => {
  const periods = [{ startDate: d(2024, 1, 1), endDate: d(2026, 10, 5) }];

  it('OT after leaving → "Outside employment period (last working day …)"', () => {
    expect(findDateOutsideEmployment(periods, d(2024, 1, 1), [d(2026, 10, 8)])).toBe(
      'Outside employment period (last working day 2026-10-05)',
    );
  });

  it('the last working day itself is allowed', () => {
    expect(findDateOutsideEmployment(periods, d(2024, 1, 1), [d(2026, 10, 5)])).toBeNull();
  });

  it('a day in the gap between two periods is rejected with the earlier leaving date', () => {
    const rehired = [...periods, { startDate: d(2026, 12, 1), endDate: null }];
    expect(findDateOutsideEmployment(rehired, d(2026, 12, 1), [d(2026, 11, 15)])).toBe(
      'Outside employment period (last working day 2026-10-05)',
    );
    expect(findDateOutsideEmployment(rehired, d(2026, 12, 1), [d(2026, 12, 2)])).toBeNull();
  });

  it('before the first employment start', () => {
    expect(findDateOutsideEmployment(periods, d(2024, 1, 1), [d(2023, 12, 31)])).toBe(
      'Outside employment period (employment starts 2024-01-01)',
    );
  });

  it('users not yet backfilled fall back to employmentDate, open-ended', () => {
    expect(findDateOutsideEmployment([], d(2025, 1, 1), [d(2030, 1, 1)])).toBeNull();
    expect(findDateOutsideEmployment([], d(2025, 1, 1), [d(2024, 12, 31)])).toMatch(/employment starts/);
  });
});

describe('inactive periods', () => {
  const suspension: InactiveSpan = { type: 'SUSPENDED', fromDate: d(2026, 11, 3), toDate: d(2026, 11, 12) };

  it('10-day suspension counts 10 days in the month', () => {
    const days = inactiveDaysByType([suspension], d(2026, 11, 1), d(2026, 11, 30));
    expect(days.get('SUSPENDED')).toBe(10);
  });

  it('an open period runs to the end of the range; latest start wins on overlap', () => {
    const open: InactiveSpan = { type: 'LONG_LEAVE', fromDate: d(2026, 11, 10), toDate: null };
    expect(inactiveSpanOn(d(2026, 11, 11), [suspension, open])).toBe(open);
    const days = inactiveDaysByType([suspension, open], d(2026, 11, 1), d(2026, 11, 30));
    expect(days.get('SUSPENDED')).toBe(7);
    expect(days.get('LONG_LEAVE')).toBe(21);
  });
});

describe('vacant approvers', () => {
  it('inactive, separated, login-disabled or deleted users are vacant', () => {
    expect(isVacantApprover({ isActive: true, employmentStatus: 'ACTIVE', deletedAt: null })).toBe(false);
    expect(isVacantApprover({ isActive: true, employmentStatus: 'INACTIVE', deletedAt: null })).toBe(true);
    expect(isVacantApprover({ isActive: true, employmentStatus: 'SEPARATED', deletedAt: null })).toBe(true);
    expect(isVacantApprover({ isActive: false, employmentStatus: 'ACTIVE', deletedAt: null })).toBe(true);
    expect(isVacantApprover({ isActive: true, employmentStatus: 'ACTIVE', deletedAt: new Date() })).toBe(true);
    expect(vacantApproverMessage('Department Head')).toBe('Approver position vacant: Department Head - ask HR');
  });
});

describe('contract ended without a new contract (never auto-separated)', () => {
  const openWindow = resolveEmploymentWindow([{ startDate: d(2025, 1, 1), endDate: null }], d(2025, 1, 1), 11, 2026);
  const ended = { id: 'c1', startDate: d(2025, 1, 1), endDate: d(2026, 9, 30), terminatedAt: null };

  it('later months keep the employee on the ended contract (still employed, still paid)', () => {
    const result = withContractHoldover([], ended, openWindow, d(2026, 11, 30));
    expect(result.endedOn).toEqual(d(2026, 9, 30));
    expect(result.contracts).toEqual([{ ...ended, endDate: null }]);
  });

  it('the expiry month itself is extended to the month end', () => {
    const october = resolveEmploymentWindow([{ startDate: d(2025, 1, 1), endDate: null }], d(2025, 1, 1), 10, 2026);
    const midMonth = { ...ended, endDate: d(2026, 10, 15) };
    const result = withContractHoldover([midMonth], midMonth, october, d(2026, 10, 31));
    expect(result.endedOn).toEqual(d(2026, 10, 15));
    expect(result.contracts[0].endDate).toBeNull();
  });

  it('no holdover once separated, when terminated, when renewed, or for legacy users without periods', () => {
    const separated = resolveEmploymentWindow(
      [{ startDate: d(2025, 1, 1), endDate: d(2026, 9, 30) }],
      d(2025, 1, 1),
      9,
      2026,
    );
    expect(contractHoldoverEndedOn(separated, ended, d(2026, 9, 30))).toBeNull();
    expect(contractHoldoverEndedOn(openWindow, { ...ended, terminatedAt: d(2026, 9, 30) }, d(2026, 11, 30))).toBeNull();
    // Renewed: the latest contract is the new one, still running.
    expect(contractHoldoverEndedOn(openWindow, { endDate: null, terminatedAt: null }, d(2026, 11, 30))).toBeNull();
    const legacy = resolveEmploymentWindow([], d(2025, 1, 1), 11, 2026);
    expect(contractHoldoverEndedOn(legacy, ended, d(2026, 11, 30))).toBeNull();
  });

  it('separation later in the month caps the held-over contract at the leaving date', () => {
    const leaving = resolveEmploymentWindow(
      [{ startDate: d(2025, 1, 1), endDate: d(2026, 11, 20) }],
      d(2025, 1, 1),
      11,
      2026,
    );
    const result = withContractHoldover([], ended, leaving, d(2026, 11, 30));
    expect(result.contracts[0].endDate).toEqual(d(2026, 11, 20));
  });
});

describe('request guards (overtime, leave, per diem, … share these)', () => {
  const db = (overrides: Record<string, unknown> = {}): any => ({
    user: { findUnique: jest.fn(async () => ({ employmentDate: d(2024, 1, 1) })) },
    employmentPeriod: {
      findMany: jest.fn(async () => [{ startDate: d(2024, 1, 1), endDate: d(2026, 10, 5) }]),
    },
    inactivePeriod: {
      findMany: jest.fn(async () => [{ type: 'SUSPENDED', fromDate: d(2026, 9, 1), toDate: d(2026, 9, 10) }]),
    },
    policySetting: { findMany: jest.fn(async () => []) },
    ...overrides,
  });

  it('OT after leaving → 400 "Outside employment period (last working day …)"', async () => {
    const error = await assertWithinEmploymentWindow(db(), 'emp-1', [d(2026, 10, 6)]).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getStatus()).toBe(400);
    expect((error as Error).message).toBe('Outside employment period (last working day 2026-10-05)');
  });

  it('a leave range that runs past the last working day is rejected', async () => {
    await expect(
      assertWithinEmploymentWindow(db(), 'emp-1', datesInRange(d(2026, 10, 3), d(2026, 10, 7))),
    ).rejects.toThrow('last working day 2026-10-05');
    await expect(
      assertWithinEmploymentWindow(db(), 'emp-1', datesInRange(d(2026, 10, 1), d(2026, 10, 5))),
    ).resolves.toBeUndefined();
  });

  it('OT inside an unpaid inactive period is rejected; outside it is fine', async () => {
    await expect(assertNotInUnpaidInactivePeriod(db(), 'co-1', 'emp-1', [d(2026, 9, 4)])).rejects.toThrow(
      /inactive \(suspended, unpaid\)/,
    );
    await expect(
      assertNotInUnpaidInactivePeriod(db(), 'co-1', 'emp-1', [d(2026, 9, 11)]),
    ).resolves.toBeUndefined();
  });
});
