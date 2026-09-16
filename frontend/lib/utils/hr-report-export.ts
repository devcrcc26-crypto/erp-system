import type { HrReport } from '@/lib/api/reporting.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportEnumLabel,
  exportNumber,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export of the period HR report — one sheet per section so each table
 * on the page comes out as its own tab.
 */
export function buildHrReportExportSheets(report: HrReport): HrExportSheet[] {
  const summaryRows: Array<{ metric: string; value: number | string }> = [
    { metric: 'Period start', value: exportCell(report.range.from) },
    { metric: 'Period end', value: exportCell(report.range.to) },
    { metric: 'Active employees', value: exportNumber(report.headcount.activeEmployees) },
    { metric: 'Employees without a department', value: exportNumber(report.headcount.withoutDepartment) },
    { metric: 'Employees without a leave policy', value: exportNumber(report.headcount.withoutLeavePolicy) },
    { metric: 'Leave requests', value: exportNumber(report.leave.requests) },
    { metric: 'Approved leave requests', value: exportNumber(report.leave.approvedRequests) },
    { metric: 'Approved leave days', value: exportNumber(report.leave.approvedDays) },
    { metric: 'Overtime sheets', value: exportNumber(report.overtime.sheets) },
    { metric: 'Approved overtime sheets', value: exportNumber(report.overtime.approvedSheets) },
    { metric: 'Approved overtime hours', value: exportNumber(report.overtime.approvedHours) },
    { metric: 'Regular overtime hours', value: exportNumber(report.overtime.regularHours) },
    { metric: 'Night overtime hours', value: exportNumber(report.overtime.nightHours) },
    { metric: 'Weekend overtime hours', value: exportNumber(report.overtime.weekendHours) },
    { metric: 'Holiday overtime hours', value: exportNumber(report.overtime.holidayHours) },
    { metric: 'Flights', value: exportNumber(report.travel.flights) },
    { metric: 'Business trips', value: exportNumber(report.travel.businessTrips) },
    { metric: 'Active contracts', value: exportNumber(report.contracts.active) },
    { metric: 'Contracts expiring in period', value: exportNumber(report.contracts.expiringInRange) },
    { metric: 'Contracts ended in period', value: exportNumber(report.contracts.endedInRange) },
  ];

  return [
    {
      name: 'Summary',
      columns: [
        { header: 'Metric', key: 'metric', width: 36 },
        { header: 'Value', key: 'value', width: 16 },
      ],
      rows: summaryRows,
    },
    {
      name: 'Headcount by Department',
      columns: [
        { header: 'Department', key: 'department', width: 30 },
        { header: 'Employees', key: 'employees', width: 14 },
      ],
      rows: report.headcount.byDepartment.map((row) => ({
        department: exportCell(row.name),
        employees: exportNumber(row.count),
      })),
    },
    {
      name: 'Leave by Type',
      columns: [
        { header: 'Leave Type', key: 'leaveType', width: 20 },
        { header: 'Requests', key: 'requests', width: 12 },
        { header: 'Approved Days', key: 'days', width: 16 },
      ],
      rows: report.leave.byType.map((row) => ({
        leaveType: exportEnumLabel(row.leaveType),
        requests: exportNumber(row.requests),
        days: exportNumber(row.days),
      })),
    },
    {
      name: 'Leave by Employee',
      columns: [
        { header: 'Employee', key: 'employee', width: 26 },
        { header: 'Department', key: 'department', width: 24 },
        { header: 'Requests', key: 'requests', width: 12 },
        { header: 'Approved Days', key: 'days', width: 16 },
      ],
      rows: report.leave.topEmployees.map((row) => ({
        employee: exportCell(row.employeeName),
        department: exportCell(row.department),
        requests: exportNumber(row.requests),
        days: exportNumber(row.days),
      })),
    },
    {
      name: 'Overtime by Employee',
      columns: [
        { header: 'Employee', key: 'employee', width: 26 },
        { header: 'Department', key: 'department', width: 24 },
        { header: 'Sheets', key: 'sheets', width: 12 },
        { header: 'Approved Hours', key: 'hours', width: 16 },
      ],
      rows: report.overtime.topEmployees.map((row) => ({
        employee: exportCell(row.employeeName),
        department: exportCell(row.department),
        sheets: exportNumber(row.sheets),
        hours: exportNumber(row.totalHours),
      })),
    },
  ];
}
