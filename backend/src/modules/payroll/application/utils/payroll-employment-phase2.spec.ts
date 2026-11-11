import { describe, expect, it } from '@jest/globals';
import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';
import { resolveEmploymentWindow } from '../../../../shared/employment/employment-window.util';
import {
  CONTRACT_ENDED_NOT_RENEWED_NOTE,
  LEAVER_FINAL_MONTH_NOTE,
  resolveEmploymentEntryFlag,
} from './payroll-employment-flag.util';
import { computeFinalSettlement, serviceYears } from './payroll-final-settlement.util';
import { summarizeMonthAbsence, type DayDeductionContext } from '../../../attendance/application/utils/day-deduction.util';
import { PayrollCalculationService } from '../services/payroll-calculation.service';

const d = (y: number, m: number, day: number): Date => new Date(Date.UTC(y, m - 1, day));

const openWindow = resolveEmploymentWindow([{ startDate: d(2024, 1, 1), endDate: null }], d(2024, 1, 1), 11, 2026);
const leaverWindow = resolveEmploymentWindow(
  [{ startDate: d(2021, 11, 21), endDate: d(2026, 11, 20) }],
  d(2021, 11, 21),
  11,
  2026,
);

function presentEveryDay(overrides: Partial<DayDeductionContext> = {}): DayDeductionContext {
  return {
    isSunday: (date) => date.getUTCDay() === 0,
    isPublicHoliday: () => false,
    isWorkFromHome: () => false,
    siteNameForDate: () => null,
    isOnApprovedLeave: () => false,
    isOnUnpaidLeave: () => false,
    fieldMovementCoverage: () => 'NONE',
    earlyDepartureWaiver: () => 'NONE',
    // Exempt = present without scans, so only the inactive days can deduct.
    isAttendanceExempt: () => true,
    ...overrides,
  };
}

describe('inactive period in attendance and payroll', () => {
  const suspended = (date: Date): boolean => date >= d(2026, 11, 3) && date <= d(2026, 11, 12);

  it('10 days unpaid suspension: days are INACTIVE (not absent) and deducted like unpaid leave', () => {
    const summary = summarizeMonthAbsence({
      month: 11,
      year: 2026,
      contracts: [{ startDate: d(2024, 1, 1), endDate: null }],
      dailyLogsByDate: new Map(),
      context: presentEveryDay({
        inactiveForDate: (date) => (suspended(date) ? { paid: POLICY_DEFAULTS.inactivePaid.SUSPENDED } : null),
      }),
    });
    expect(summary.byDate.get('2026-11-05')?.status).toBe('INACTIVE');
    expect(summary.inactiveDays).toBe(10);
    expect(summary.inactiveUnpaidDays).toBe(10);
    expect(summary.unpaidLeaveDays).toBe(10);
    expect(summary.absentDays).toBe(0);
    expect(summary.paidDays).toBe(20);
  });

  it('a paid inactive type deducts nothing', () => {
    const summary = summarizeMonthAbsence({
      month: 11,
      year: 2026,
      contracts: [{ startDate: d(2024, 1, 1), endDate: null }],
      dailyLogsByDate: new Map(),
      context: presentEveryDay({ inactiveForDate: (date) => (suspended(date) ? { paid: true } : null) }),
    });
    expect(summary.inactiveDays).toBe(10);
    expect(summary.unpaidLeaveDays).toBe(0);
    expect(summary.paidDays).toBe(30);
  });

  it('payroll entry is flagged INACTIVE_IN_MONTH with the days, and not as login-disabled', () => {
    const result = resolveEmploymentEntryFlag({
      baseFlag: 'NONE',
      window: openWindow,
      isActive: false,
      inactiveNote: 'Inactive (Suspended) 10 day(s) - unpaid',
    });
    expect(result.flag).toBe('INACTIVE_IN_MONTH');
    expect(result.flagNote).toBe('Inactive (Suspended) 10 day(s) - unpaid');
  });
});

