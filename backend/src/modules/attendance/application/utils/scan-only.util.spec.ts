import { describe, expect, it } from '@jest/globals';
import {
  dayDeduction,
  summarizeMonthAbsence,
  type DayDeductionContext,
  type DayDeductionDayInput,
} from './day-deduction.util';
import { buildDayDeductionContext } from './attendance-day-deduction.context';
import {
  earliestScan,
  isScanAfterDeadline,
  scanOnlyRuleFor,
  type ScanOnlyRule,
} from './scan-only.util';
import {
  computeSelectableOvertimeWindows,
  isIntervalInsideSelectableWindows,
} from '../../../overtime/application/utils/overtime-selectable-windows.util';
import { computeAndValidateDayHours } from '../../../work-schedule/application/services/work-schedule.dates';

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

const MONDAY = d(2026, 10, 5);
const SATURDAY = d(2026, 10, 10);
const SUNDAY = d(2026, 10, 11);

/** Cleaner schedule: scans ~07:00, finishes 08:30, latest scan 08:30. */
const CLEANER_RULE: ScanOnlyRule = { latestScanTime: '08:30' };

function context(overrides: Partial<DayDeductionContext> = {}): DayDeductionContext {
  return {
    isSunday: (date) => date.getUTCDay() === 0,
    isPublicHoliday: () => false,
    isWorkFromHome: () => false,
    siteNameForDate: () => null,
    isOnApprovedLeave: () => false,
    isOnUnpaidLeave: () => false,
    fieldMovementCoverage: () => 'NONE',
    earlyDepartureWaiver: () => 'NONE',
    isAttendanceExempt: () => false,
    ...overrides,
  };
}

function scanOnlyContext(
  overrides: Partial<DayDeductionContext> = {},
): DayDeductionContext {
  return context({ scanOnlyRule: () => CLEANER_RULE, ...overrides });
}

function scans(
  date: Date,
  clockIn: string | null,
  clockOut: string | null,
): DayDeductionDayInput {
  return {
    date,
    clockIn,
    clockOut,
    isLastExportDay: false,
    // Office end - must never produce an early-departure band on SCAN_ONLY.
    scheduledEnd: '17:30',
  };
}

