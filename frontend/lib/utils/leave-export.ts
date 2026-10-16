import type {
  EmployeeLeaveBalanceSummary,
  LeaveRequestListItem,
} from '@/lib/api/leave.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for leave requests and leave balances.
 */
export function buildLeaveRequestExportSheets(
  rows: LeaveRequestListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Leave Requests',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Leave Type', key: 'leaveType', width: 16 },
        { header: 'Start Date', key: 'startDate', width: 14 },
        { header: 'End Date', key: 'endDate', width: 14 },
        { header: 'Days', key: 'days', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Reason', key: 'reason', width: 40 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        leaveType: exportEnumLabel(row.leaveType),
        startDate: exportDate(row.startDate),
        endDate: exportDate(row.endDate),
        days: exportNumber(row.days),
        status: exportEnumLabel(row.status),
        reason: exportCell(row.reason),
        submittedAt: exportDateTime(row.submittedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
  ];
}

/**
 * Excel export for leave balances - one row per employee and leave type.
 */
export function buildLeaveBalanceExportSheets(
  rows: EmployeeLeaveBalanceSummary[],
): HrExportSheet[] {
  return [
    {
      name: 'Leave Balances',
      columns: [
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Year', key: 'year', width: 10 },
        { header: 'Leave Type', key: 'leaveType', width: 16 },
        { header: 'Entitled', key: 'entitled', width: 12 },
        { header: 'Brought Forward', key: 'broughtForward', width: 18 },
        { header: 'Used', key: 'used', width: 10 },
        { header: 'Pending', key: 'pending', width: 12 },
        { header: 'Remaining', key: 'remaining', width: 12 },
      ],
      rows: rows.flatMap((row) =>
        (
          [
            { type: 'ANNUAL', balance: row.annual },
            { type: 'MATERNITY', balance: row.maternity },
            { type: 'SICK', balance: row.sick },
          ] as const
        )
          .filter((entry) => Boolean(entry.balance))
          .map((entry) => ({
            employee: exportPersonName(row.employee),
            employeeEmail: exportCell(row.employee.email),
            year: exportNumber(row.year),
            leaveType: exportEnumLabel(entry.type),
            entitled: exportNumber(entry.balance?.entitled),
            broughtForward: exportNumber(entry.balance?.broughtForward),
            used: exportNumber(entry.balance?.used),
            pending: exportNumber(entry.balance?.pending),
            remaining: exportNumber(entry.balance?.remaining),
          })),
      ),
    },
  ];
}
