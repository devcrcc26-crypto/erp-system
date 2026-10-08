import { BadRequestException, Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';

export interface OvertimeHours {
  normalHours: number;
  eveningHours: number;
  sundayHours: number;
  holidayHours: number;
}

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
  taxableThreshold: number; // transport threshold, default 2200
  /** When false, employee and employer pension are 0. Defaults to true. */
  pensionApplicable?: boolean;
  /** When false, income tax is 0. Defaults to true. */
  taxApplicable?: boolean;
}

export interface SolveBonusForNetInput {
  basicSalary: number;
  transportAllowance: number;
  targetNet: number;
  taxableThreshold: number;
  pensionApplicable?: boolean;
  taxApplicable?: boolean;
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
  /** Progressive Ethiopian income tax table. */
  calculateIncomeTax(taxableIncome: number): number {
    if (taxableIncome <= 2000) return 0;
    if (taxableIncome <= 4000) return taxableIncome * 0.15 - 300;
    if (taxableIncome <= 7000) return taxableIncome * 0.2 - 500;
    if (taxableIncome <= 10000) return taxableIncome * 0.25 - 850;
    if (taxableIncome <= 14000) return taxableIncome * 0.3 - 1350;
    return taxableIncome * 0.35 - 2050;
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
      taxableThreshold,
      pensionApplicable = true,
      taxApplicable = true,
    } = input;

    const payrollDays = this.round(Math.max(0, payrollDaysInput));
    const earnedSalary = this.round(
      earnedSalaryOverride != null
        ? earnedSalaryOverride
        : (basicSalary / 30) * payrollDays,
    );

    // Overtime hourly base is contractual basic ÷ 192 (holiday ÷ 196), not earned.
    const hourlyBase = basicSalary / 192;
    const holidayHourlyBase = basicSalary / 196;

    const normalOtPay = this.round(hourlyBase * overtimeHours.normalHours * 1.5);
    const eveningOtPay = this.round(
      hourlyBase * overtimeHours.eveningHours * 1.75,
    );
    const sundayOtPay = this.round(
      hourlyBase * overtimeHours.sundayHours * 2.0,
    );
    const holidayOtPay = this.round(
      holidayHourlyBase * overtimeHours.holidayHours * 2.5,
    );
    const totalOtPay = this.round(
      normalOtPay + eveningOtPay + sundayOtPay + holidayOtPay,
    );

    // Transport and (taxable) bonus are paid in full — not prorated by paid days.
    // CCECC rule: transportation allowance is fully non-taxable (no taxable portion).
    const taxableTransport = 0;
    const nonTaxableTransport = this.round(transportAllowance);

    const totalBonus = this.round(monthlyBonus + bonusTopUp);
    const grossIncome = this.round(
      earnedSalary + totalOtPay + totalBonus + transportAllowance,
    );

    // Tax is calculated once on the whole month's taxable income.
    const taxableIncome = this.round(
      earnedSalary + totalOtPay + totalBonus + taxableTransport,
    );

    // Pension is 7% / 11% of earned salary (expatriates/freelancers: caller sets pensionApplicable false).
    const pensionEmployee = pensionApplicable
      ? this.round(earnedSalary * 0.07)
      : 0;
    const pensionEmployer = pensionApplicable
      ? this.round(earnedSalary * 0.11)
      : 0;
    const incomeTax = taxApplicable
      ? this.round(this.calculateIncomeTax(taxableIncome))
      : 0;
    const totalDeductions = this.round(pensionEmployee + incomeTax);

    // Net bonuses are after tax and never enter taxable income / gross / deductions.
    const totalNetBonus = this.round(contractNetBonus + netTopUp);
    const netPay = this.round(grossIncome - totalDeductions + totalNetBonus);

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