describe('contract ended without a new contract', () => {
  it('flags CONTRACT_ENDED_NOT_RENEWED with the end date', () => {
    const result = resolveEmploymentEntryFlag({
      baseFlag: 'NONE',
      window: openWindow,
      isActive: true,
      contractEndedOn: d(2026, 9, 30),
    });
    expect(result.flag).toBe('CONTRACT_ENDED_NOT_RENEWED');
    expect(result.flagNote).toBe(`${CONTRACT_ENDED_NOT_RENEWED_NOTE} (ended 2026-09-30)`);
  });

  it('a data-problem flag wins; employment notes are appended', () => {
    const result = resolveEmploymentEntryFlag({
      baseFlag: 'MISSING_ATTENDANCE',
      baseNote: 'No attendance',
      window: openWindow,
      isActive: true,
      contractEndedOn: d(2026, 9, 30),
    });
    expect(result.flag).toBe('MISSING_ATTENDANCE');
    expect(result.flagNote).toContain('No attendance; Contract ended');
  });
});

describe('final settlement on LEAVER_FINAL_MONTH', () => {
  const base = {
    basicSalary: 30000,
    leavingDate: d(2026, 11, 20),
    employmentStart: d(2021, 11, 21),
    unusedLeaveDays: 6,
  };

  it('nothing is computed with the default (disabled) policy: "handled outside the system" stays', () => {
    const settlement = computeFinalSettlement({ ...base, policy: POLICY_DEFAULTS });
    expect(settlement.anyEnabled).toBe(false);
    expect(settlement.taxable + settlement.nonTaxable).toBe(0);
    const flag = resolveEmploymentEntryFlag({ baseFlag: 'NONE', window: leaverWindow, isActive: true });
    expect(flag.flag).toBe('LEAVER_FINAL_MONTH');
    expect(flag.flagNote).toBe(`${LEAVER_FINAL_MONTH_NOTE} (leaving date 2026-11-20)`);
  });

  it('computes only the enabled lines, with policy parameters', () => {
    const settlement = computeFinalSettlement({
      ...base,
      policy: {
        unusedLeavePayout: { enabled: true, dailyRateBase: 'basic/30', prorateCurrentYear: true },
        severancePay: {
          enabled: true,
          parameters: { monthsOfBasicPerYearOfService: 1, maxMonths: 4, taxable: false },
        },
        noticePay: { enabled: false, days: 30 },
      },
    });
    expect(serviceYears(base.employmentStart, base.leavingDate)).toBeCloseTo(5, 1);
    expect(settlement.unusedLeavePayout).toBe(6000); // 6 × 30000/30
    expect(settlement.severancePay).toBe(120000); // capped at 4 months
    expect(settlement.noticePay).toBe(0);
    expect(settlement.taxable).toBe(6000);
    expect(settlement.nonTaxable).toBe(120000);

    const flag = resolveEmploymentEntryFlag({
      baseFlag: 'NONE',
      window: leaverWindow,
      isActive: true,
      settlementNotes: settlement.notes,
    });
    expect(flag.flagNote).toContain('final settlement per policy');
    expect(flag.flagNote).not.toContain('outside the system');
  });

  it('missing severance parameters give 0 with a note', () => {
    const settlement = computeFinalSettlement({
      ...base,
      policy: { ...POLICY_DEFAULTS, severancePay: { enabled: true, parameters: {} } },
    });
    expect(settlement.severancePay).toBe(0);
    expect(settlement.notes[0]).toMatch(/not set - handled outside the system/);
  });

  it('settlement enters gross (taxable part also taxable income) but not pension', () => {
    const calc = new PayrollCalculationService();
    const input = {
      basicSalary: 30000,
      transportAllowance: 0,
      monthlyBonus: 0,
      bonusTopUp: 0,
      payrollDays: 20,
      overtimeHours: { normalHours: 0, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
      taxableThreshold: 2200,
    };
    const without = calc.calculate(input);
    const withSettlement = calc.calculate({ ...input, settlementTaxable: 6000, settlementNonTaxable: 120000 });
    expect(withSettlement.grossIncome).toBe(without.grossIncome + 126000);
    expect(withSettlement.taxableIncome).toBe(without.taxableIncome + 6000);
    expect(withSettlement.pensionEmployee).toBe(without.pensionEmployee);
  });
});