describe('SCAN_ONLY work schedule - dayDeduction', () => {
  it('single 07:00 scan → PRESENT, 0 deduction, no missing punch, no early departure', () => {
    const r = dayDeduction(MONDAY, scans(MONDAY, '07:00', null), scanOnlyContext());
    expect(r).toMatchObject({
      status: 'PRESENT',
      deduction: 0,
      scanOnly: true,
      scanAfterDeadlineTime: null,
    });
    expect(r.earlyDepartureBand).toBeUndefined();
    expect(r.earlyDepartureWouldDeduct).toBeUndefined();

    // Same single scan on STANDARD → missing clock-out half day.
    const standard = dayDeduction(MONDAY, scans(MONDAY, '07:00', null), context());
    expect(standard.deduction).toBe(0.5);
    expect(standard.status).toBe('HALF_ABSENT');
  });

  it('07:00 in / 08:30 out (left 9h before office end) → PRESENT 0, no early departure', () => {
    const r = dayDeduction(MONDAY, scans(MONDAY, '07:00', '08:30'), scanOnlyContext());
    expect(r.status).toBe('PRESENT');
    expect(r.deduction).toBe(0);
    expect(r.earlyDepartureBand).toBeUndefined();
  });

  it('single 08:45 scan → PRESENT 0 + SCAN_AFTER_DEADLINE at 08:45', () => {
    const r = dayDeduction(MONDAY, scans(MONDAY, '08:45', null), scanOnlyContext());
    expect(r.status).toBe('PRESENT');
    expect(r.deduction).toBe(0);
    expect(r.scanAfterDeadlineTime).toBe('08:45');
  });

  it('scan exactly at latestScanTime is not flagged', () => {
    const r = dayDeduction(MONDAY, scans(MONDAY, '08:30', null), scanOnlyContext());
    expect(r.scanAfterDeadlineTime).toBeNull();
  });

  it('scans 07:00 and 09:00 → no flag (earliest scan is used)', () => {
    const r = dayDeduction(MONDAY, scans(MONDAY, '07:00', '09:00'), scanOnlyContext());
    expect(r.status).toBe('PRESENT');
    expect(r.scanAfterDeadlineTime).toBeNull();
  });

  it('only a clock-out scan counts as the earliest scan', () => {
    const ok = dayDeduction(MONDAY, scans(MONDAY, null, '07:05'), scanOnlyContext());
    expect(ok).toMatchObject({ status: 'PRESENT', deduction: 0, scanAfterDeadlineTime: null });
    const late = dayDeduction(MONDAY, scans(MONDAY, null, '10:00'), scanOnlyContext());
    expect(late).toMatchObject({ status: 'PRESENT', deduction: 0, scanAfterDeadlineTime: '10:00' });
  });

  it('no scan → ABSENT, deduction 1', () => {
    const r = dayDeduction(MONDAY, scans(MONDAY, null, null), scanOnlyContext());
    expect(r).toMatchObject({ status: 'ABSENT', deduction: 1 });
  });

  it('no scan + approved leave → LEAVE 0', () => {
    const r = dayDeduction(
      MONDAY,
      scans(MONDAY, null, null),
      scanOnlyContext({ isOnApprovedLeave: () => true }),
    );
    expect(r).toMatchObject({
      status: 'LEAVE',
      deduction: 0,
      onLeaveButScanned: false,
    });
  });

  it('SCAN_ONLY approved site + 1 punch → ON_SITE 0 (no scan-after-deadline)', () => {
    const r = dayDeduction(
      MONDAY,
      scans(MONDAY, '08:10', null),
      scanOnlyContext({ siteNameForDate: () => 'Site A' }),
    );
    expect(r).toMatchObject({
      status: 'ON_SITE',
      deduction: 0,
      siteName: 'Site A',
    });
    expect(r.scanAfterDeadlineTime).toBeUndefined();
  });

  it('SCAN_ONLY approved leave + scan → LEAVE 0 + onLeaveButScanned', () => {
    const r = dayDeduction(
      MONDAY,
      scans(MONDAY, '08:10', null),
      scanOnlyContext({ isOnApprovedLeave: () => true }),
    );
    expect(r).toMatchObject({
      status: 'LEAVE',
      deduction: 0,
      onLeaveButScanned: true,
    });
  });

  it('no scan + approved site / WFH / enrolment grace / exempt → 0 as today', () => {
    expect(
      dayDeduction(MONDAY, scans(MONDAY, null, null), scanOnlyContext({ siteNameForDate: () => 'Site A' })),
    ).toMatchObject({ status: 'ON_SITE', deduction: 0, siteName: 'Site A' });
    expect(
      dayDeduction(MONDAY, scans(MONDAY, null, null), scanOnlyContext({ isWorkFromHome: () => true })),
    ).toMatchObject({ status: 'WORK_FROM_HOME', deduction: 0 });
    expect(
      dayDeduction(MONDAY, scans(MONDAY, null, null), scanOnlyContext({ isEnrolmentGrace: () => true })),
    ).toMatchObject({ status: 'ENROLMENT_GRACE', deduction: 0 });
    expect(
      dayDeduction(MONDAY, scans(MONDAY, null, null), scanOnlyContext({ isAttendanceExempt: () => true })),
    ).toMatchObject({ status: 'PRESENT', deduction: 0 });
  });

  // Since 4438a06f approved unpaid leave has its own status (UNPAID_LEAVE, counted in
  // unpaidLeaveDays, not absentDays). A plain no-scan duty day is still ABSENT.
  it('no scan + approved unpaid leave → UNPAID_LEAVE 1', () => {
    const r = dayDeduction(
      MONDAY,
      scans(MONDAY, null, null),
      scanOnlyContext({ isOnUnpaidLeave: () => true }),
    );
    expect(r).toMatchObject({ status: 'UNPAID_LEAVE', deduction: 1 });
  });

  it('no scan, no leave → ABSENT 1 (never UNPAID_LEAVE), on SCAN_ONLY and STANDARD schedules', () => {
    expect(dayDeduction(MONDAY, scans(MONDAY, null, null), scanOnlyContext())).toMatchObject({
      status: 'ABSENT',
      deduction: 1,
    });
    expect(dayDeduction(MONDAY, scans(MONDAY, null, null), context())).toMatchObject({
      status: 'ABSENT',
      deduction: 1,
    });
    // Unpaid leave on another day does not relabel this one.
    expect(
      dayDeduction(
        MONDAY,
        scans(MONDAY, null, null),
        context({ isOnUnpaidLeave: (date) => date.getTime() !== MONDAY.getTime() }),
      ),
    ).toMatchObject({ status: 'ABSENT', deduction: 1 });
  });

  it('Saturday: scan → present; late scan flagged; none → absent 1 (same as weekday)', () => {
    expect(
      dayDeduction(SATURDAY, scans(SATURDAY, '07:00', null), scanOnlyContext()),
    ).toMatchObject({ status: 'PRESENT', deduction: 0, scanAfterDeadlineTime: null });
    expect(
      dayDeduction(SATURDAY, scans(SATURDAY, '08:45', null), scanOnlyContext()),
    ).toMatchObject({ status: 'PRESENT', deduction: 0, scanAfterDeadlineTime: '08:45' });
    expect(
      dayDeduction(SATURDAY, scans(SATURDAY, null, null), scanOnlyContext()),
    ).toMatchObject({ status: 'ABSENT', deduction: 1 });
  });

  it('Sunday / public holiday → nothing (no deduction, no flag)', () => {
    expect(
      dayDeduction(SUNDAY, scans(SUNDAY, null, null), scanOnlyContext()),
    ).toEqual({ deduction: 0, status: 'DAY_OFF' });
    expect(
      dayDeduction(SUNDAY, scans(SUNDAY, '09:30', null), scanOnlyContext()),
    ).toEqual({ deduction: 0, status: 'WORKED_ON_DAY_OFF' });
    for (const input of [scans(MONDAY, null, null), scans(MONDAY, '09:30', null)]) {
      const r = dayDeduction(
        MONDAY,
        input,
        scanOnlyContext({ isPublicHoliday: () => true }),
      );
      expect(r).toEqual({ deduction: 0, status: 'HOLIDAY' });
    }
  });

  it('month summary: present days counted, no early-departure counts, absences deducted', () => {
    // October 2026: 1 Sunday-free cleaner pattern - scans every Mon–Sat except
    // two absences (6th, 7th) and one late scan (8th).
    const daily = new Map<string, DayDeductionDayInput>();
    for (let day = 1; day <= 31; day += 1) {
      const date = d(2026, 10, day);
      if (date.getUTCDay() === 0 || day === 6 || day === 7) {
        continue;
      }
      const key = date.toISOString().slice(0, 10);
      daily.set(key, scans(date, day === 8 ? '08:50' : '07:00', null));
    }
    const summary = summarizeMonthAbsence({
      month: 10,
      year: 2026,
      contracts: [{ startDate: d(2020, 1, 1), endDate: null }],
      dailyLogsByDate: daily,
      context: scanOnlyContext(),
    });
    expect(summary.absentDays).toBe(2);
    expect(summary.paidDays).toBe(28);
    expect(summary.earlyDepartureCount).toBe(0);
    expect(summary.earlyDepartureWouldDeductDays).toBe(0);
    expect(summary.scheduledDays).toBe(27);
    expect(summary.presentDays).toBe(25);
    expect(summary.byDate.get('2026-10-08')?.scanAfterDeadlineTime).toBe('08:50');
  });

  it('only dates whose schedule is SCAN_ONLY use the rule (mid-month switch)', () => {
    const ctx = buildDayDeductionContext(
      { id: 'e1', departmentId: null, nationality: null },
      {
        holidays: [],
        wfhDays: [],
        leaveDateKeys: new Set(),
        unpaidLeaveDateKeys: new Set(),
        fieldMovementByDate: new Map(),
        earlyDepartureWaiverByDate: new Map(),
        siteAssignments: [],
      },
      { scanOnlyRuleByDate: new Map([['2026-10-05', CLEANER_RULE]]) },
    );
    expect(dayDeduction(MONDAY, scans(MONDAY, '07:00', null), ctx).status).toBe('PRESENT');
    const tuesday = d(2026, 10, 6);
    expect(dayDeduction(tuesday, scans(tuesday, '07:00', null), ctx).status).toBe('HALF_ABSENT');
  });
});

