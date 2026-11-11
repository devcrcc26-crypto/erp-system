import type {
  OvertimeEntry,
  OvertimeSheetDetail,
  OvertimeSheetListItem,
} from '@/lib/api/overtime.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatOvertimeEmployeeName } from '@/lib/utils/overtime-display';

function formatBool(value: boolean): string {
  return value ? 'true' : 'false';
}

/**
 * Downloads overtime sheet list rows as Excel (summary table).
 */
export async function exportOvertimeSheetsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: OvertimeSheetListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('overtime-sheets', companyName),
    columns: [
      { header: 'sheetNumber', key: 'sheetNumber', width: 16 },
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'year', key: 'year', width: 10 },
      { header: 'month', key: 'month', width: 10 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'regularHours', key: 'regularHours', width: 12 },
      { header: 'nightHours', key: 'nightHours', width: 12 },
      { header: 'weekendHours', key: 'weekendHours', width: 12 },
      { header: 'holidayHours', key: 'holidayHours', width: 12 },
      { header: 'totalHours', key: 'totalHours', width: 12 },
      { header: 'submittedAt', key: 'submittedAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      sheetNumber: cell(row.sheetNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatOvertimeEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      year: cell(row.year),
      month: cell(row.month),
      status: cell(row.status),
      regularHours: cell(row.totalRegularHours),
      nightHours: cell(row.totalNightHours),
      weekendHours: cell(row.totalWeekendHours),
      holidayHours: cell(row.totalHolidayHours),
      totalHours: cell(row.totalHours),
      submittedAt: formatExportDate(row.submittedAt),
    })),
  });
}

/**
 * Downloads overtime entries flattened from sheets (import-compatible).
 */
export async function exportOvertimeEntriesExcel(input: {
  companyName: string;
  sheetName: string;
  filePrefix?: string;
  sheets: OvertimeSheetDetail[];
}): Promise<void> {
  const { sheets, companyName, sheetName, filePrefix } = input;
  const flatRows: Array<Record<string, string | number>> = [];

  for (const sheet of sheets) {
    for (const entry of sheet.entries ?? []) {
      flatRows.push(mapEntryExportRow(sheet, entry));
    }
  }

  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      filePrefix ?? 'overtime-entries',
      companyName,
    ),
    columns: [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'sheetNumber', key: 'sheetNumber', width: 16 },
      { header: 'year', key: 'year', width: 10 },
      { header: 'month', key: 'month', width: 10 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'date', key: 'date', width: 12 },
      { header: 'startTime', key: 'startTime', width: 12 },
      { header: 'endTime', key: 'endTime', width: 12 },
      { header: 'isHoliday', key: 'isHoliday', width: 12 },
      { header: 'taskDescription', key: 'taskDescription', width: 36 },
      { header: 'regularHours', key: 'regularHours', width: 12 },
      { header: 'nightHours', key: 'nightHours', width: 12 },
      { header: 'weekendHours', key: 'weekendHours', width: 12 },
      { header: 'holidayHours', key: 'holidayHours', width: 12 },
      { header: 'totalHours', key: 'totalHours', width: 12 },
    ],
    rows: flatRows,
  });
}

/**
 * Downloads entries for a single overtime sheet (sheet-scoped import columns).
 */
export async function exportOvertimeSheetEntriesExcel(input: {
  companyName: string;
  sheetName: string;
  sheet: OvertimeSheetDetail;
}): Promise<void> {
  const { sheet, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      `overtime-sheet-${sheet.sheetNumber || sheet.id.slice(0, 8)}`,
      companyName,
    ),
    columns: [
      { header: 'date', key: 'date', width: 12 },
      { header: 'startTime', key: 'startTime', width: 12 },
      { header: 'endTime', key: 'endTime', width: 12 },
      { header: 'isHoliday', key: 'isHoliday', width: 12 },
      { header: 'taskDescription', key: 'taskDescription', width: 36 },
      { header: 'regularHours', key: 'regularHours', width: 12 },
      { header: 'nightHours', key: 'nightHours', width: 12 },
      { header: 'weekendHours', key: 'weekendHours', width: 12 },
      { header: 'holidayHours', key: 'holidayHours', width: 12 },
      { header: 'totalHours', key: 'totalHours', width: 12 },
    ],
    rows: (sheet.entries ?? []).map((entry) => ({
      date: formatExportDate(entry.date),
      startTime: cell(entry.startTime),
      endTime: cell(entry.endTime),
      isHoliday: formatBool(entry.isHoliday),
      taskDescription: cell(entry.taskDescription),
      regularHours: cell(entry.regularHours),
      nightHours: cell(entry.nightHours),
      weekendHours: cell(entry.weekendHours),
      holidayHours: cell(entry.holidayHours),
      totalHours: cell(entry.totalHours),
    })),
  });
}

function mapEntryExportRow(
  sheet: OvertimeSheetDetail,
  entry: OvertimeEntry,
): Record<string, string | number> {
  return {
    employeeEmail: cell(sheet.employee?.email),
    employeeName: formatOvertimeEmployeeName(sheet.employee),
    employeeId: cell(sheet.employeeId),
    sheetNumber: cell(sheet.sheetNumber),
    year: cell(sheet.year),
    month: cell(sheet.month),
    status: cell(sheet.status),
    date: formatExportDate(entry.date),
    startTime: cell(entry.startTime),
    endTime: cell(entry.endTime),
    isHoliday: formatBool(entry.isHoliday),
    taskDescription: cell(entry.taskDescription),
    regularHours: cell(entry.regularHours),
    nightHours: cell(entry.nightHours),
    weekendHours: cell(entry.weekendHours),
    holidayHours: cell(entry.holidayHours),
    totalHours: cell(entry.totalHours),
  };
}
