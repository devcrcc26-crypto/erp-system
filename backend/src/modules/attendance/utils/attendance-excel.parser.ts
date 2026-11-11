import * as ExcelJS from 'exceljs';
import { convertMachineTimeToLocal } from './time.util';

export interface AttendanceDailyRaw {
  date: Date;
  clockInMachine: string | null;
  clockOutMachine: string | null;
  clockInLocal: string | null;
  clockOutLocal: string | null;
}

export interface AttendanceRawRow {
  attendanceName: string;
  attendanceId: string;
  /**
   * Column H machine total - kept for preview/debug only.
   * Persisted payable hours are recalculated from daily logs + holidays.
   */
  payableHours: number;
  dailyData: AttendanceDailyRaw[];
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

/** First daily date column (1-based). Columns A–Q are identity + aggregates. */
const FIRST_DAILY_COLUMN = 18;

/** True when the cell text is blank after trim. */
function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

/**
 * Sub-header rows in the Deli export use Chinese-only labels in column A.
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

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Reads a clock time from a Deli daily cell as HH:mm, or null when empty.
 */
function cellToClockTime(value: ExcelJS.CellValue): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return `${pad2(value.getHours())}:${pad2(value.getMinutes())}`;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const fraction = value % 1;
    const totalMinutes = Math.round(fraction * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${pad2(hours)}:${pad2(minutes)}`;
  }
  if (typeof value === 'object' && 'result' in value) {
    return cellToClockTime(value.result as ExcelJS.CellValue);
  }
  if (typeof value === 'object' && 'text' in value) {
    return cellToClockTime(value.text as ExcelJS.CellValue);
  }
  if (typeof value === 'object' && 'richText' in value) {
    return cellToClockTime(value.richText.map((part) => part.text).join(''));
  }

  const raw = cellToString(value).trim();
  if (raw.length === 0 || raw === '-') {
    return null;
  }
  const match = /^(\d{1,2}):(\d{2})/.exec(raw);
  if (!match) {
    return null;
  }
  return `${pad2(Number(match[1]))}:${pad2(Number(match[2]))}`;
}

/**
 * Parses a date from a daily column header (e.g. `周六\n26-08-01` → 2026-08-01 UTC).
 */
export function parseDateFromHeader(header: string): Date | null {
  const match = /(\d{2,4})-(\d{2})-(\d{2})/.exec(String(header));
  if (!match) {
    return null;
  }
  const yearPart = match[1];
  const year =
    yearPart.length === 2
      ? 2000 + Number.parseInt(yearPart, 10)
      : Number.parseInt(yearPart, 10);
  const month = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);
  if (
    !Number.isInteger(year) ||
    month < 0 ||
    month > 11 ||
    day < 1 ||
    day > 31
  ) {
    return null;
  }
  return new Date(Date.UTC(year, month, day));
}

/**
 * Parses month/year from a Deli sheet name `月度汇总表_YYYYMMDD_YYYYMMDD`.
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

/**
 * Builds daily clock pairs from the in-row / out-row for one employee.
 */
function readDailyData(
  headerRow: ExcelJS.Row,
  inRow: ExcelJS.Row,
  outRow: ExcelJS.Row,
): AttendanceDailyRaw[] {
  const dailyData: AttendanceDailyRaw[] = [];
  const maxColumn = Math.max(inRow.cellCount, outRow.cellCount, headerRow.cellCount);

  for (let col = FIRST_DAILY_COLUMN; col <= maxColumn; col += 1) {
    const headerText = cellToString(headerRow.getCell(col).value);
    const date = parseDateFromHeader(headerText);
    if (!date) {
      continue;
    }

    const clockInMachine = cellToClockTime(inRow.getCell(col).value);
    const clockOutMachine = cellToClockTime(outRow.getCell(col).value);

    dailyData.push({
      date,
      clockInMachine,
      clockOutMachine,
      clockInLocal: clockInMachine
        ? convertMachineTimeToLocal(clockInMachine)
        : null,
      clockOutLocal: clockOutMachine
        ? convertMachineTimeToLocal(clockOutMachine)
        : null,
    });
  }

  return dailyData;
}

/**
 * Parses a Deli e+ monthly attendance Excel export into raw rows with daily
 * clock times. Does not match employees - extraction only.
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
  const headerRow = sheet.getRow(2);
  const rows: AttendanceRawRow[] = [];

  // Rows 1–2 are headers. Employee data is paired: clock-in row + clock-out row.
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const inRow = sheet.getRow(rowNumber);
    const colA = cellToString(inRow.getCell(1).value);

    if (isBlank(colA) || isChineseOnly(colA)) {
      continue;
    }

    const outRow = sheet.getRow(rowNumber + 1);
    const attendanceIdRaw = cellToString(inRow.getCell(2).value).trim();

    rows.push({
      attendanceName: colA.trim(),
      attendanceId: attendanceIdRaw.length > 0 ? attendanceIdRaw : '-',
      payableHours: cellToNumber(inRow.getCell(8).value),
      dailyData: readDailyData(headerRow, inRow, outRow),
    });

    rowNumber += 1;
  }

  return {
    month,
    year,
    fileName,
    rows,
  };
}
