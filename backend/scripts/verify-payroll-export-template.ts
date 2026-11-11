/**
 * Verifies the cleaned payroll export template contains no employee PII/amounts.
 * Prints counts only - never salary or name values.
 */
import * as ExcelJS from 'exceljs';
import {
  cellAddress,
  DATA_ALLOWED_OT_CELLS,
  DATA_FIRST_COL,
  DATA_FIRST_EMP_ROW,
  DATA_LAST_COL,
  DATA_LAST_EMP_ROW,
  DATA_SHEET,
  extractComparableValue,
  isNumericCellValue,
  PAYROLL_ALLOWED_FOOTER_LINE_NUMBERS,
  PAYROLL_ALLOWED_HEADER_NUMERIC,
  PAYROLL_EXPORT_TEMPLATE_OUTPUT,
  PAYROLL_FIRST_COL,
  PAYROLL_FIRST_EMP_ROW,
  PAYROLL_LAST_COL,
  PAYROLL_LAST_EMP_ROW,
  PAYROLL_SHEET,
  PAYROLL_TEMPLATE_SOURCE,
} from './lib/payroll-export-template.util';

type LeakKey = string;

function leakKey(value: string | number): LeakKey {
  if (typeof value === 'number') return `n:${value}`;
  return `s:${value}`;
}

function collectOriginalEmployeeValues(
  ws: ExcelJS.Worksheet,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
): Set<LeakKey> {
  const set = new Set<LeakKey>();
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const comparable = extractComparableValue(ws.getCell(row, col).value);
      if (comparable == null) continue;
      if (typeof comparable === 'string' && comparable.length < 2) continue;
      set.add(leakKey(comparable));
    }
  }
  return set;
}

function countLeaksInCleaned(
  ws: ExcelJS.Worksheet,
  rowStart: number,
  rowEnd: number,
  colStart: number,
  colEnd: number,
  forbidden: Set<LeakKey>,
): number {
  let leaks = 0;
  for (let row = rowStart; row <= rowEnd; row += 1) {
    for (let col = colStart; col <= colEnd; col += 1) {
      const comparable = extractComparableValue(ws.getCell(row, col).value);
      if (comparable == null) continue;
      if (typeof comparable === 'string' && comparable.length < 2) continue;
      if (forbidden.has(leakKey(comparable))) leaks += 1;
    }
  }
  return leaks;
}

function isAllowedNumericCell(sheetName: string, addr: string): boolean {
  if (sheetName === DATA_SHEET) {
    return (DATA_ALLOWED_OT_CELLS as readonly string[]).includes(addr);
  }
  if (sheetName === PAYROLL_SHEET) {
    return (
      (PAYROLL_ALLOWED_HEADER_NUMERIC as readonly string[]).includes(addr) ||
      (PAYROLL_ALLOWED_FOOTER_LINE_NUMBERS as readonly string[]).includes(addr)
    );
  }
  return false;
}

function scanNumericCells(wb: ExcelJS.Workbook): {
  outsideCount: number;
  outsideAddresses: string[];
  allowedAddresses: string[];
} {
  const outsideAddresses: string[] = [];
  const allowedAddresses: string[] = [];
  wb.eachSheet((ws) => {
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        if (!isNumericCellValue(cell.value)) return;
        const addr = cellAddress(rowNumber, colNumber);
        const sheetAddr = `${ws.name}!${addr}`;
        if (isAllowedNumericCell(ws.name, addr)) {
          allowedAddresses.push(sheetAddr);
          return;
        }
        outsideAddresses.push(sheetAddr);
      });
    });
  });
  return {
    outsideCount: outsideAddresses.length,
    outsideAddresses,
    allowedAddresses,
  };
}

async function main(): Promise<void> {
  const original = new ExcelJS.Workbook();
  await original.xlsx.readFile(PAYROLL_TEMPLATE_SOURCE);

  const cleanedPath = PAYROLL_EXPORT_TEMPLATE_OUTPUT;
  const cleaned = new ExcelJS.Workbook();
  await cleaned.xlsx.readFile(cleanedPath);

  const dataOrig = original.getWorksheet(DATA_SHEET);
  const payrollOrig = original.getWorksheet(PAYROLL_SHEET);
  const dataClean = cleaned.getWorksheet(DATA_SHEET);
  const payrollClean = cleaned.getWorksheet(PAYROLL_SHEET);

  if (!dataOrig || !payrollOrig || !dataClean || !payrollClean) {
    console.log('SHEETS_OK', 0);
    process.exit(1);
  }

  const forbiddenData = collectOriginalEmployeeValues(
    dataOrig,
    DATA_FIRST_EMP_ROW,
    DATA_LAST_EMP_ROW,
    DATA_FIRST_COL,
    DATA_LAST_COL,
  );
  const forbiddenPayroll = collectOriginalEmployeeValues(
    payrollOrig,
    PAYROLL_FIRST_EMP_ROW,
    PAYROLL_LAST_EMP_ROW,
    PAYROLL_FIRST_COL,
    PAYROLL_LAST_COL,
  );

  const dataLeaks = countLeaksInCleaned(
    dataClean,
    DATA_FIRST_EMP_ROW,
    DATA_LAST_EMP_ROW,
    DATA_FIRST_COL,
    DATA_LAST_COL,
    forbiddenData,
  );
  const payrollLeaks = countLeaksInCleaned(
    payrollClean,
    PAYROLL_FIRST_EMP_ROW,
    PAYROLL_LAST_EMP_ROW,
    PAYROLL_FIRST_COL,
    PAYROLL_LAST_COL,
    forbiddenPayroll,
  );
  const leakCount = dataLeaks + payrollLeaks;

  const numericScan = scanNumericCells(cleaned);

  const sheetsOk =
    dataClean != null && payrollClean != null ? 1 : 0;

  console.log('NUMERIC_OUTSIDE_ALLOWED', numericScan.outsideCount);
  console.log('LEAK_COUNT', leakCount);
  console.log('SHEETS_OK', sheetsOk);
  if (numericScan.outsideAddresses.length > 0) {
    console.log(
      'NUMERIC_OUTSIDE_ADDRESSES',
      numericScan.outsideAddresses.join(','),
    );
  }
  if (numericScan.allowedAddresses.length > 0) {
    console.log(
      'ALLOWED_NUMERIC_ADDRESSES',
      numericScan.allowedAddresses.join(','),
    );
  }

  const ok =
    sheetsOk === 1 &&
    leakCount === 0 &&
    numericScan.outsideCount === 0;
  process.exit(ok ? 0 : 1);
}

main().catch(() => {
  process.exit(1);
});
