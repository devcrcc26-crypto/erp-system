import { describe, expect, it } from '@jest/globals';
import {
  buildPayslipLines,
  collectPayslipText,
  formatEmployeeName,
  formatEtb,
  maskAccountLast4,
  payslipPdfFileName,
  type PayslipPdfModel,
} from './payroll-payslip-pdf.layout';

function model(overrides: Partial<PayslipPdfModel> = {}): PayslipPdfModel {
  return {
    month: 10,
    year: 2026,
    runNumber: 'PR-2026-10',
    generatedAt: new Date('2026-10-05T00:00:00.000Z'),
    employeeName: 'Armias Bekele',
    employeeCode: 'EMP-014',
    department: 'Engineering',
    discipline: 'Civil',
    bankName: 'Commercial Bank of Ethiopia',
    bankAccountMasked: '••••4412',
    paidDays: 30,
    basicSalary: 13000,
    earnedSalary: 13000,
    normalOtHours: 8,
    eveningOtHours: 0,
    sundayOtHours: 0,
    holidayOtHours: 0,
    normalOtPay: 812.5,
    eveningOtPay: 0,
    sundayOtPay: 0,
    holidayOtPay: 0,
    transportAllowance: 2200,
    monthlyBonus: 3500,
    bonusTopUp: 0,
    bonusTopUpReason: null,
    contractNetBonus: 0,
    netTopUp: 0,
    netTopUpReason: null,
    grossIncome: 19512.5,
    pensionApplicable: true,
    pensionEmployee: 910,
    pensionEmployer: 1430,
    incomeTax: 935.32,
    totalDeductions: 1845.32,
    netPay: 17667.18,
    ...overrides,
  };
}

function textOf(lines: ReturnType<typeof buildPayslipLines>): string {
  return lines
    .map((line) => {
      if (line.kind === 'amount' || line.kind === 'total' || line.kind === 'net') {
        return `${line.label} ${line.amount}`;
      }
      if (line.kind === 'pair') {
        return `${line.left} ${line.right}`;
      }
      if (line.kind === 'brand') {
        return `${line.left} ${line.right}`;
      }
      if (line.kind === 'section') {
        return `${line.label} ${line.trailing ?? ''}`;
      }
      if (line.kind === 'right' || line.kind === 'note') {
        return line.text;
      }
      return '';
    })
    .join('\n');
}

describe('payslip layout', () => {
  it('formats money with separators and masks the account', () => {
    expect(formatEtb(17667.18)).toBe('17,667.18');
    expect(maskAccountLast4('100012344412')).toBe('••••4412');
    expect(maskAccountLast4('4412')).toBe('••••4412');
    expect(payslipPdfFileName({
      year: 2026,
      month: 10,
      employeeCode: 'EMP-014',
      employeeName: 'Armias Bekele',
    })).toBe('Payslip_2026_10_EMP-014_Armias_Bekele.pdf');
  });

  it('keeps Armias figures and omits overtime lines with zero hours', () => {
    const body = textOf(buildPayslipLines(model()));
    expect(body).toContain('PAYSLIP / 工资单');
    expect(body).toContain('October 2026');
    expect(body).toContain('Basic salary / 基本工资');
    expect(body).toContain('13,000.00 ÷ 30 × 30');
    expect(body).toContain('Normal   8 h × 1.5');
    expect(body).toContain('812.50');
    expect(body).not.toContain('× 1.75');
    expect(body).not.toContain('× 2.0');
    expect(body).not.toContain('× 2.5');
    expect(body).not.toContain('额外奖金');
    expect(body).toContain('Bonus / 奖金');
    expect(body).toContain('3,500.00');
    expect(body).toContain('910.00');
    expect(body).toContain('935.32');
    expect(body).toContain('ETB 17,667.18');
    expect(body).toContain('••••4412');
    expect(body).not.toContain('100012344412');
  });

  it('shows pension as not applicable for expatriate contracts and keeps a top-up reason', () => {
    const body = textOf(
      buildPayslipLines(
        model({
          pensionApplicable: false,
          pensionEmployee: 0,
          pensionEmployer: 0,
          bonusTopUp: 500,
          bonusTopUpReason: 'Site completion',
          eveningOtHours: 2,
          eveningOtPay: 200,
        }),
      ),
    );
    expect(body).toContain('Pension (employee 7%) / 养老金 Not applicable / 不适用');
    expect(body).toContain('公司养老金: Not applicable / 不适用');
    expect(body).toContain('Bonus top-up / 额外奖金  (Site completion)');
    expect(body).toContain('Evening   2 h × 1.75');
  });

  it('shows net bonus after deductions and before net pay', () => {
    const body = textOf(
      buildPayslipLines(
        model({
          contractNetBonus: 2000,
          netTopUp: 30000,
          netTopUpReason: 'Project completion',
          netPay: 52000,
        }),
      ),
    );
    expect(body).toContain('Net bonus (after tax) / 税后奖金');
    expect(body).toContain('32,000.00');
    expect(body).toContain('Includes one-time net top-up 30,000.00 - Project completion');
    const netBonusIdx = body.indexOf('Net bonus (after tax)');
    const netPayIdx = body.indexOf('NET PAY / 实发工资');
    expect(netBonusIdx).toBeGreaterThan(-1);
    expect(netPayIdx).toBeGreaterThan(netBonusIdx);
  });

  it('includes the Chinese labels in the text passed to the font subset', () => {
    const text = collectPayslipText(model({ employeeName: 'Armias (阿米亚斯)' }));
    for (const char of '工资单基本工资加班交通补贴奖金养老金个人所得税应发合计扣除实发公司员工部门专业银行账号计薪天数阿米亚斯') {
      expect(text).toContain(char);
    }
  });

  it('formatEmployeeName includes first, middle, and last', () => {
    expect(
      formatEmployeeName({
        firstName: 'Sara',
        middleName: 'Alemu',
        lastName: 'Tesfaye',
      }),
    ).toBe('Sara Alemu Tesfaye');
  });
});
