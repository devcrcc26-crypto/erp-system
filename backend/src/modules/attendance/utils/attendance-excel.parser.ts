import * as ExcelJS from 'exceljs';

export interface AttendanceRawRow {
  attendanceName: string;
  attendanceId: string;
  expectedDays: number;
  actualDays: number;
  expectedHours: number;
  actualHours: number;
  payableHours: number;
  overtimePaidHours: number;
  overtimeTimeOffHours: number;
  lateCount: number;
  lateMinutes: number;
  earlyLeaveCount: number;
  earlyLeaveMinutes: number;
  missingClockIn: number;
  missingClockOut: number;
  absentDays: number;
}

export interface AttendanceParseResult {
  month: number;
  year: number;
  fileName: string;
  rows: AttendanceRawRow[];
}

const SHEET_NAME_PATTERN = /^月度汇总表_(\d{4})(\d{2})\d{2}_\d{8}$/u;
const INVALID_SHEET_FORMAT_ERROR =
  'Invalid file format: expected sheet name like 月度汇总表_YYYYMMDD_YYYYMMDD';

/** True when the cell text is blank after trim. */
function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Sub-header rows in the Deli export use Chinese-only labels in column A
 * (e.g. section titles). Employee name rows use Latin script.
 */
function isChineseOnly(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return false;
  }
  return /^[\u4e00-\u9fff\s]+$/u.test(trimmed);
}

function cellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === 'object' && 'text' in value) {
    return String(value.text ?? '');
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellToString(value.result as ExcelJS.CellValue);
  }
  if (typeof value === 'object' && 'richText' in value) {
    return value.richText.map((part) => part.text).join('');
  }
  return String(value);
}

/**
 * Coerces an Excel cell to a finite number. Null, empty, and non-numeric
 * values become 0.
 */
function cellToNumber(value: ExcelJS.CellValue): number {
  if (value === null || value === undefined) {
    return 0;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellToNumber(value.result as ExcelJS.CellValue);
  }
  if (typeof value === 'object' && 'text' in value) {
    return cellToNumber(value.text as ExcelJS.CellValue);
  }
  if (typeof value === 'object' && 'richText' in value) {
    return cellToNumber(value.richText.map((part) => part.text).join(''));
  }

  const asString = cellToString(value).trim().replace(/,/g, '');
  if (asString.length === 0) {
    return 0;
  }
  const parsed = Number(asString);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cellToInteger(value: ExcelJS.CellValue): number {
  return Math.trunc(cellToNumber(value));
}

/**
 * Parses month/year from a Deli sheet name `月度汇总表_YYYYMMDD_YYYYMMDD`.
 * Year/month come from the first date segment (YYYY + MM), not fixed character
 * offsets — the Chinese prefix is 5 code points, so naive 9–14 indexing yields
 * `2608-01` instead of `2026-08`.
 */
function parseSheetPeriod(sheetName: string): { year: number; month: number } {
  const match = SHEET_NAME_PATTERN.exec(sheetName);
  if (!match) {
    throw new Error(INVALID_SHEET_FORMAT_ERROR);
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    throw new Error(INVALID_SHEET_FORMAT_ERROR);
  }

  return { year, month };
}

function readRawRow(row: ExcelJS.Row): AttendanceRawRow {
  const attendanceName = cellToString(row.getCell(1).value).trim();
  const attendanceIdRaw = cellToString(row.getCell(2).value).trim();

  return {
    attendanceName,
    attendanceId: attendanceIdRaw.length > 0 ? attendanceIdRaw : '-',
    expectedDays: cellToNumber(row.getCell(4).value),
    actualDays: cellToNumber(row.getCell(5).value),
    expectedHours: cellToNumber(row.getCell(6).value),
    actualHours: cellToNumber(row.getCell(7).value),
    payableHours: cellToNumber(row.getCell(8).value),
    overtimePaidHours: cellToNumber(row.getCell(9).value),
    overtimeTimeOffHours: cellToNumber(row.getCell(10).value),
    lateCount: cellToInteger(row.getCell(11).value),
    lateMinutes: cellToInteger(row.getCell(12).value),
    earlyLeaveCount: cellToInteger(row.getCell(13).value),
    earlyLeaveMinutes: cellToInteger(row.getCell(14).value),
    missingClockIn: cellToInteger(row.getCell(15).value),
    missingClockOut: cellToInteger(row.getCell(16).value),
    absentDays: cellToNumber(row.getCell(17).value),
  };
}

/**
 * Parses a Deli e+ monthly attendance Excel export into raw rows.
 * Does not match employees — extraction only.
 */
export async function parseAttendanceExcel(
  buffer: Buffer,
  fileName: string,
): Promise<AttendanceParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('Workbook must contain at least one sheet');
  }

  const { year, month } = parseSheetPeriod(sheet.name);
  const rows: AttendanceRawRow[] = [];

  // Rows 1–2 are headers. Employee data is paired: summary row + clock-out row.
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const excelRow = sheet.getRow(rowNumber);
    const colA = cellToString(excelRow.getCell(1).value);

    if (isBlank(colA) || isChineseOnly(colA)) {
      continue;
    }

    rows.push(readRawRow(excelRow));
    // Skip the paired clock-out / duplicate row immediately after.
    rowNumber += 1;
  }

  return {
    month,
    year,
    fileName,
    rows,
  };
}
