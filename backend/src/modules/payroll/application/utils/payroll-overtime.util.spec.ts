import {
  assignOvertimeToSalaryPeriods,
  calculateOvertimePay,
  OVERNIGHT_OT_DATE_ASSIGNMENT,
  OT_FALLBACK_MONTH_END_NOTE,
} from './payroll-overtime.util';

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

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
    // Entry dated Aug 23 overnight — hours stay on old contract (start date).
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
