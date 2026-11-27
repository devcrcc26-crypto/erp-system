import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import {
  POLICY_DEFAULTS,
  incomeTaxFromBrackets,
  type PolicyValues,
} from '../../../../shared/policy/policy-definitions';

/** Policy values the payroll calculation reads (as of the payroll month). */
export type PayrollCalcPolicy = Pick<
  PolicyValues,
  | 'pensionEmployeePct'
  | 'pensionEmployerPct'
  | 'incomeTaxBrackets'
  | 'transportTaxable'
  | 'hoursDivisor'
  | 'holidayHoursDivisor'
  | 'multipliers'
>;

export interface OvertimeHours {
  normalHours: number;
  eveningHours: number;
  sundayHours: number;
  holidayHours: number;
}

/**
 * Adjustment-line totals for one entry (PayrollAdjustmentLine, excluding the
 * taxable / net bonus types, which use bonusTopUp / netTopUp). All amounts >= 0.
 */
export interface PayrollAdjustmentTotals {
  /** Earnings added to gross and taxable income before tax. */
  taxableEarnings: number;
  /** Earnings added to net pay after tax (not in gross, not taxed). */
  nonTaxableEarnings: number;
  /** Earnings (taxable or not) added to the pension base. */
  pensionableEarnings: number;
  /** Deductions subtracted from net pay after tax (e.g. recoveries). */
  deductions: number;
}

export const ZERO_ADJUSTMENTS: PayrollAdjustmentTotals = {
  taxableEarnings: 0,
  nonTaxableEarnings: 0,
  pensionableEarnings: 0,
  deductions: 0,
};

export interface PayrollCalculationInput {
  basicSalary: number;
  transportAllowance: number;
  monthlyBonus: number;
  bonusTopUp: number;
  /**
   * Recurring net bonus from the contract (after tax, not taxed).
   * Defaults to 0. Not prorated by paid days.
   */
  contractNetBonus?: number;
  /**
   * One-time net top-up for this run (after tax, not taxed).
   * Defaults to 0.
   */
  netTopUp?: number;
  /** Paid days after absences/leave in the employed window (0–30). */
  payrollDays: number;
  /**
   * Pre-computed earned salary (multi-contract months). When omitted,
   * earned = basicSalary / 30 × payrollDays using month-end basic.
   */
  earnedSalary?: number;
  overtimeHours: OvertimeHours;
  /**
   * When set (e.g. multi-contract OT priced per period basic), use these pay
   * amounts instead of recomputing from month-end basic × hours.
   */
  overtimePay?: {
    normalOtPay: number;
    eveningOtPay: number;
    sundayOtPay: number;
    holidayOtPay: number;
  };
  taxableThreshold: number; // transport threshold, default 2200
  /** When false, employee and employer pension are 0. Defaults to true. */
  pensionApplicable?: boolean;
  /** When false, income tax is 0. Defaults to true. */
  taxApplicable?: boolean;
  /** Policy in force for the payroll month; omitted = code defaults. */
  policy?: PayrollCalcPolicy;
  /** Final-settlement amounts that are taxed (in gross + taxable income, no pension). */
  settlementTaxable?: number;
  /** Final-settlement amounts that are not taxed (in gross only, no pension). */
  settlementNonTaxable?: number;
  /** Adjustment lines in this run; omitted = none. */
  adjustments?: PayrollAdjustmentTotals;
}

export interface SolveBonusForNetInput {
  basicSalary: number;
  transportAllowance: number;
  targetNet: number;
  taxableThreshold: number;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
  policy?: PayrollCalcPolicy;
}

export interface PayrollCalculationResult {
  payrollDays: number;
  earnedSalary: number;

  normalOtPay: number;
  eveningOtPay: number;
  sundayOtPay: number;
  holidayOtPay: number;
  totalOtPay: number;

  taxableTransport: number;
  nonTaxableTransport: number;

  grossIncome: number;
  taxableIncome: number;

  pensionEmployee: number;
  pensionEmployer: number;
  incomeTax: number;
  totalDeductions: number;

