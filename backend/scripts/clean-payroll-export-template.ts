/**
 * Builds a sanitized payroll export template from the design workbook.
 * Never writes to the source file.
 */
import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import {
  clearCellValue,
  DATA_FIRST_COL,
  DATA_FIRST_EMP_ROW,
  DATA_LAST_COL,
  DATA_LAST_EMP_ROW,
  DATA_SHEET,
  DATA_TOTALS_FIRST_COL,
  DATA_TOTALS_LAST_COL,
  DATA_TOTALS_ROW,
  parseMergeRange,
  PAYROLL_EXPORT_TEMPLATE_OUTPUT,
  PAYROLL_FIRST_COL,
  PAYROLL_FIRST_EMP_ROW,
  PAYROLL_LAST_COL,
  PAYROLL_LAST_EMP_ROW,
  PAYROLL_SHEET,
  PAYROLL_TEMPLATE_SOURCE,
  PAYROLL_TOTALS_FIRST_COL,
  PAYROLL_TOTALS_LAST_COL,
  PAYROLL_TOTALS_ROW,
} from './lib/payroll-export-template.util';

/** Footer summary amount cells (not employee rows) to wipe. */
const PAYROLL_FOOTER_AMOUNT_CELLS: Array<{ row: number; col: number }> = [
  { row: 111, col: 4 },
  { row: 112, col: 4 },
  { row: 112, col: 6 },
  { row: 112, col: 7 },
  { row: 113, col: 4 },
  { row: 113, col: 6 },
  { row: 113, col: 7 },
  { row: 113, col: 8 },
  { row: 113, col: 9 },
];

function getWorksheetMerges(ws: ExcelJS.Worksheet): string[] {
  return (ws as { model?: { merges?: string[] } }).model?.merges ?? [];
}

function unmergeEmployeeRanges(
  ws: ExcelJS.Worksheet,
  minRow: number,
  maxRow: number,
  minCol?: number,
  maxCol?: number,
): void {
  const merges = getWorksheetMerges(ws);
  for (const range of merges) {
    const parsed = parseMergeRange(range);
    if (!parsed) continue;
    const { r1, r2, c1, c2 } = parsed;
    if (r1 < minRow || r2 > maxRow) continue;
    if (minCol != null && (c1 < minCol || c2 > maxCol!)) continue;
    ws.unMergeCells(range);
  }
}

function clearRect(
  ws: ExcelJS.Worksheet,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): void {
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      clearCellValue(ws.getCell(row, col));
    }
  }
}

function cleanDataSheet(ws: ExcelJS.Worksheet): void {
  unmergeEmployeeRanges(
    ws,
    DATA_FIRST_EMP_ROW,
    DATA_LAST_EMP_ROW,
    DATA_FIRST_COL,
    DATA_LAST_COL,
  );
  clearRect(
    ws,
    DATA_FIRST_EMP_ROW,
    DATA_LAST_EMP_ROW,
    DATA_FIRST_COL,
    DATA_LAST_COL,
  );
  clearRect(
    ws,
    DATA_TOTALS_ROW,
    DATA_TOTALS_ROW,
    DATA_TOTALS_FIRST_COL,
    DATA_TOTALS_LAST_COL,
  );
}

function cleanPayrollSheet(ws: ExcelJS.Worksheet): void {
  unmergeEmployeeRanges(
    ws,
    PAYROLL_FIRST_EMP_ROW,
    PAYROLL_LAST_EMP_ROW,
    PAYROLL_FIRST_COL,
    PAYROLL_LAST_COL,
  );
  clearRect(
    ws,
    PAYROLL_FIRST_EMP_ROW,
    PAYROLL_LAST_EMP_ROW,
    PAYROLL_FIRST_COL,
    PAYROLL_LAST_COL,
  );
  clearRect(
    ws,
    PAYROLL_TOTALS_ROW,
    PAYROLL_TOTALS_ROW,
    PAYROLL_TOTALS_FIRST_COL,
    PAYROLL_TOTALS_LAST_COL,
  );
  for (const { row, col } of PAYROLL_FOOTER_AMOUNT_CELLS) {
    clearCellValue(ws.getCell(row, col));
  }
}

async function main(): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(PAYROLL_TEMPLATE_SOURCE);

  const dataSheet = workbook.getWorksheet(DATA_SHEET);
  const payrollSheet = workbook.getWorksheet(PAYROLL_SHEET);
  if (!dataSheet || !payrollSheet) {
    throw new Error('Expected Data and Payroll worksheets in source workbook');
  }

  cleanDataSheet(dataSheet);
  cleanPayrollSheet(payrollSheet);

  const outDir = path.dirname(PAYROLL_EXPORT_TEMPLATE_OUTPUT);
  fs.mkdirSync(outDir, { recursive: true });
  await workbook.xlsx.writeFile(PAYROLL_EXPORT_TEMPLATE_OUTPUT);
  console.log('SOURCE', path.basename(PAYROLL_TEMPLATE_SOURCE));
  console.log('OUTPUT', PAYROLL_EXPORT_TEMPLATE_OUTPUT);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