describe('STANDARD schedules are unchanged by the scan-only hook', () => {
  it('dayDeduction gives identical results with and without a null scanOnlyRule', () => {
    const times = [null, '07:00', '08:30', '08:50', '12:00', '16:15', '17:00', '17:30'];
    const variants: Array<Partial<DayDeductionContext>> = [
      {},
      { isOnApprovedLeave: () => true },
      { siteNameForDate: () => 'Site A' },
      { fieldMovementCoverage: () => 'APPROVED' },
      { fieldMovementCoverage: () => 'PENDING', earlyDepartureWaiver: () => 'PENDING' },
      { isEnrolmentGrace: () => true },
      { earlyDepartureMode: 'ENFORCED' },
    ];
    for (const date of [MONDAY, SATURDAY, SUNDAY]) {
      for (const clockIn of times) {
        for (const clockOut of times) {
          for (const variant of variants) {
            const input = scans(date, clockIn, clockOut);
            const base = dayDeduction(date, input, context(variant));
            const hooked = dayDeduction(
              date,
              input,
              context({ ...variant, scanOnlyRule: () => null }),
            );
            expect(hooked).toEqual(base);
            expect(base.scanOnly).toBeUndefined();
          }
        }
      }
    }
  });

  it('context without SCAN_ONLY dates has no scanOnlyRule', () => {
    const ctx = buildDayDeductionContext(
      { id: 'e1', departmentId: null, nationality: null },
      {
        holidays: [],
        wfhDays: [],
        leaveDateKeys: new Set(),
        unpaidLeaveDateKeys: new Set(),
        fieldMovementByDate: new Map(),
        earlyDepartureWaiverByDate: new Map(),
        siteAssignments: [],
      },
      { scanOnlyRuleByDate: new Map() },
    );
    expect(ctx.scanOnlyRule).toBeUndefined();
  });
});