  /** contractNetBonus + netTopUp (after tax, not taxed). */
  totalNetBonus: number;

  /** Adjustment-line totals applied (see PayrollAdjustmentTotals). */
  adjustmentTaxable: number;
  adjustmentNonTaxable: number;
  adjustmentPensionable: number;
  adjustmentDeductions: number;

  netPay: number;
}

const ZERO_OT: OvertimeHours = {
  normalHours: 0,
  eveningHours: 0,
  sundayHours: 0,
  holidayHours: 0,
};

@Injectable()
export class PayrollCalculationService {
  /** Progressive income tax from the configured bands (default: Ethiopian table). */
  calculateIncomeTax(
    taxableIncome: number,
    brackets = POLICY_DEFAULTS.incomeTaxBrackets,
  ): number {
    return incomeTaxFromBrackets(taxableIncome, brackets);
  }

  /** Main calculation returns all computed fields. */
  calculate(input: PayrollCalculationInput): PayrollCalculationResult {
    const {
      basicSalary,
      transportAllowance,
      monthlyBonus,
      bonusTopUp,
      contractNetBonus = 0,
      netTopUp = 0,
      payrollDays: payrollDaysInput,
      earnedSalary: earnedSalaryOverride,
      overtimeHours,
      overtimePay: overtimePayOverride,
      taxableThreshold,
      pensionApplicable = true,
      taxApplicable = true,
      policy = POLICY_DEFAULTS,
      settlementTaxable = 0,
      settlementNonTaxable = 0,
      adjustments = ZERO_ADJUSTMENTS,
    } = input;
    const adjustmentTaxable = this.round(Math.max(0, adjustments.taxableEarnings));
    const adjustmentNonTaxable = this.round(Math.max(0, adjustments.nonTaxableEarnings));
    const adjustmentPensionable = this.round(Math.max(0, adjustments.pensionableEarnings));
    const adjustmentDeductions = this.round(Math.max(0, adjustments.deductions));

    const payrollDays = this.round(Math.max(0, payrollDaysInput));
    const earnedSalary = this.round(
      earnedSalaryOverride != null
        ? earnedSalaryOverride
        : (basicSalary / 30) * payrollDays,
    );

    // Overtime hourly base is contractual basic ÷ hoursDivisor (holiday ÷ holidayHoursDivisor), not earned.
    // Multi-contract months pass pre-priced overtimePay (per period basics).
    const hourlyBase = basicSalary / policy.hoursDivisor;
    const holidayHourlyBase = basicSalary / policy.holidayHoursDivisor;
    const rates = policy.multipliers;

    const normalOtPay = this.round(
      overtimePayOverride?.normalOtPay ??
        hourlyBase * overtimeHours.normalHours * rates.regular,
    );
    const eveningOtPay = this.round(
      overtimePayOverride?.eveningOtPay ??
        hourlyBase * overtimeHours.eveningHours * rates.night,
    );
    const sundayOtPay = this.round(
      overtimePayOverride?.sundayOtPay ??
        hourlyBase * overtimeHours.sundayHours * rates.weekend,
    );
    const holidayOtPay = this.round(
      overtimePayOverride?.holidayOtPay ??
        holidayHourlyBase * overtimeHours.holidayHours * rates.holiday,
    );
    const totalOtPay = this.round(
      normalOtPay + eveningOtPay + sundayOtPay + holidayOtPay,
    );

    // Transport and (taxable) bonus are paid in full - not prorated by paid days.
    // Default (CRCC): transport is fully non-taxable; transportTaxable makes it fully taxable.
    const taxableTransport = policy.transportTaxable ? this.round(transportAllowance) : 0;
    const nonTaxableTransport = policy.transportTaxable ? 0 : this.round(transportAllowance);

    const totalBonus = this.round(monthlyBonus + bonusTopUp);
    const grossIncome = this.round(
      earnedSalary +
        totalOtPay +
        totalBonus +
        transportAllowance +
        settlementTaxable +
        settlementNonTaxable +
        adjustmentTaxable,
    );

    // Tax is calculated once on the whole month's taxable income.
    const taxableIncome = this.round(
      earnedSalary +
        totalOtPay +
        totalBonus +
        taxableTransport +
        settlementTaxable +
        adjustmentTaxable,
    );

    // Pension % of the pension base: earned salary plus adjustments flagged
    // pensionable (e.g. salary arrears). Bonuses, severance, OT and allowances
    // are never in it. Expatriates: caller sets pensionApplicable false;
    // freelancers always pay.
    const pensionBase = earnedSalary + adjustmentPensionable;
    const pensionEmployee = pensionApplicable
      ? this.round(pensionBase * (policy.pensionEmployeePct / 100))
      : 0;
    const pensionEmployer = pensionApplicable
      ? this.round(pensionBase * (policy.pensionEmployerPct / 100))
      : 0;
    const incomeTax = taxApplicable
      ? this.round(this.calculateIncomeTax(taxableIncome, policy.incomeTaxBrackets))
      : 0;
    const totalDeductions = this.round(pensionEmployee + incomeTax);

    // Net bonuses are after tax and never enter taxable income / gross / deductions.
    const totalNetBonus = this.round(contractNetBonus + netTopUp);
    // Non-taxable adjustment earnings are added and adjustment deductions taken
    // off after tax. totalDeductions stays pension + income tax.
    const netPay = this.round(
      grossIncome -
        totalDeductions +
        totalNetBonus +
        adjustmentNonTaxable -
        adjustmentDeductions,
    );

    return {
      payrollDays,
      earnedSalary,
      normalOtPay,
      eveningOtPay,
      sundayOtPay,
      holidayOtPay,
      totalOtPay,
      taxableTransport,
      nonTaxableTransport,
      grossIncome,
      taxableIncome,
      pensionEmployee,
      pensionEmployer,
      incomeTax,
      totalDeductions,
      totalNetBonus,
      adjustmentTaxable,
      adjustmentNonTaxable,
      adjustmentPensionable,
      adjustmentDeductions,
      netPay,
    };
  }

