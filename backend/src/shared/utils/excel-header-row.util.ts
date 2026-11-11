import type * as ExcelJS from 'exceljs';

/**
 * Exported spreadsheets put a document header (company, title, generated /
 * prepared-by line) above the table, so the column header row is no longer
 * row 1. Importers scan this many rows for it; plain templates still match
 * on row 1.
 */
export const HEADER_SCAN_ROWS = 15;

/** Rows the exporter adds under the table that are not data. */
const EXPORT_FOOTER_LABELS = new Set(['total', 'no records']);

/**
 * Row number of the column header: the row among the first
 * {@link HEADER_SCAN_ROWS} whose cells match the most known headers.
 * Falls back to row 1 when nothing matches (the importer then reports the
 * missing columns as before).
 */
export function findHeaderRowNumber(
  sheet: ExcelJS.Worksheet,
  isKnownHeader: (text: string) => boolean,
  cellText: (value: ExcelJS.CellValue) => string,
): number {
  let bestRow = 1;
  let bestCount = 0;
  const lastRow = Math.min(sheet.rowCount, HEADER_SCAN_ROWS);
  for (let rowNumber = 1; rowNumber <= lastRow; rowNumber += 1) {
    let count = 0;
    sheet.getRow(rowNumber).eachCell((cell) => {
      if (isKnownHeader(cellText(cell.value))) {
        count += 1;
      }
    });
    if (count > bestCount) {
      bestCount = count;
      bestRow = rowNumber;
    }
  }
  return bestRow;
}

/** True for the exporter's "Total" / "No records" row under the table. */
export function isExportFooterRow(
  row: ExcelJS.Row,
  cellText: (value: ExcelJS.CellValue) => string,
): boolean {
  const first = cellText(row.getCell(1).value).trim().toLowerCase();
  return EXPORT_FOOTER_LABELS.has(first);
}
