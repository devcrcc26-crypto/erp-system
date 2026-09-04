import type {
  EmployeeLeaveBalanceSummary,
  LeaveRequestListItem,
} from '@/lib/api/leave.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatLeaveEmployeeName } from '@/lib/utils/leave-display';

/**
 * Downloads leave requests as Excel (import-compatible camelCase headers).
 */
export async function exportLeaveRequestsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: LeaveRequestListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('leave-requests', companyName),
    columns: [
      { header: 'requestNumber', key: 'requestNumber', width: 16 },
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'leaveType', key: 'leaveType', width: 14 },
      { header: 'startDate', key: 'startDate', width: 12 },
      { header: 'endDate', key: 'endDate', width: 12 },
      { header: 'days', key: 'days', width: 10 },
      { header: 'reason', key: 'reason', width: 32 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'submittedAt', key: 'submittedAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      requestNumber: cell(row.requestNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatLeaveEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      leaveType: cell(row.leaveType),
      startDate: formatExportDate(row.startDate),
      endDate: formatExportDate(row.endDate),
      days: cell(row.days),
      reason: cell(row.reason),
      status: cell(row.status),
      submittedAt: formatExportDate(row.submittedAt),
    })),
  });
}

/**
 * Downloads leave balances (one row per leave type) as Excel.
 */
export async function exportLeaveBalancesExcel(input: {
  companyName: string;
  sheetName: string;
  rows: EmployeeLeaveBalanceSummary[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  const flatRows: Array<Record<string, string | number>> = [];

  for (const row of rows) {
    const types = [
      { key: 'ANNUAL' as const, balance: row.annual },
      { key: 'MATERNITY' as const, balance: row.maternity },
      { key: 'SICK' as const, balance: row.sick },
    ];
    for (const entry of types) {
      if (!entry.balance) {
        continue;
      }
      flatRows.push({
        employeeEmail: cell(row.employee.email),
        employeeName: formatLeaveEmployeeName(row.employee),
        employeeId: cell(row.employeeId),
        year: cell(row.year),
        leaveType: entry.key,
        entitled: cell(entry.balance.entitled),
        broughtForward: cell(entry.balance.broughtForward),
        used: cell(entry.balance.used),
        pending: cell(entry.balance.pending),
        remaining: cell(entry.balance.remaining),
      });
    }
  }

  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('leave-balances', companyName),
    columns: [
      { header: 'employeeEmail', key: 'employeeEmail', width: 28 },
      { header: 'employeeName', key: 'employeeName', width: 22 },
      { header: 'employeeId', key: 'employeeId', width: 36 },
      { header: 'year', key: 'year', width: 10 },
      { header: 'leaveType', key: 'leaveType', width: 14 },
      { header: 'entitled', key: 'entitled', width: 12 },
      { header: 'broughtForward', key: 'broughtForward', width: 14 },
      { header: 'used', key: 'used', width: 10 },
      { header: 'pending', key: 'pending', width: 10 },
      { header: 'remaining', key: 'remaining', width: 12 },
    ],
    rows: flatRows,
  });
}