describe('scan-only helpers', () => {
  it('earliestScan picks the earlier punch', () => {
    expect(earliestScan('09:00', '07:00')).toBe('07:00');
    expect(earliestScan(null, '07:10')).toBe('07:10');
    expect(earliestScan(null, null)).toBeNull();
  });

  it('isScanAfterDeadline is strict', () => {
    expect(isScanAfterDeadline('08:31', '08:30')).toBe(true);
    expect(isScanAfterDeadline('08:30', '08:30')).toBe(false);
    expect(isScanAfterDeadline('08:45', null)).toBe(false);
  });

  it('scanOnlyRuleFor only returns a rule for SCAN_ONLY', () => {
    expect(scanOnlyRuleFor({ checkMode: 'STANDARD', latestScanTime: null })).toBeNull();
    expect(scanOnlyRuleFor(undefined)).toBeNull();
    expect(scanOnlyRuleFor({ checkMode: 'SCAN_ONLY', latestScanTime: '08:30' })).toEqual({
      latestScanTime: '08:30',
    });
  });
});

describe('SCAN_ONLY schedule days and overtime windows', () => {
  const CLEANER_DAY = {
    isHoliday: false,
    isWorkingDay: true,
    isHalfDay: false,
    morningStart: '07:00',
    morningEnd: '08:30',
    afternoonStart: null,
    afternoonEnd: null,
    leaveExcludedWindows: [] as Array<{ start: string; end: string }>,
    hasFullDayLeave: false,
  };

  it('single-shift working day is valid only for SCAN_ONLY (1.5 h)', () => {
    const day = { isWorkingDay: true, isHalfDay: false, morningStart: '07:00', morningEnd: '08:30' };
    expect(computeAndValidateDayHours(day, { allowSingleShift: true })).toBe(1.5);
    expect(() => computeAndValidateDayHours(day)).toThrow(
      'Full working days require afternoonStart and afternoonEnd',
    );
  });

  it('OT windows exclude 07:00–08:30 on a cleaner day', () => {
    const result = computeSelectableOvertimeWindows(CLEANER_DAY);
    expect(result.dayKind).toBe('FULL_WORKING');
    expect(result.windows).toEqual([
      { start: '00:00', end: '07:00' },
      { start: '08:30', end: '24:00' },
    ]);
    expect(isIntervalInsideSelectableWindows('07:00', '08:30', result.windows)).toBe(false);
    expect(isIntervalInsideSelectableWindows('07:30', '08:00', result.windows)).toBe(false);
    expect(isIntervalInsideSelectableWindows('08:00', '09:00', result.windows)).toBe(false);
    expect(isIntervalInsideSelectableWindows('08:30', '10:00', result.windows)).toBe(true);
    expect(isIntervalInsideSelectableWindows('05:00', '07:00', result.windows)).toBe(true);
  });

  it('standard full day OT windows are unchanged', () => {
    const result = computeSelectableOvertimeWindows({
      ...CLEANER_DAY,
      morningStart: '08:30',
      morningEnd: '12:30',
      afternoonStart: '13:30',
      afternoonEnd: '17:30',
    });
    expect(result.windows).toEqual([
      { start: '00:00', end: '08:30' },
      { start: '17:30', end: '24:00' },
    ]);
  });
});
