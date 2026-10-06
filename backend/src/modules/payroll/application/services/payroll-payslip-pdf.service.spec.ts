import { createRequire } from 'module';
import { describe, expect, it } from '@jest/globals';
import { PayrollPayslipPdfService } from './payroll-payslip-pdf.service';
import type { PayslipPdfModel } from './payroll-payslip-pdf.layout';

const nodeRequire = createRequire(__filename);

interface FontGlyph {
  id: number;
}

interface OpenedFont {
  glyphForCodePoint: (codePoint: number) => FontGlyph;
}

function armiasModel(): PayslipPdfModel {
  return {
    month: 10,
    year: 2026,
    runNumber: 'PR-2026-10',
    generatedAt: new Date('2026-10-05T00:00:00.000Z'),
    employeeName: 'Armias Bekele (阿米亚斯)',
    employeeCode: 'EMP-014',
    department: '工程部',
    discipline: '土建',
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
  };
}

describe('PayrollPayslipPdfService', () => {
  const service = new PayrollPayslipPdfService();

  it('embeds Noto Sans SC glyphs for the bilingual labels', () => {
    const fontkit = nodeRequire('fontkit') as {
      openSync: (path: string) => OpenedFont;
    };
    const font = fontkit.openSync(service.resolveFontPath());
    for (const char of '工资单基本工资加班交通补贴奖金养老金个人所得税应发合计扣除实发公司员工部门专业银行账号计薪天数不适用工程部土建阿米亚斯') {
      const codePoint = char.codePointAt(0);
      expect(codePoint).toBeDefined();
      expect(font.glyphForCodePoint(codePoint ?? 0).id).not.toBe(0);
    }
  });

  it('renders one payslip under 500 KB', async () => {
    const buffer = await service.render(armiasModel());
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.length).toBeLessThan(500 * 1024);
    expect(buffer.toString('latin1')).toContain('NotoSansSC');
  });
});
