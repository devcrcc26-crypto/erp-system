import {
  adjustmentLineLabel,
  adjustmentTotalsFromLines,
  deductionCap,
  effectiveLineTreatment,
  exceedsDeductionCap,
  reconciliationRemaining,
  reconciliationStatusFor,
  suggestRecoveryInstalment,
} from './payroll-adjustment.util';

const earning = (amount: number, taxable: boolean, pensionable = false) => ({
  amount,
  kind: 'EARNING' as const,
  taxable,
  pensionable,
  systemField: null,
});

describe('adjustmentTotalsFromLines', () => {
  it('keeps Taxable bonus / Net bonus in the existing top-up fields', () => {
    const totals = adjustmentTotalsFromLines([
      { amount: 1000, kind: 'EARNING', taxable: true, pensionable: false, systemField: 'BONUS_TOP_UP' },
      { amount: 250, kind: 'EARNING', taxable: true, pensionable: false, systemField: 'BONUS_TOP_UP' },
      { amount: 500, kind: 'EARNING', taxable: false, pensionable: false, systemField: 'NET_TOP_UP' },
    ]);
    expect(totals.bonusTopUp).toBe(1250);
    expect(totals.netTopUp).toBe(500);
    expect(totals.adjustments).toEqual({
      taxableEarnings: 0,
      nonTaxableEarnings: 0,
      pensionableEarnings: 0,
      deductions: 0,
    });
  });

  it('splits other lines by tax treatment; pensionable is counted on top', () => {
    const totals = adjustmentTotalsFromLines([
      earning(3000, true), // severance
      earning(1200, true, true), // salary arrears
      earning(400, false), // other, untaxed
      { amount: 900, kind: 'DEDUCTION', taxable: true, pensionable: true, systemField: null },
    ]);
    expect(totals.adjustments).toEqual({
      taxableEarnings: 4200,
      nonTaxableEarnings: 400,
      pensionableEarnings: 1200,
      // A deduction is always after tax, whatever its flags say.
      deductions: 900,
    });
  });
});

describe('one third of the monthly wage', () => {
  it('caps deductions at a third of the wage (rounded down to the cent)', () => {
    expect(deductionCap(10000)).toBe(3333.33);
    expect(exceedsDeductionCap(10000, 3333.33)).toBe(false);
    expect(exceedsDeductionCap(10000, 3333.34)).toBe(true);
  });

  it('suggests what still fits under the cap, and how many instalments that means', () => {
    expect(
      suggestRecoveryInstalment({ monthlyWage: 9000, existingDeductions: 0, remaining: 7000 }),
    ).toEqual({ amount: 3000, cap: 3000, capRemaining: 3000, estimatedInstalments: 3 });
    expect(
      suggestRecoveryInstalment({ monthlyWage: 9000, existingDeductions: 1000, remaining: 7000 }),
    ).toEqual({ amount: 2000, cap: 3000, capRemaining: 2000, estimatedInstalments: 4 });
    // Small balance: settle it in full.
    expect(
      suggestRecoveryInstalment({ monthlyWage: 9000, existingDeductions: 0, remaining: 800 }).amount,
    ).toBe(800);
    // Cap already used up.
    expect(
      suggestRecoveryInstalment({ monthlyWage: 9000, existingDeductions: 3000, remaining: 800 }),
    ).toEqual({ amount: 0, cap: 3000, capRemaining: 0, estimatedInstalments: null });
  });
});

describe('reconciliation settlement', () => {
  it('derives the status from the settled amount', () => {
    expect(reconciliationStatusFor(1000, 0)).toBe('OPEN');
    expect(reconciliationStatusFor(1000, 400)).toBe('PARTIALLY_SETTLED');
    expect(reconciliationStatusFor(1000, 1000)).toBe('SETTLED');
    expect(reconciliationRemaining(1000, 400)).toBe(600);
    expect(reconciliationRemaining(1000, 1200)).toBe(0);
  });

  it('labels settlement lines with the period and instalment', () => {
    expect(
      adjustmentLineLabel({
        typeName: 'Recovery / deduction',
        forMonth: 10,
        forYear: 2026,
        instalmentNumber: 1,
        instalmentCount: 3,
      }),
    ).toBe('Recovery / deduction – October 2026 correction (1 of 3)');
    expect(
      adjustmentLineLabel({
        typeName: 'Net bonus',
        forMonth: 10,
        forYear: 2026,
        instalmentNumber: 1,
        instalmentCount: 1,
      }),
    ).toBe('Net bonus – October 2026 correction');
    expect(
      adjustmentLineLabel({
        typeName: 'Other',
        forMonth: null,
        forYear: null,
        instalmentNumber: null,
        instalmentCount: null,
      }),
    ).toBe('Other');
  });
});

describe('manual correction line treatment', () => {
  const type = { typeKind: 'EARNING' as const, typeTaxable: true, typePensionable: true, systemField: null };

  it('takes direction and treatment from the line, falling back to the type', () => {
    expect(
      effectiveLineTreatment({ ...type, kindOverride: null, taxableOverride: null }),
    ).toEqual({ kind: 'EARNING', taxable: true, pensionable: true, taxableDeduction: false });
    expect(
      effectiveLineTreatment({ ...type, kindOverride: 'DEDUCTION', taxableOverride: true }),
    ).toEqual({ kind: 'DEDUCTION', taxable: true, pensionable: true, taxableDeduction: true });
  });

  it('never makes a net line pensionable, and ignores overrides on built-in bonus types', () => {
    expect(
      effectiveLineTreatment({ ...type, kindOverride: 'EARNING', taxableOverride: false }),
    ).toMatchObject({ taxable: false, pensionable: false });
    expect(
      effectiveLineTreatment({
        typeKind: 'EARNING',
        typeTaxable: true,
        typePensionable: false,
        systemField: 'BONUS_TOP_UP',
        kindOverride: 'DEDUCTION',
        taxableOverride: false,
      }),
    ).toEqual({ kind: 'EARNING', taxable: true, pensionable: false, taxableDeduction: false });
  });

  it('a taxable deduction reduces taxable (and pensionable) earnings; a net deduction stays after tax', () => {
    const totals = adjustmentTotalsFromLines([
      earning(1000, true, true),
      {
        amount: 400,
        kind: 'DEDUCTION',
        taxable: true,
        pensionable: true,
        systemField: null,
        taxableDeduction: true,
      },
      { amount: 250, kind: 'DEDUCTION', taxable: false, pensionable: false, systemField: null },
    ]);
    expect(totals.adjustments).toEqual({
      taxableEarnings: 600,
      nonTaxableEarnings: 0,
      pensionableEarnings: 600,
      deductions: 250,
    });
    const onlyDeduction = adjustmentTotalsFromLines([
      {
        amount: 400,
        kind: 'DEDUCTION',
        taxable: true,
        pensionable: false,
        systemField: null,
        taxableDeduction: true,
      },
    ]);
    expect(onlyDeduction.adjustments.taxableEarnings).toBe(-400);
  });
});

