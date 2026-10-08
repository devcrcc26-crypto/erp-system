import type {
  OvertimeSheetDetail,
  OvertimeSheetListItem,
} from '@/lib/api/overtime.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportBoolean,
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for overtime sheets, with a second sheet of the daily entries
 * keyed by sheet number.
 */
export function buildOvertimeExportSheets(
  rows: OvertimeSheetListItem[],
  details?: OvertimeSheetDetail[],
): HrExportSheet[] {
  const detailBySheetId = new Map(
    (details ?? []).map((detail) => [detail.id, detail] as const),
  );

  return [
    {
      name: 'Overtime Sheets',
      columns: [
        { header: 'Sheet Number', key: 'sheetNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Year', key: 'year', width: 10 },
        { header: 'Month', key: 'month', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Normal Hours', key: 'regularHours', width: 16 },
        { header: 'Evening Hours', key: 'nightHours', width: 14 },
        { header: 'Weekend Hours', key: 'weekendHours', width: 16 },
        { header: 'Holiday Hours', key: 'holidayHours', width: 16 },
        { header: 'Total Hours', key: 'totalHours', width: 14 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        sheetNumber: exportCell(row.sheetNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        year: exportNumber(row.year),
        month: exportNumber(row.month),
        status: exportEnumLabel(row.status),
        regularHours: exportNumber(row.totalRegularHours),
        nightHours: exportNumber(row.totalNightHours),
        weekendHours: exportNumber(row.totalWeekendHours),
        holidayHours: exportNumber(row.totalHolidayHours),
        totalHours: exportNumber(row.totalHours),
        submittedAt: exportDateTime(row.submittedAt),
      })),
    },
    {
      name: 'Entries',
      columns: [
        { header: 'Sheet Number', key: 'sheetNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Start Time', key: 'startTime', width: 12 },
        { header: 'End Time', key: 'endTime', width: 12 },
        { header: 'Holiday', key: 'isHoliday', width: 12 },
        { header: 'Task Description', key: 'taskDescription', width: 40 },
        { header: 'Normal Hours', key: 'regularHours', width: 16 },
        { header: 'Evening Hours', key: 'nightHours', width: 14 },
        { header: 'Weekend Hours', key: 'weekendHours', width: 16 },
        { header: 'Holiday Hours', key: 'holidayHours', width: 16 },
        { header: 'Total Hours', key: 'totalHours', width: 14 },
      ],
      rows: rows.flatMap((row) => {
        const entries = detailBySheetId.get(row.id)?.entries ?? [];
        return entries.map((entry) => ({
          sheetNumber: exportCell(row.sheetNumber),
          employee: exportPersonName(row.employee),
          date: exportDate(entry.date),
          startTime: exportCell(entry.startTime),
          endTime: exportCell(entry.endTime),
          isHoliday: exportBoolean(entry.isHoliday),
          taskDescription: exportCell(entry.taskDescription),
          regularHours: exportNumber(entry.regularHours),
          nightHours: exportNumber(entry.nightHours),
          weekendHours: exportNumber(entry.weekendHours),
          holidayHours: exportNumber(entry.holidayHours),
          totalHours: exportNumber(entry.totalHours),
        }));
      }),
    },
  ];
}
