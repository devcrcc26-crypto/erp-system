import type { OvertimeDayContext } from '../../../overtime/application/utils/overtime-hours.util';
import {
  assignOvertimeToSalaryPeriods,
  buildOvertimeDayContext,
  datedEntryFromExactMinutes,
  calculateOvertimePay,
  datedEntriesFromExactMinutes,
  OVERNIGHT_OT_DATE_ASSIGNMENT,
  OT_FALLBACK_MONTH_END_NOTE,
} from './payroll-overtime.util';

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

const OFF_DAY: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: false,
  isHalfDay: false,
  morningStart: null,
  morningEnd: null,
  afternoonStart: null,
  afternoonEnd: null,
};

const WD: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: true,
  isHalfDay: false,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
};

describe('calculateOvertimePay', () => {
  it('renewal Aug 24, 50,000 → 8 h Normal → 3,125.00', () => {
    const pay = calculateOvertimePay(50000, {
      normalHours: 8,
      eveningHours: 0,
      sundayHours: 0,
      holidayHours: 0,
    });
    // 50000/192 × 8 × 1.5 = 3125
    expect(pay.normalOtPay).toBeCloseTo(3125, 2);
    expect(pay.totalOtPay).toBeCloseTo(3125, 2);
  });

  it('renewal Aug 24, 70,000 → 8 h Normal → 4,375.00', () => {
    const pay = calculateOvertimePay(70000, {
      normalHours: 8,
      eveningHours: 0,
      sundayHours: 0,
      holidayHours: 0,
    });
    // 70000/192 × 8 × 1.5 = 4375
    expect(pay.normalOtPay).toBeCloseTo(4375, 2);
  });

  it('holiday OT on old contract uses old basic ÷ 196', () => {
    const pay = calculateOvertimePay(50000, {
      normalHours: 0,
      eveningHours: 0,
      sundayHours: 0,
      holidayHours: 4,
    });
    // 50000/196 × 4 × 2.5 = 2551.02
    expect(pay.holidayOtPay).toBeCloseTo(2551.02, 2);
  });
});

describe('assignOvertimeToSalaryPeriods', () => {
  const periods = [
    {
      contractId: 'old',
      periodStart: utc(2026, 8, 1),
      periodEnd: utc(2026, 8, 23),
      basicSalary: 50000,
    },
    {
      contractId: 'new',
      periodStart: utc(2026, 8, 24),
      periodEnd: utc(2026, 8, 31),
      basicSalary: 70000,
    },
  ];

  it('8 h Normal on Aug 10 → 3,125; on Aug 28 → 4,375; both → 7,500', () => {
    const both = assignOvertimeToSalaryPeriods({
      entries: [
        {
          date: utc(2026, 8, 10),
          isOvernight: false,
          normalHours: 8,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        },
        {
          date: utc(2026, 8, 28),
          isOvernight: false,
          normalHours: 8,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        },
      ],
      periods,
      monthEndBasic: 70000,
    });
    expect(both.periods[0]!.normalOtPay).toBeCloseTo(3125, 2);
    expect(both.periods[1]!.normalOtPay).toBeCloseTo(4375, 2);
    expect(both.totals.normalOtPay).toBeCloseTo(7500, 2);
    expect(both.totals.totalOtPay).toBeCloseTo(7500, 2);
    expect(both.usedMonthEndFallback).toBe(false);
  });

  it('holiday OT on the old contract uses old basic ÷ 196', () => {
    const result = assignOvertimeToSalaryPeriods({
      entries: [
        {
          date: utc(2026, 8, 15),
          isOvernight: false,
          normalHours: 0,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 4,
        },
      ],
      periods,
      monthEndBasic: 70000,
    });
    expect(result.periods[0]!.holidayOtPay).toBeCloseTo(2551.02, 2);
    expect(result.periods[1]!.holidayOtPay).toBe(0);
  });

  it('single-contract employee: unchanged results vs month-end basic', () => {
    const single = [
      {
        contractId: 'only',
        periodStart: utc(2026, 8, 1),
        periodEnd: utc(2026, 8, 31),
        basicSalary: 30000,
      },
    ];
    const result = assignOvertimeToSalaryPeriods({
      entries: [
        {
          date: utc(2026, 8, 12),
          isOvernight: false,
          normalHours: 10,
          eveningHours: 2,
          sundayHours: 0,
          holidayHours: 0,
        },
      ],
      periods: single,
      monthEndBasic: 30000,
    });
    const expected = calculateOvertimePay(30000, {
      normalHours: 10,
      eveningHours: 2,
      sundayHours: 0,
      holidayHours: 0,
    });
    expect(result.totals.normalOtPay).toBeCloseTo(expected.normalOtPay, 2);
    expect(result.totals.eveningOtPay).toBeCloseTo(expected.eveningOtPay, 2);
    expect(result.totals.totalOtPay).toBeCloseTo(expected.totalOtPay, 2);
  });

  it(`overnight spanning renewal uses ${OVERNIGHT_OT_DATE_ASSIGNMENT} (start date)`, () => {
    // Entry dated Aug 23 overnight - hours stay on old contract (start date).
    const result = assignOvertimeToSalaryPeriods({
      entries: [
        {
          date: utc(2026, 8, 23),
          isOvernight: true,
          normalHours: 2,
          eveningHours: 4,
          sundayHours: 0,
          holidayHours: 0,
        },
      ],
      periods,
      monthEndBasic: 70000,
    });
    expect(OVERNIGHT_OT_DATE_ASSIGNMENT).toBe('START_DATE');
    expect(result.periods[0]!.eveningHours).toBe(4);
    expect(result.periods[0]!.normalHours).toBe(2);
    expect(result.periods[1]!.eveningHours).toBe(0);
    expect(result.periods[0]!.normalOtPay).toBeCloseTo(
      calculateOvertimePay(50000, {
        normalHours: 2,
        eveningHours: 4,
        sundayHours: 0,
        holidayHours: 0,
      }).normalOtPay,
      2,
    );
  });

  it(`sheet with totals only → month-end fallback (${OT_FALLBACK_MONTH_END_NOTE})`, () => {
    const result = assignOvertimeToSalaryPeriods({
      entries: [],
      periods,
      sheetTotals: {
        normalHours: 8,
        eveningHours: 0,
        sundayHours: 0,
        holidayHours: 0,
      },
      monthEndBasic: 70000,
    });
    expect(result.usedMonthEndFallback).toBe(true);
    expect(result.totals.normalOtPay).toBeCloseTo(4375, 2);
    expect(result.periods[1]!.normalOtPay).toBeCloseTo(4375, 2);
    expect(result.periods[0]!.normalOtPay).toBe(0);
  });
});

