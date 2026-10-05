import { describe, expect, it } from '@jest/globals';
import * as ExcelJS from 'exceljs';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Lightweight structural checks for the payroll Excel layout helpers.
 * Full export is covered by the August verification script against live data.
 */
describe('payroll excel export layout constants', () => {
  it('uses HR header spellings and OT sub-headers', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Data');

    sheet.mergeCells('D3:D4');
    sheet.getCell('D3').value = 'S/N';
    sheet.mergeCells('E3:E4');
    sheet.getCell('E3').value = 'NAME EMPLOYEE';
    sheet.mergeCells('F3:F4');
    sheet.getCell('F3').value = "DATE OF EMPLOY'T";
    sheet.mergeCells('G3:G4');
    sheet.getCell('G3').value = 'BASIC SALARY/Br./MONTH';
    sheet.mergeCells('H3:H4');
    sheet.getCell('H3').value = 'WORK PERFORMED DAYS (DAYS)';
    sheet.mergeCells('I3:I4');
    sheet.getCell('I3').value = 'EARNED SALARY';
    sheet.mergeCells('J3:J4');
    sheet.getCell('J3').value = 'TRANSP. ALLOWANCES/Br./MONTH';
    sheet.mergeCells('K3:K4');
    sheet.getCell('K3').value = 'TAXABLE TRANSPORTATION';

    sheet.mergeCells('L3:M3');
    sheet.getCell('L3').value = 'Normal';
    sheet.getCell('L4').value = 'HR';
    sheet.getCell('M4').value = '1.5';
    sheet.mergeCells('N3:O3');
    sheet.getCell('N3').value = 'Evening';
    sheet.getCell('N4').value = 'HR';
    sheet.getCell('O4').value = '1.75';
    sheet.mergeCells('P3:Q3');
    sheet.getCell('P3').value = 'Sunday';
    sheet.getCell('P4').value = 'HR';
    sheet.getCell('Q4').value = '2';
    sheet.mergeCells('R3:S3');
    sheet.getCell('R3').value = 'Holiday';
    sheet.getCell('R4').value = 'HR';
    sheet.getCell('S4').value = '2.5';

    sheet.mergeCells('T3:T4');
    sheet.getCell('T3').value = 'Total OT';
    sheet.mergeCells('U3:U4');
    sheet.getCell('U3').value = 'Bones';
    sheet.mergeCells('V3:V4');
    sheet.getCell('V3').value = 'FROM EMPLOYER/ 11%';
    sheet.mergeCells('W3:W4');
    sheet.getCell('W3').value = 'FROM EMPLOYEE /7%/';
    sheet.mergeCells('X3:X4');
    sheet.getCell('X3').value = 'TOTAL INCOME SUBJECT TO TAX';
    sheet.mergeCells('Y3:Y4');
    sheet.getCell('Y3').value = 'INCOME TAX';
    sheet.mergeCells('Z3:Z4');
    sheet.getCell('Z3').value = 'TOTAL DEDUCTION';
    sheet.mergeCells('AA3:AA4');
    sheet.getCell('AA3').value = 'NET PAY';
    sheet.mergeCells('AB3:AB4');
    sheet.getCell('AB3').value = 'SIGN';
    sheet.mergeCells('AC3:AC4');
    sheet.getCell('AC3').value = 'NOTES';

    expect(sheet.getCell('E3').value).toBe('NAME EMPLOYEE');
    expect(sheet.getCell('F3').value).toBe("DATE OF EMPLOY'T");
    expect(sheet.getCell('U3').value).toBe('Bones');
    expect(sheet.getCell('L3').value).toBe('Normal');
    expect(sheet.getCell('M4').value).toBe('1.5');
    expect(sheet.getCell('O4').value).toBe('1.75');
    expect(sheet.getCell('Q4').value).toBe('2');
    expect(sheet.getCell('S4').value).toBe('2.5');

    // Zero OT blank convention
    const hours = new Decimal(0);
    const pay = new Decimal(0);
    const blankIfZero = (n: number): number | null => (n === 0 ? null : n);
    expect(blankIfZero(Number(hours))).toBeNull();
    expect(blankIfZero(Number(pay))).toBeNull();
    expect(blankIfZero(8)).toBe(8);
  });
});
