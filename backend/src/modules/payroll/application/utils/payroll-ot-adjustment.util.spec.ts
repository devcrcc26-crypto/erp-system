import { describe, expect, it } from '@jest/globals';
import {
  combineManualOvertime,
  combineManualOvertimeByContracts,
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

describe('combineManualOvertimeByContracts', () => {
  it('prices each contract on its own basic and sums entry totals', () => {
    const result = combineManualOvertimeByContracts([
      {
        contractId: 'a',
        basicSalary: BASIC,
        systemHours: { normalHours: 2, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
        systemPay: { normalOtPay: manualOtPay('NORMAL', 2, BASIC), eveningOtPay: 0, sundayOtPay: 0, holidayOtPay: 0 },
        adjustments: [{ category: 'NORMAL', hours: 1 }],
      },
      {
        contractId: 'b',
        basicSalary: BASIC * 2,
        systemHours: { normalHours: 4, eveningHours: 0, sundayHours: 0, holidayHours: 0 },
        systemPay: {
          normalOtPay: manualOtPay('NORMAL', 4, BASIC * 2),
          eveningOtPay: 0,
          sundayOtPay: 0,
          holidayOtPay: 0,
        },
        adjustments: [{ category: 'NORMAL', hours: 3 }],
      },
    ]);
    expect(result.hours.normalHours).toBe(2 + 1 + 4 + 3);
    expect(result.pay.normalOtPay).toBeCloseTo(
      manualOtPay('NORMAL', 2, BASIC) +
        manualOtPay('NORMAL', 1, BASIC) +
        manualOtPay('NORMAL', 4, BASIC * 2) +
        manualOtPay('NORMAL', 3, BASIC * 2),
      2,
    );
    expect(result.appliedByContract).toHaveLength(2);
    expect(result.periodTotals[0]!.hours.normalHours).toBe(3);
    expect(result.periodTotals[1]!.hours.normalHours).toBe(7);
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