  /**
   * Finds monthlyBonus such that calculate() with 0 absent / 0 OT yields targetNet.
   * Binary search to 0.01 ETB. Throws if target is unreachable.
   */
  solveBonusForNet(input: SolveBonusForNetInput): number {
    const {
      basicSalary,
      transportAllowance,
      targetNet,
      taxableThreshold,
      pensionApplicable = true,
      taxApplicable = true,
      policy,
    } = input;

    if (!(targetNet > 0)) {
      throw new BadRequestException('Target net salary must be greater than 0');
    }

    const netAt = (bonus: number): number =>
      this.calculate({
        basicSalary,
        transportAllowance,
        monthlyBonus: bonus,
        bonusTopUp: 0,
        payrollDays: 30,
        overtimeHours: ZERO_OT,
        taxableThreshold,
        pensionApplicable,
        taxApplicable,
        policy,
      }).netPay;

    const netAtZero = netAt(0);
    if (targetNet < netAtZero - 0.005) {
      throw new BadRequestException(
        `Target net ${targetNet.toFixed(2)} ETB is below the ${netAtZero.toFixed(2)} ETB already produced by basic salary and transport with zero bonus`,
      );
    }

    let low = 0;
    let high = Math.max(targetNet * 10, 1);
    const netAtHigh = netAt(high);
    if (netAtHigh + 0.005 < targetNet) {
      throw new BadRequestException(
        `Target net ${targetNet.toFixed(2)} ETB cannot be reached within the solver bounds`,
      );
    }

    for (let i = 0; i < 80; i += 1) {
      const mid = (low + high) / 2;
      const net = netAt(mid);
      if (Math.abs(net - targetNet) <= 0.005) {
        return this.round(mid);
      }
      if (net < targetNet) {
        low = mid;
      } else {
        high = mid;
      }
    }

    return this.round((low + high) / 2);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }

  toNumber(value: Decimal | null | undefined): number {
    if (value == null) return 0;
    return Number(value);
  }
}
