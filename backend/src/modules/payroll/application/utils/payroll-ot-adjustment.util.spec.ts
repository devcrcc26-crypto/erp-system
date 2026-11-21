import { describe, expect, it } from '@jest/globals';
import {
  combineManualOvertime,
  manualOtPay,
  systemOvertimeFromEntry,
} from './payroll-ot-adjustment.util';
import { calculateOvertimePay } from './payroll-overtime.util';

const BASIC = 12_000;
const SYSTEM_HOURS = { normalHours: 4, eveningHours: 2, sundayHours: 0, holidayHours: 0 };
const systemPay = (() => {
  const pay = calculateOvertimePay(BASIC, SYSTEM_HOURS);
  return {
    normalOtPay: pay.normalOtPay,
    eveningOtPay: pay.eveningOtPay,
    sundayOtPay: pay.sundayOtPay,
    holidayOtPay: pay.holidayOtPay,
  };
})();

describe('combineManualOvertime', () => {
  it('adds manual hours per category, priced on the basic with policy rates', () => {
    const result = combineManualOvertime({
      systemHours: SYSTEM_HOURS,
      systemPay,
      adjustments: [
        { category: 'NORMAL', hours: 6 },
        { category: 'SUNDAY', hours: 3 },
      ],
      basicSalary: BASIC,
    });

    expect(result.hours).toEqual({
      normalHours: 10,
      eveningHours: 2,
      sundayHours: 3,
      holidayHours: 0,
    });
    const expected = calculateOvertimePay(BASIC, result.hours);
    expect(result.pay.normalOtPay).toBeCloseTo(
      systemPay.normalOtPay + manualOtPay('NORMAL', 6, BASIC),
      2,
    );
    expect(result.pay.sundayOtPay).toBe(expected.sundayOtPay);
    expect(result.pay.totalOtPay).toBeCloseTo(
      result.pay.normalOtPay +
        result.pay.eveningOtPay +
        result.pay.sundayOtPay +
        result.pay.holidayOtPay,
      2,
    );
    expect(result.applied).toEqual([
      { category: 'NORMAL', hours: 6, amount: manualOtPay('NORMAL', 6, BASIC) },
      { category: 'SUNDAY', hours: 3, amount: manualOtPay('SUNDAY', 3, BASIC) },
    ]);
  });

  it('caps a negative adjustment so a category never goes below zero', () => {
    const result = combineManualOvertime({
      systemHours: SYSTEM_HOURS,
      systemPay,
      adjustments: [{ category: 'EVENING', hours: -5 }],
      basicSalary: BASIC,
    });
    expect(result.hours.eveningHours).toBe(0);
    expect(result.pay.eveningOtPay).toBe(0);
    expect(result.applied[0]).toEqual({
      category: 'EVENING',
      hours: -2,
      amount: -systemPay.eveningOtPay,
    });
  });

  it('leaves system OT untouched with no adjustments', () => {
    const result = combineManualOvertime({
      systemHours: SYSTEM_HOURS,
      systemPay,
      adjustments: [],
      basicSalary: BASIC,
    });
    expect(result.hours).toEqual(SYSTEM_HOURS);
    expect(result.applied).toEqual([]);
  });
});

describe('systemOvertimeFromEntry', () => {
  it('removes exactly what was applied, recovering system OT', () => {
    const combined = combineManualOvertime({
      systemHours: SYSTEM_HOURS,
      systemPay,
      adjustments: [
        { category: 'NORMAL', hours: 2.5 },
        { category: 'EVENING', hours: -5 },
      ],
      basicSalary: BASIC,
    });
    const recovered = systemOvertimeFromEntry({
      entryHours: combined.hours,
      entryPay: combined.pay,
      stored: combined.applied.map((row) => ({
        category: row.category,
        appliedHours: row.hours,
        amount: row.amount,
      })),
    });
    expect(recovered.hours).toEqual(SYSTEM_HOURS);
    expect(recovered.pay.normalOtPay).toBeCloseTo(systemPay.normalOtPay, 2);
    expect(recovered.pay.eveningOtPay).toBeCloseTo(systemPay.eveningOtPay, 2);
  });
});
