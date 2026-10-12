import {
  assertNoLockedPayrollMonths,
  firstDayOfMonthUtc,
  getEarliestAllowedDate,
  isLateSubmissionDate,
  requiresLateReason,
} from './earliest-allowed-date.util';

function locked(...keys: string[]): Set<string> {
  return new Set(keys);
}

describe('getEarliestAllowedDate', () => {
  const today = new Date(Date.UTC(2026, 9, 10)); // Oct 10 2026

  it('employee Oct 10 → Sep 1 allowed earliest when Sep not locked', () => {
    const earliest = getEarliestAllowedDate({
      today,
      lockedMonths: locked(),
      actorKind: 'EMPLOYEE_SELF',
    });
    expect(earliest.toISOString().slice(0, 10)).toBe('2026-09-01');
  });

  it('employee when Sep payroll is locked → Oct 1 earliest', () => {
    const earliest = getEarliestAllowedDate({
      today,
      lockedMonths: locked('2026-09'),
      actorKind: 'EMPLOYEE_SELF',
    });
    expect(earliest.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('HR on behalf with Sep locked → Oct 1 earliest', () => {
    const earliest = getEarliestAllowedDate({
      today,
      lockedMonths: locked('2026-09'),
      actorKind: 'HR_ON_BEHALF',
    });
    expect(earliest.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('HR on behalf with no locked months → open history', () => {
    const earliest = getEarliestAllowedDate({
      today,
      lockedMonths: locked(),
      actorKind: 'HR_ON_BEHALF',
    });
    expect(earliest.getUTCFullYear()).toBe(2000);
  });
});

describe('locked month rejection', () => {
  it('rejects any date in a locked month', () => {
    expect(() =>
      assertNoLockedPayrollMonths(
        [firstDayOfMonthUtc(8, 2026)],
        locked('2026-08'),
      ),
    ).toThrow(/finalised/);
  });
});

describe('late submission', () => {
  const today = new Date(Date.UTC(2026, 9, 10));

  it('August date in October is late', () => {
    expect(isLateSubmissionDate(firstDayOfMonthUtc(8, 2026), today)).toBe(true);
  });

  it('HR on behalf August requires late reason', () => {
    expect(
      requiresLateReason({
        actorKind: 'HR_ON_BEHALF',
        primaryDate: firstDayOfMonthUtc(8, 2026),
        today,
      }),
    ).toBe(true);
  });

  it('employee self does not require late reason flag', () => {
    expect(
      requiresLateReason({
        actorKind: 'EMPLOYEE_SELF',
        primaryDate: firstDayOfMonthUtc(8, 2026),
        today,
      }),
    ).toBe(false);
  });
});
