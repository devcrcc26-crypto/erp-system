import type { HrReport } from '@/lib/api/reporting.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportEnumLabel,
  exportNumber,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export of the period HR report - one sheet per section so each table
 * on the page comes out as its own tab.
 */
export function buildHrReportExportSheets(report: HrReport): HrExportSheet[] {
  const summaryRows: Array<{ metric: string; value: number | string }> = [
    { metric: 'Period start', value: exportCell(report.range.from) },
    { metric: 'Period end', value: exportCell(report.range.to) },
    { metric: 'Active employees', value: exportNumber(report.headcount.activeEmployees) },
    { metric: 'Inactive employees', value: exportNumber(report.headcount.inactiveEmployees) },
    { metric: 'New hires in period', value: exportNumber(report.headcount.newHiresInRange) },
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
    { metric: 'Site assignment overtime hours', value: exportNumber(report.overtime.siteAssignmentHours) },
    { metric: 'Within scheduled hours — site', value: exportNumber(report.overtime.siteWithinScheduleHours) },
    { metric: 'Other overtime hours', value: exportNumber(report.overtime.otherHours) },
    { metric: 'Flights', value: exportNumber(report.travel.flights) },
    { metric: 'Business trips', value: exportNumber(report.travel.businessTrips) },
    { metric: 'Active contracts', value: exportNumber(report.contracts.active) },
    { metric: 'Contracts expiring in period', value: exportNumber(report.contracts.expiringInRange) },
    { metric: 'Contracts ended in period', value: exportNumber(report.contracts.endedInRange) },
    { metric: 'Payroll runs', value: exportNumber(report.payroll.runs) },
    { metric: 'Total gross pay (ETB)', value: exportNumber(report.payroll.totalGross) },
    { metric: 'Total deductions - pension + income tax (ETB)', value: exportNumber(report.payroll.totalDeductions) },
    { metric: 'Total net pay (ETB)', value: exportNumber(report.payroll.totalNet) },
    { metric: 'Attendance records', value: exportNumber(report.attendance.records) },
    { metric: 'Working days in period', value: exportNumber(report.attendance.totalWorkingDays) },
    { metric: 'Average attendance rate (%)', value: exportNumber(report.attendance.averageAttendanceRate) },
    { metric: 'Absent days', value: exportNumber(report.attendance.totalAbsentDays) },
    { metric: 'Unpaid leave days', value: exportNumber(report.attendance.totalUnpaidLeaveDays) },
    { metric: 'Site assignments', value: exportNumber(report.siteAssignments.requests) },
    { metric: 'Approved site assignments', value: exportNumber(report.siteAssignments.approvedRequests) },
    { metric: 'Work-from-home days', value: exportNumber(report.workFromHome.days) },
    { metric: 'Expense claims', value: exportNumber(report.expenses.claims) },
    { metric: 'Approved expense claims', value: exportNumber(report.expenses.approvedClaims) },
    { metric: 'Approved expense amount (ETB)', value: exportNumber(report.expenses.approvedAmountEtb) },
    { metric: 'Evaluations', value: exportNumber(report.evaluations.total) },
    { metric: 'Completed evaluations', value: exportNumber(report.evaluations.completed) },
    {
      metric: 'Average evaluation score',
      value:
        report.evaluations.averageFinalScore == null
          ? '-'
          : exportNumber(report.evaluations.averageFinalScore),
    },
  ];

  const statusRows = (prefix: string, byStatus: Record<string, number>) =>
    Object.entries(byStatus).map(([status, count]) => ({
      metric: `${prefix} - ${exportEnumLabel(status)}`,
      value: exportNumber(count),
    }));

  return [
    {
      name: 'Summary',
      columns: [
        { header: 'Metric', key: 'metric', width: 42 },
        { header: 'Value', key: 'value', width: 16 },
      ],
      rows: [
        ...summaryRows,
        ...statusRows('Leave status', report.leave.byStatus),
        ...statusRows('Overtime status', report.overtime.byStatus),
        ...statusRows('Site assignment status', report.siteAssignments.byStatus),
        ...statusRows('Expense status', report.expenses.byStatus),
        ...statusRows('Evaluation status', report.evaluations.byStatus),
        ...statusRows(
          'Payroll run status',
          Object.fromEntries(
            report.payroll.byStatus.map((row) => [row.status, row.count]),
          ),
        ),
      ],
    },
    {
      name: 'Headcount Trend',
      columns: [
        { header: 'Month', key: 'month', width: 14 },
        { header: 'Employees', key: 'employees', width: 14 },
      ],
      rows: report.headcountTrend.map((row) => ({
        month: exportCell(row.month),
        employees: exportNumber(row.count),
      })),
    },
    {
      name: 'Contract Renewals',
      columns: [
        { header: 'Employee', key: 'employee', width: 26 },
        { header: 'Department', key: 'department', width: 24 },
        { header: 'Contract No.', key: 'contractNumber', width: 16 },
        { header: 'End Date', key: 'endDate', width: 14 },
      ],
      rows: report.expiringContracts.map((row) => ({
        employee: exportCell(row.employeeName),
        department: exportCell(row.department),
        contractNumber: exportCell(row.contractNumber),
        endDate: exportCell(row.endDate),
      })),
    },
    {
      name: 'Payroll by Department',
      columns: [
        { header: 'Department', key: 'department', width: 30 },
        { header: 'Net Pay (ETB)', key: 'net', width: 18 },
      ],
      rows: report.payroll.byDepartment.map((row) => ({
        department: exportCell(row.department),
        net: exportNumber(row.totalNet),
      })),
    },
    {
      name: 'Attendance by Department',
      columns: [
        { header: 'Department', key: 'department', width: 30 },
        { header: 'Attendance Rate (%)', key: 'rate', width: 20 },
      ],
      rows: report.attendance.byDepartment.map((row) => ({
        department: exportCell(row.department),
        rate: exportNumber(row.attendanceRate),
      })),
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
      name: 'Workforce Mix',
      columns: [
        { header: 'Dimension', key: 'dimension', width: 18 },
        { header: 'Value', key: 'value', width: 20 },
        { header: 'Employees', key: 'employees', width: 14 },
      ],
      rows: [
        ...report.headcount.byEmployeeType.map((row) => ({
          dimension: 'Employee type',
          value: exportEnumLabel(row.name),
          employees: exportNumber(row.count),
        })),
        ...report.headcount.byNationality.map((row) => ({
          dimension: 'Nationality',
          value: exportEnumLabel(row.name),
          employees: exportNumber(row.count),
        })),
        ...report.headcount.byGender.map((row) => ({
          dimension: 'Gender',
          value: exportEnumLabel(row.name),
          employees: exportNumber(row.count),
        })),
      ],
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
    {
      name: 'Expense Categories',
      columns: [
        { header: 'Category', key: 'category', width: 28 },
        { header: 'Line Items', key: 'count', width: 12 },
        { header: 'Amount (ETB)', key: 'amount', width: 16 },
      ],
      rows: report.expenses.byCategory.map((row) => ({
        category: exportCell(row.name),
        count: exportNumber(row.count),
        amount: exportNumber(row.amount),
      })),
    },
  ];
}
