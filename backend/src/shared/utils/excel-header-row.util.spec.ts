import * as ExcelJS from 'exceljs';
import {
  findHeaderRowNumber,
  isExportFooterRow,
} from './excel-header-row.util';
import {
  DOCUMENT_TABLE_START_ROW,
  finishDocumentSheet,
  startDocumentSheet,
} from './excel-document.util';

const KNOWN = new Set(['email', 'first name', 'last name']);
const isKnown = (text: string): boolean => KNOWN.has(text.trim().toLowerCase());
const text = (value: ExcelJS.CellValue): string => {
  if (value && typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  return value == null ? '' : String(value);
};

describe('findHeaderRowNumber', () => {
  it('finds the header on row 1 of a plain template', () => {
    const sheet = new ExcelJS.Workbook().addWorksheet('Users');
    sheet.addRow(['Email', 'First Name', 'Last Name']);
    sheet.addRow(['a@example.com', 'Abebe', 'Kebede']);

    expect(findHeaderRowNumber(sheet, isKnown, text)).toBe(1);
  });

  it('finds the header under an exported document title block', () => {
    const sheet = new ExcelJS.Workbook().addWorksheet('Users');
    const layout = startDocumentSheet(
      sheet,
      { companyName: 'CRCC International Consulting', title: 'Users' },
      [['Email', 'First Name', 'Last Name']],
      [30, 16, 16],
    );
    sheet.addRow(['a@example.com', 'Abebe', 'Kebede']);
    finishDocumentSheet(sheet, layout);

    const headerRow = findHeaderRowNumber(sheet, isKnown, text);
    expect(headerRow).toBe(DOCUMENT_TABLE_START_ROW);
    expect(sheet.getRow(headerRow + 1).getCell(1).value).toBe('a@example.com');
  });

  it('falls back to row 1 when nothing matches', () => {
    const sheet = new ExcelJS.Workbook().addWorksheet('Other');
    sheet.addRow(['Something', 'Else']);

    expect(findHeaderRowNumber(sheet, isKnown, text)).toBe(1);
  });
});

describe('isExportFooterRow', () => {
  it('recognises the exporter total and empty rows only', () => {
    const sheet = new ExcelJS.Workbook().addWorksheet('Rows');
    const total = sheet.addRow(['Total', '', 1200]);
    const empty = sheet.addRow(['No records']);
    const data = sheet.addRow(['Totalitarian Ltd', 'x']);

    expect(isExportFooterRow(total, text)).toBe(true);
    expect(isExportFooterRow(empty, text)).toBe(true);
    expect(isExportFooterRow(data, text)).toBe(false);
  });
});

describe('document sheet layout', () => {
  it('writes the title block, metadata and print setup', () => {
    const sheet = new ExcelJS.Workbook().addWorksheet('Read statistics');
    const layout = startDocumentSheet(
      sheet,
      {
        companyName: 'CRCC International Consulting',
        title: 'ANN-001 · Holiday notice',
        generatedAt: new Date(2026, 9, 26, 9, 5),
        preparedBy: 'Abebe Kebede',
        details: [['Read', '1 of 2']],
      },
      [['Name', 'Read at']],
      [30, 20],
    );
    sheet.addRow(['Sara Tesfaye', '2026-10-25 10:00']);
    sheet.addRow(['Dawit Alemu', '']);
    finishDocumentSheet(sheet, layout);

    expect(sheet.getCell('A1').value).toBe('CRCC INTERNATIONAL CONSULTING');
    expect(sheet.getCell('A2').value).toBe('ANN-001 · Holiday notice');
    expect(text(sheet.getCell('A3').value)).toBe(
      'Generated  26 Oct 2026, 09:05      Prepared by  Abebe Kebede      Records  2      Read  1 of 2',
    );
    expect(sheet.getCell('A5').font?.bold).toBe(true);
    expect(sheet.getCell('A6').border?.bottom?.style).toBe('hair');
    expect(sheet.views[0]).toMatchObject({ ySplit: 5, showGridLines: false });
    expect(sheet.pageSetup.printTitlesRow).toBe('5:5');
    expect(sheet.headerFooter.oddFooter).toContain('Page &P of &N');
  });
});
