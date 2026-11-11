import {
  countCalendarDaysOverlap,
  unpaidLeaveDateKeysInRange,
  unpaidLeaveDaysStillToDeduct,
} from './payroll-unpaid-leave.util';

function d(y: number, m: number, day: number): Date {
  return new Date(Date.UTC(y, m - 1, day));
}

describe('payroll-unpaid-leave.util', () => {
  it('counts full-month unpaid leave as calendar days in the month', () => {
    const monthStart = d(2026, 9, 1);
    const monthEnd = d(2026, 9, 30);
    expect(
      countCalendarDaysOverlap(
        [{ startDate: d(2026, 9, 1), endDate: d(2026, 9, 30) }],
        monthStart,
        monthEnd,
      ),
    ).toBe(30);
  });

  it('counts partial unpaid leave overlapping the month', () => {
    expect(
      countCalendarDaysOverlap(
        [{ startDate: d(2026, 9, 11), endDate: d(2026, 9, 20) }],
        d(2026, 9, 1),
        d(2026, 9, 30),
      ),
    ).toBe(10);
  });

  it('does not double-count days already UNPAID_LEAVE or absent', () => {
    const keys = unpaidLeaveDateKeysInRange(
      [{ startDate: d(2026, 9, 1), endDate: d(2026, 9, 3) }],
      d(2026, 9, 1),
      d(2026, 9, 30),
    );
    expect(
      unpaidLeaveDaysStillToDeduct({
        unpaidDateKeys: keys,
        dailyLogs: [
          { date: d(2026, 9, 1), dayDeduction: 1, dayStatus: 'UNPAID_LEAVE' },
          { date: d(2026, 9, 2), dayDeduction: 1, dayStatus: 'ABSENT' },
          { date: d(2026, 9, 3), dayDeduction: 0, dayStatus: 'LEAVE' },
        ],
      }),
    ).toBe(1);
  });

  it('with no attendance logs, deducts all unpaid calendar days', () => {
    const keys = unpaidLeaveDateKeysInRange(
      [{ startDate: d(2026, 9, 1), endDate: d(2026, 9, 10) }],
      d(2026, 9, 1),
      d(2026, 9, 30),
    );
    expect(
      unpaidLeaveDaysStillToDeduct({ unpaidDateKeys: keys, dailyLogs: null }),
    ).toBe(10);
  });
});