describe('datedEntriesFromExactMinutes (payroll pricing)', () => {
  it('20 h 10 min entry: prices from exact minutes, not stored 20.17', () => {
    // Sunday 00:00–20:10 → 20 h 10 min Weekend (entire span is OT).
    const exactHours = 20 + 10 / 60;
    const dated = datedEntriesFromExactMinutes([
      {
        date: utc(2026, 8, 2),
        startTime: '00:00',
        endTime: '20:10',
        isOvernight: false,
        context: OFF_DAY,
      },
    ]);
    expect(dated[0]!.sundayHours).toBeCloseTo(exactHours, 10);
    expect(dated[0]!.sundayHours).not.toBe(20.17);

    const single = [
      {
        contractId: 'only',
        periodStart: utc(2026, 8, 1),
        periodEnd: utc(2026, 8, 31),
        basicSalary: 30000,
      },
    ];
    const fromTimes = assignOvertimeToSalaryPeriods({
      entries: dated,
      periods: single,
      monthEndBasic: 30000,
    });
    const exactPay = calculateOvertimePay(30000, {
      normalHours: 0,
      eveningHours: 0,
      sundayHours: exactHours,
      holidayHours: 0,
    });
    const fromStoredRounded = calculateOvertimePay(30000, {
      normalHours: 0,
      eveningHours: 0,
      sundayHours: 20.17,
      holidayHours: 0,
    });

    expect(fromTimes.totals.sundayOtPay).toBe(exactPay.sundayOtPay);
    // 30000/192 × (20+10/60) × 2 = 6302.08; 20.17 would be 6303.13
    expect(fromTimes.totals.sundayOtPay).toBe(6302.08);
    expect(fromStoredRounded.sundayOtPay).toBe(6303.13);
    expect(fromTimes.totals.sundayOtPay).not.toBe(
      fromStoredRounded.sundayOtPay,
    );
  });

  it('20 h 10 min Normal OT at 30,000 basic → 4,726.56 (not 4,727.34 from 20.17)', () => {
    // Lakew sheet: Normal 20+10/60. Payroll must price exact minutes after
    // timed classification (stored column would be 20.17).
    const exactHours = 20 + 10 / 60;
    const exactPay = calculateOvertimePay(30000, {
      normalHours: exactHours,
      eveningHours: 0,
      sundayHours: 0,
      holidayHours: 0,
    });
    const roundedPay = calculateOvertimePay(30000, {
      normalHours: 20.17,
      eveningHours: 0,
      sundayHours: 0,
      holidayHours: 0,
    });
    expect(exactPay.normalOtPay).toBe(4726.56);
    expect(roundedPay.normalOtPay).toBe(4727.34);

    const fromTimes = assignOvertimeToSalaryPeriods({
      entries: [
        {
          date: utc(2026, 8, 12),
          isOvernight: false,
          normalHours: exactHours,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        },
      ],
      periods: [
        {
          contractId: 'only',
          periodStart: utc(2026, 8, 1),
          periodEnd: utc(2026, 8, 31),
          basicSalary: 30000,
        },
      ],
      monthEndBasic: 30000,
    });
    expect(fromTimes.totals.normalOtPay).toBe(4726.56);

    // Weekday evening slice still classifies with minute precision.
    const evening = datedEntriesFromExactMinutes([
      {
        date: utc(2026, 8, 3), // Monday
        startTime: '17:30',
        endTime: '19:20',
        isOvernight: false,
        context: WD,
      },
    ]);
    expect(evening[0]!.normalHours).toBeCloseTo(1 + 50 / 60, 10);
  });
});

describe('site-assignment entries in payroll', () => {
  const weekday = {
    isWorkingDay: true,
    isHalfDay: false,
    morningStart: '08:30',
    morningEnd: '12:30',
    afternoonStart: '13:30',
    afternoonEnd: '17:30',
  };
  const entry = (claimable: boolean) =>
    datedEntryFromExactMinutes({
      date: utc(2026, 9, 9),
      startTime: '09:00',
      endTime: '12:00',
      isOvernight: false,
      context: buildOvertimeDayContext(weekday, false, false, claimable),
    });

  it('entry priced as a site day (stored within-schedule hours) is paid as normal OT', () => {
    expect(entry(true).normalHours).toBe(3);
  });

  it('office-day entries keep excluding scheduled hours', () => {
    expect(entry(false).normalHours).toBe(0);
  });
});
