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
import {
  formatLeaveEmployeeName,
  formatLeaveStatus,
  formatLeaveType,
} from '@/lib/utils/leave-display';

export interface LeaveRequestsExportLabels {
  sheetName: string;
  requestNumber: string;
  employeeEmail: string;
  employeeName: string;
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: string;
  reason: string;
  status: string;
  submittedAt: string;
}

export interface LeaveBalancesExportLabels {
  sheetName: string;
  employeeEmail: string;
  employeeName: string;
  employeeId: string;
  year: string;
  leaveType: string;
  entitled: string;
  broughtForward: string;
  used: string;
  pending: string;
  remaining: string;
}

/**
 * Downloads leave requests as Excel.
 */
export async function exportLeaveRequestsExcel(input: {
  companyName: string;
  labels: LeaveRequestsExportLabels;
  rows: LeaveRequestListItem[];
}): Promise<void> {
  const { labels, rows, companyName } = input;
  await downloadExcelWorkbook({
    sheetName: labels.sheetName,
    fileName: buildExportFileName('leave-requests', companyName),
    columns: [
      { header: labels.requestNumber, key: 'requestNumber', width: 16 },
      { header: labels.employeeEmail, key: 'employeeEmail', width: 28 },
      { header: labels.employeeName, key: 'employeeName', width: 22 },
      { header: labels.employeeId, key: 'employeeId', width: 36 },
      { header: labels.leaveType, key: 'leaveType', width: 14 },
      { header: labels.startDate, key: 'startDate', width: 12 },
      { header: labels.endDate, key: 'endDate', width: 12 },
      { header: labels.days, key: 'days', width: 10 },
      { header: labels.reason, key: 'reason', width: 32 },
      { header: labels.status, key: 'status', width: 12 },
      { header: labels.submittedAt, key: 'submittedAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      requestNumber: cell(row.requestNumber),
      employeeEmail: cell(row.employee?.email),
      employeeName: formatLeaveEmployeeName(row.employee),
      employeeId: cell(row.employeeId),
      leaveType: formatLeaveType(row.leaveType),
      startDate: formatExportDate(row.startDate),
      endDate: formatExportDate(row.endDate),
      days: cell(row.days),
      reason: cell(row.reason),
      status: formatLeaveStatus(row.status),
      submittedAt: formatExportDate(row.submittedAt),
    })),
  });
}

/**
 * Downloads leave balances (one row per leave type) as Excel.
 */
export async function exportLeaveBalancesExcel(input: {
  companyName: string;
  labels: LeaveBalancesExportLabels;
  rows: EmployeeLeaveBalanceSummary[];
}): Promise<void> {
  const { labels, rows, companyName } = input;
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
        leaveType: formatLeaveType(entry.key),
        entitled: cell(entry.balance.entitled),
        broughtForward: cell(entry.balance.broughtForward),
        used: cell(entry.balance.used),
        pending: cell(entry.balance.pending),
        remaining: cell(entry.balance.remaining),
      });
    }
  }

  await downloadExcelWorkbook({
    sheetName: labels.sheetName,
    fileName: buildExportFileName('leave-balances', companyName),
    columns: [
      { header: labels.employeeEmail, key: 'employeeEmail', width: 28 },
      { header: labels.employeeName, key: 'employeeName', width: 22 },
      { header: labels.employeeId, key: 'employeeId', width: 36 },
      { header: labels.year, key: 'year', width: 10 },
      { header: labels.leaveType, key: 'leaveType', width: 14 },
      { header: labels.entitled, key: 'entitled', width: 12 },
      { header: labels.broughtForward, key: 'broughtForward', width: 14 },
      { header: labels.used, key: 'used', width: 10 },
      { header: labels.pending, key: 'pending', width: 10 },
      { header: labels.remaining, key: 'remaining', width: 12 },
    ],
    rows: flatRows,
  });
}
