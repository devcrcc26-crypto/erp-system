import * as ExcelJS from 'exceljs';
import type { BilingualColumn } from '../constants/project-export.constants';

const HEADER_FILL: ExcelJS.FillPattern = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE5E7EB' },
};

/**
 * Writes bilingual header rows and applies template styling.
 */
export function applyBilingualHeaders(
  sheet: ExcelJS.Worksheet,
  columns: BilingualColumn[],
): void {
  const headerRowZh = sheet.getRow(1);
  const headerRowEn = sheet.getRow(2);

  columns.forEach((column, index) => {
    const columnIndex = index + 1;
    headerRowZh.getCell(columnIndex).value = column.zh;
    headerRowEn.getCell(columnIndex).value = column.en;
    sheet.getColumn(columnIndex).width = column.width;
  });

  for (const row of [headerRowZh, headerRowEn]) {
    row.font = { bold: true };
    row.eachCell((cell) => {
      cell.fill = HEADER_FILL;
    });
  }

  sheet.views = [{ state: 'frozen', ySplit: 2, activeCell: 'A3' }];
}

/**
 * Serializes a workbook to an XLSX buffer.
 */
export async function workbookToBuffer(
  workbook: ExcelJS.Workbook,
): Promise<Buffer> {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
