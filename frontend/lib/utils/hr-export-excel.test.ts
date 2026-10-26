import type ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildHrExcelWorkbook } from './hr-export-excel';

const columns = [
  { header: 'Employee', key: 'employee' },
  { header: 'Amount (ETB)', key: 'amount' },
];

function plainText(value: ExcelJS.CellValue): string {
  if (value && typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  return String(value ?? '');
}

describe('buildHrExcelWorkbook', () => {
  it('lays a sheet out as a monochrome document', () => {
    const workbook = buildHrExcelWorkbook({
      generatedAt: '2026-10-26T09:05:00',
      preparedBy: 'Abebe Kebede',
      sheets: [
        {
          name: 'Expense Claims',
          columns,
          rows: [
            { employee: 'Sara Tesfaye', amount: 1250.5 },
            { employee: 'Dawit Alemu', amount: 749.5 },
          ],
        },
      ],
    });
    const sheet = workbook.getWorksheet('Expense Claims')!;

    // Header block: company, title, metadata strip closed by a solid rule.
    expect(sheet.getCell('A1').value).toBe('CRCC INTERNATIONAL CONSULTING');
    expect(sheet.getCell('A2').value).toBe('Expense Claims');
    expect(sheet.getCell('A2').font?.size).toBe(16);
    expect(plainText(sheet.getCell('A3').value)).toBe(
      'Generated  26 Oct 2026, 09:05      Prepared by  Abebe Kebede      Records  2',
    );
    expect(sheet.getCell('B3').border?.bottom?.style).toBe('medium');

    // Table header on row 5: bold, ruled, frozen, filtered, repeated in print.
    expect(sheet.getCell('A5').value).toBe('Employee');
    expect(sheet.getCell('A5').font?.bold).toBe(true);
    expect(sheet.getCell('B5').alignment?.horizontal).toBe('right');
    expect(sheet.getCell('A5').border?.bottom?.style).toBe('thin');
    expect(sheet.views[0]).toMatchObject({
      state: 'frozen',
      ySplit: 5,
      showGridLines: false,
    });
    expect(sheet.pageSetup.printTitlesRow).toBe('5:5');

    // Body: hairline dividers, money formatted.
    expect(sheet.getCell('A6').value).toBe('Sara Tesfaye');
    expect(sheet.getCell('B6').value).toBe(1250.5);
    expect(sheet.getCell('B6').numFmt).toBe('#,##0.00');
    expect(sheet.getCell('A6').border?.bottom?.style).toBe('hair');
    expect(sheet.getCell('A6').border?.left).toBeUndefined();

    // Totals row with a live SUM.
    expect(sheet.getCell('A8').value).toBe('Total');
    expect(sheet.getCell('B8').value).toEqual({
      formula: 'SUM(B6:B7)',
      result: 2000,
    });
    expect(sheet.getCell('B8').font?.bold).toBe(true);

    expect(sheet.headerFooter.oddFooter).toContain(
      'CRCC International Consulting - Expense Claims',
    );
    expect(sheet.headerFooter.oddFooter).toContain('Page &P of &N');
  });

  it('uses the document title with sheet names as subtitles', () => {
    const workbook = buildHrExcelWorkbook({
      documentTitle: 'HR Report',
      sheets: [
        { name: 'Summary', columns, rows: [] },
        { name: 'Payroll by Department', columns, rows: [] },
      ],
    });
    const sheet = workbook.getWorksheet('Payroll by Department')!;

    expect(sheet.getCell('A2').value).toBe('HR Report');
    expect(sheet.getCell('A3').value).toBe('Payroll by Department');
    // Subtitle pushes the table header down one row.
    expect(sheet.getCell('A6').value).toBe('Employee');
    expect(sheet.getCell('A7').value).toBe('No records');
  });

  it('formats counts without decimals and skips totals for non-money columns', () => {
    const workbook = buildHrExcelWorkbook({
      sheets: [
        {
          name: 'Headcount',
          columns: [
            { header: 'Department', key: 'department' },
            { header: 'Employees', key: 'employees' },
          ],
          rows: [
            { department: 'Design', employees: 1200 },
            { department: 'Transport', employees: 35 },
          ],
        },
      ],
    });
    const sheet = workbook.getWorksheet('Headcount')!;

    expect(sheet.getCell('B6').numFmt).toBe('#,##0');
    expect(sheet.getCell('A8').value).toBeNull();
  });

  it('keeps sheet names valid and unique', () => {
    const workbook = buildHrExcelWorkbook({
      sheets: [
        { name: 'Leave / Overtime: by employee and department', columns, rows: [] },
        { name: 'Leave / Overtime: by employee and department', columns, rows: [] },
      ],
    });
    const names = workbook.worksheets.map((sheet) => sheet.name);

    expect(names[0]).toHaveLength(31);
    expect(names[0]).not.toMatch(/[[\]:*?/\\]/);
    expect(names[1]).toMatch(/\(2\)$/);
  });
});
