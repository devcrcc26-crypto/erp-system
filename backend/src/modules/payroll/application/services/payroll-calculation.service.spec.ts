import { describe, expect, it } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import { PayrollCalculationService } from './payroll-calculation.service';

describe('PayrollCalculationService', () => {
  const calc = new PayrollCalculationService();

  describe('solveBonusForNet', () => {
    it('matches August sheet row 1 (basic 13000, transport 900, net 20000)', () => {
      const bonus = calc.solveBonusForNet({
        basicSalary: 13000,
        transportAllowance: 900,
        targetNet: 20000,
        taxableThreshold: 2200,
        pensionApplicable: true,
        taxApplicable: true,
      });

      expect(bonus).toBeCloseTo(14630.77, 2);

      const result = calc.calculate({
        basicSalary: 13000,
        transportAllowance: 900,
        monthlyBonus: bonus,
        bonusTopUp: 0,
        payrollDays: 30,
        overtimeHours: {
          normalHours: 0,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        },
        taxableThreshold: 2200,
        pensionApplicable: true,
        taxApplicable: true,
      });

      expect(result.pensionEmployee).toBeCloseTo(910, 2);
      expect(result.incomeTax).toBeCloseTo(7620.77, 2);
      expect(result.netPay).toBeCloseTo(20000, 2);
    });

    it('throws when target net is below basic+transport take-home', () => {
      expect(() =>
        calc.solveBonusForNet({
          basicSalary: 13000,
          transportAllowance: 900,
          targetNet: 1000,
          taxableThreshold: 2200,
        }),
      ).toThrow(BadRequestException);
    });
  });

  describe('pensionApplicable / taxApplicable', () => {
    it('zeros pension when pensionApplicable is false', () => {
      const result = calc.calculate({
        basicSalary: 13000,
        transportAllowance: 900,
        monthlyBonus: 0,
        bonusTopUp: 0,
        payrollDays: 30,
        overtimeHours: {
          normalHours: 0,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        },
        taxableThreshold: 2200,
        pensionApplicable: false,
        taxApplicable: true,
      });
      expect(result.pensionEmployee).toBe(0);
      expect(result.pensionEmployer).toBe(0);
    });

    it('zeros tax when taxApplicable is false', () => {
      const result = calc.calculate({
        basicSalary: 13000,
        transportAllowance: 900,
        monthlyBonus: 14630.77,
        bonusTopUp: 0,
        payrollDays: 30,
        overtimeHours: {
          normalHours: 0,
          eveningHours: 0,
          sundayHours: 0,
          holidayHours: 0,
        },
        taxableThreshold: 2200,
        pensionApplicable: true,
        taxApplicable: false,
      });
      expect(result.incomeTax).toBe(0);
    });
  });
});
