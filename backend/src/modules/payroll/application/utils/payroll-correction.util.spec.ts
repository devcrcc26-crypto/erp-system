import {
  buildCorrectionLines,
  correctionComponentAmounts,
  CORRECTION_COMPONENTS,
  type CorrectionEntrySnapshot,
} from './payroll-correction.util';

function entry(overrides: Partial<CorrectionEntrySnapshot> = {}): CorrectionEntrySnapshot {
  return {
    basicSalary: 30000,
    employedDays: 30,
    earnedSalary: 28000,
    normalOtPay: 1500,
    eveningOtPay: 0,
    sundayOtPay: 0,
    holidayOtPay: 0,
    transportAllowance: 3000,
    monthlyBonus: 6000,
    bonusTopUp: 0,
    contractNetBonus: 0,
    netTopUp: 0,
    unusedLeavePayout: 0,
    severancePay: 0,
    noticePay: 0,
    adjustmentTaxable: 0,
    adjustmentNonTaxable: 0,
    adjustmentDeductions: 0,
    grossIncome: 38500,
    taxableIncome: 35500,
    pensionEmployee: 1960,
    pensionEmployer: 3080,
    incomeTax: 10375,
    netPay: 26165,
    ...overrides,
  };
}

describe('correction components', () => {
  it('lists every component, with absence as a deduction and manual OT on its own line', () => {
    const amounts = correctionComponentAmounts(entry(), {
      NORMAL: 500,
      EVENING: 0,
      SUNDAY: 0,
      HOLIDAY: 0,
    });
    expect(Object.keys(amounts)).toEqual([...CORRECTION_COMPONENTS]);
    expect(amounts.EARNED_SALARY).toBe(28000);
    expect(amounts.ABSENCE_DEDUCTION).toBe(2000);
    expect(amounts.NORMAL_OT).toBe(1000);
    expect(amounts.MANUAL_OT_ADJUSTMENT).toBe(500);
    expect(amounts.NET_PAY).toBe(26165);
  });

  it('treats a missing entry as all zeros', () => {
    const amounts = correctionComponentAmounts(null);
    expect(Object.values(amounts).every((value) => value === 0)).toBe(true);
  });

  it('stores paid, corrected and difference for each component', () => {
    const paid = correctionComponentAmounts(entry());
    const corrected = correctionComponentAmounts(
      entry({ normalOtPay: 2250, grossIncome: 39250, netPay: 26690 }),
    );
    const lines = buildCorrectionLines(paid, corrected);
    expect(lines).toHaveLength(CORRECTION_COMPONENTS.length);
    const byComponent = new Map(lines.map((line) => [line.component, line]));
    expect(byComponent.get('NORMAL_OT')).toMatchObject({
      paidAmount: 1500,
      correctedAmount: 2250,
      difference: 750,
    });
    expect(byComponent.get('NET_PAY')?.difference).toBe(525);
    expect(byComponent.get('EARNED_SALARY')?.difference).toBe(0);
  });
});
