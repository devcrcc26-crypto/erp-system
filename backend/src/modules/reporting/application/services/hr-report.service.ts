import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { HrReportQueryDto } from '../dtos/hr-report.dtos';

type RequestContext = { companyId: string; userId: string };

export interface HrReportRange {
  from: string;
  to: string;
}

export interface HrReportNamedCount {
  name: string;
  count: number;
}

export interface HrReportLeaveTypeRow {
  leaveType: string;
  requests: number;
  days: number;
}

export interface HrReportEmployeeLeaveRow {
  employeeId: string;
  employeeName: string;
  department: string | null;
  requests: number;
  days: number;
}

export interface HrReportEmployeeOvertimeRow {
  employeeId: string;
  employeeName: string;
  department: string | null;
  sheets: number;
  totalHours: number;
}

export interface HrReportNamedAmount {
  name: string;
  count: number;
  amount: number;
}

/** `month` is a `YYYY-MM` key; the client formats the label. */
export interface HrReportMonthCount {
  month: string;
  count: number;
}

export interface HrReportExpiringContractRow {
  contractId: string;
  contractNumber: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  endDate: string;
  /** `YYYY-MM` of endDate, matching `contractsByMonth[].month`. */
  month: string;
}

export interface HrReportPayroll {
  /** Runs in the period; money totals exclude cancelled runs. */
  runs: number;
  totalGross: number;
  /** Employee pension + income tax. */
  totalDeductions: number;
  totalNet: number;
  byDepartment: Array<{ department: string; totalNet: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

export interface HrReportAttendance {
  /** Monthly attendance records imported for the period. */
  records: number;
  /** Sum over the period's months of each month's scheduled working days. */
  totalWorkingDays: number;
  /** Present days / scheduled days across all records, as a percentage. */
  averageAttendanceRate: number;
  totalAbsentDays: number;
  totalUnpaidLeaveDays: number;
  byDepartment: Array<{ department: string; attendanceRate: number }>;
}

export interface HrReport {
  generatedAt: string;
  range: HrReportRange;
  departmentId: string | null;
  headcount: {
    activeEmployees: number;
    inactiveEmployees: number;
    newHiresInRange: number;
    byDepartment: HrReportNamedCount[];
    byEmployeeType: HrReportNamedCount[];
    byNationality: HrReportNamedCount[];
    byGender: HrReportNamedCount[];
    withoutDepartment: number;
    withoutLeavePolicy: number;
  };
  /** Employed headcount for the six months ending with the report's end month. */
  headcountTrend: HrReportMonthCount[];
  leave: {
    requests: number;
    approvedRequests: number;
    approvedDays: number;
    byType: HrReportLeaveTypeRow[];
    byStatus: Record<string, number>;
    topEmployees: HrReportEmployeeLeaveRow[];
  };
  overtime: {
    sheets: number;
    approvedSheets: number;
    approvedHours: number;
    regularHours: number;
    nightHours: number;
    weekendHours: number;
    holidayHours: number;
    /** Approved OT on site-assignment days (label "Site assignment"). */
    siteAssignmentHours: number;
    /** Subtotal: site-day OT inside scheduled hours ("Within scheduled hours — site"). */
    siteWithinScheduleHours: number;
    /** Approved OT outside that subtotal. */
    otherHours: number;
    byStatus: Record<string, number>;
    topEmployees: HrReportEmployeeOvertimeRow[];
  };
  travel: {
    flights: number;
    businessTrips: number;
  };
  contracts: {
    active: number;
    expiringInRange: number;
    endedInRange: number;
  };
  /** Active contracts ending in each of the next three calendar months (from today). */
  contractsByMonth: HrReportMonthCount[];
  expiringContracts: HrReportExpiringContractRow[];
  payroll: HrReportPayroll;
  attendance: HrReportAttendance;
  siteAssignments: {
    requests: number;
    approvedRequests: number;
    byStatus: Record<string, number>;
  };
  workFromHome: {
    days: number;
  };
  expenses: {
    claims: number;
    approvedClaims: number;
    approvedAmountEtb: number;
    byStatus: Record<string, number>;
    byCategory: HrReportNamedAmount[];
  };
  evaluations: {
    total: number;
    completed: number;
    averageFinalScore: number | null;
    byStatus: Record<string, number>;
  };
}

const APPROVED = 'APPROVED';
/** Bucket for employees with no value set (gender, nationality, employee type). */
const NOT_SPECIFIED = 'NOT_SPECIFIED';
const HEADCOUNT_TREND_MONTHS = 6;
const CONTRACT_TIMELINE_MONTHS = 3;

function startOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfDayUtc(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999,
    ),
  );
}

function parseDate(value: string | undefined, fallback: Date): Date {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value,
  );
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toNumber(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : Number(value);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Sortable month key so `month`/`year` sheets can be filtered by a date range. */
function monthKey(year: number, month: number): number {
  return year * 12 + month;
}

/** `YYYY-MM` for a 1-based month. */
function monthLabel(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function percent(part: number, whole: number): number {
  return whole > 0 ? round((part / whole) * 100) : 0;
}

/**
 * Date-ranged HR reporting: headcount, leave, overtime, travel and contracts.
 * Separate from the HR dashboard, which is always "right now" with no period.
 */
@Injectable()
export class HrReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getHrReport(
    ctx: RequestContext,
    query: HrReportQueryDto,
  ): Promise<HrReport> {
    const { companyId } = ctx;
    const now = new Date();
    const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    const from = startOfDayUtc(parseDate(query.from, defaultFrom));
    const to = endOfDayUtc(parseDate(query.to, now));
    const departmentId = query.departmentId ?? null;

    const employeeScope = await this.resolveEmployeeScope(
      companyId,
      departmentId,
    );
    const employeeFilter = employeeScope
      ? { employeeId: { in: employeeScope } }
      : {};

    // Headcount / demographics count HR-process employees only (no approver-only).
    const userScopeWhere = hrProcessEmployeeWhere({
      companyId,
      deletedAt: null,
      ...(departmentId ? { departmentId } : {}),
    });

    const [
      activeEmployees,
      inactiveEmployees,
      newHiresInRange,
      withoutDepartment,
      withoutLeavePolicy,
      headcountGroups,
      employeeTypeGroups,
      nationalityGroups,
      genderGroups,
      leaveRequests,
      overtimeSheets,
      flights,
      businessTrips,
      activeContracts,
      expiringInRange,
      endedInRange,
      siteAssignmentRows,
      workFromHomeDays,
      expenseClaims,
      evaluationRows,
      payrollRuns,
      attendanceRecords,
      trendEmployees,
      expiringContractRows,
    ] = await Promise.all([
      this.prisma.user.count({
        where: { ...userScopeWhere, isActive: true },
      }),
      this.prisma.user.count({
        where: { ...userScopeWhere, isActive: false },
      }),
      this.prisma.user.count({
        where: { ...userScopeWhere, createdAt: { gte: from, lte: to } },
      }),
      this.prisma.user.count({
        where: activeOnly(
          hrProcessEmployeeWhere({ companyId, isActive: true, departmentId: null }),
        ),
      }),
      this.prisma.user.count({
        where: { ...userScopeWhere, isActive: true, leavePolicyId: null },
      }),
      this.prisma.user.groupBy({
        by: ['departmentId'],
        where: {
          ...userScopeWhere,
          isActive: true,
          departmentId: departmentId ? departmentId : { not: null },
        },
        _count: { id: true },
      }),
      // Null groups are kept and reported as "Not specified".
      this.prisma.user.groupBy({
        by: ['employeeType'],
        where: { ...userScopeWhere, isActive: true },
        _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['nationality'],
        where: { ...userScopeWhere, isActive: true },
        _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['gender'],
        where: { ...userScopeWhere, isActive: true },
        _count: { id: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...employeeFilter,
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: {
          employeeId: true,
          leaveType: true,
          status: true,
          days: true,
          employee: {
            select: {
              firstName: true,
              middleName: true,
              lastName: true,
              chineseName: true,
              departmentId: true,
            },
          },
        },
      }),
      this.prisma.overtimeSheet.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...employeeFilter,
          year: { gte: from.getUTCFullYear(), lte: to.getUTCFullYear() },
        },
        select: {
          employeeId: true,
          month: true,
          year: true,
          status: true,
          totalRegularHours: true,
          totalNightHours: true,
          totalWeekendHours: true,
          totalHolidayHours: true,
          totalHours: true,
          entries: {
            where: { siteAssignmentId: { not: null } },
            select: { totalHours: true, siteWithinScheduleHours: true },
          },
          employee: {
            select: {
              firstName: true,
              middleName: true,
              lastName: true,
              chineseName: true,
              departmentId: true,
            },
          },
        },
      }),
      this.prisma.flightApplication.count({
        where: {
          companyId,
          deletedAt: null,
          status: APPROVED,
          departureDate: { gte: from, lte: to },
          ...(employeeScope ? { submittedBy: { in: employeeScope } } : {}),
        },
      }),
      this.prisma.businessTrip.count({
        where: {
          companyId,
          deletedAt: null,
          status: APPROVED,
          departureDate: { gte: from, lte: to },
          ...(employeeScope ? { submittedBy: { in: employeeScope } } : {}),
        },
      }),
      this.prisma.employeeContract.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          ...employeeFilter,
        },
      }),
      this.prisma.employeeContract.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          endDate: { gte: from, lte: to },
          ...employeeFilter,
        },
      }),
      this.prisma.employeeContract.count({
        where: {
          companyId,
          deletedAt: null,
          status: { not: 'ACTIVE' },
          endDate: { gte: from, lte: to },
          ...employeeFilter,
        },
      }),
      this.prisma.siteAssignment.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...employeeFilter,
          startDate: { lte: to },
          endDate: { gte: from },
        },
        select: { status: true },
      }),
      this.prisma.workFromHomeDay.count({
        where: {
          companyId,
          deletedAt: null,
          date: { gte: from, lte: to },
        },
      }),
      this.prisma.expenseClaim.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...employeeFilter,
          createdAt: { gte: from, lte: to },
        },
        select: {
          status: true,
          totalAmountEtb: true,
          items: { select: { category: true, amountEtb: true } },
        },
      }),
      this.prisma.employeeEvaluation.findMany({
        where: {
          companyId,
          deletedAt: null,
          ...employeeFilter,
          createdAt: { gte: from, lte: to },
        },
        select: {
          status: true,
          finalScore: true,
          adjustedScore: true,
        },
      }),
      this.prisma.payrollRun.findMany({
        where: {
          companyId,
          deletedAt: null,
          year: { gte: from.getUTCFullYear(), lte: to.getUTCFullYear() },
        },
        select: {
          month: true,
          year: true,
          status: true,
          entries: {
            where: employeeFilter,
            select: {
              grossIncome: true,
              pensionEmployee: true,
              incomeTax: true,
              netPay: true,
              employee: { select: { departmentId: true } },
            },
          },
        },
      }),
      this.prisma.attendanceRecord.findMany({
        where: {
          companyId,
          ...employeeFilter,
          employee: hrProcessEmployeeWhere({ deletedAt: null }),
          year: { gte: from.getUTCFullYear(), lte: to.getUTCFullYear() },
        },
        select: {
          month: true,
          year: true,
          scheduledDays: true,
          presentDays: true,
          absentDays: true,
          unpaidLeaveDays: true,
          employee: { select: { departmentId: true } },
        },
      }),
      this.prisma.user.findMany({
        where: userScopeWhere,
        select: {
          isActive: true,
          employmentDate: true,
          employmentPeriods: { select: { startDate: true, endDate: true } },
        },
      }),
      this.prisma.employeeContract.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          endDate: {
            gte: new Date(
              Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
            ),
            lte: endOfDayUtc(
              new Date(
                Date.UTC(
                  now.getUTCFullYear(),
                  now.getUTCMonth() + 1 + CONTRACT_TIMELINE_MONTHS,
                  0,
                ),
              ),
            ),
          },
          ...employeeFilter,
        },
        orderBy: { endDate: 'asc' },
        select: {
          id: true,
          contractNumber: true,
          employeeId: true,
          endDate: true,
          employee: {
            select: {
              firstName: true,
              middleName: true,
              lastName: true,
              chineseName: true,
              departmentId: true,
            },
          },
        },
      }),
    ]);

    const fromMonthKey = monthKey(from.getUTCFullYear(), from.getUTCMonth() + 1);
    const toMonthKey = monthKey(to.getUTCFullYear(), to.getUTCMonth() + 1);
    const inRangeMonth = (row: { year: number; month: number }): boolean => {
      const key = monthKey(row.year, row.month);
      return key >= fromMonthKey && key <= toMonthKey;
    };
    const periodPayrollRuns = payrollRuns.filter(inRangeMonth);
    const periodAttendance = attendanceRecords.filter(inRangeMonth);

    const departmentNameById = await this.loadDepartmentNames(companyId, [
      ...headcountGroups.map((row) => row.departmentId),
      ...periodPayrollRuns.flatMap((run) =>
        run.entries.map((entry) => entry.employee.departmentId),
      ),
      ...periodAttendance.map((row) => row.employee.departmentId),
      ...expiringContractRows.map((row) => row.employee.departmentId),
    ].filter((id): id is string => Boolean(id)));

    const byDepartment: HrReportNamedCount[] = headcountGroups
      .filter((row) => row.departmentId)
      .map((row) => ({
        name:
          departmentNameById.get(row.departmentId as string) ?? 'Unassigned',
        count: row._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    const leave = this.summariseLeave(leaveRequests, departmentNameById);
    const overtime = this.summariseOvertime(
      overtimeSheets.filter(inRangeMonth),
      departmentNameById,
    );
    const siteAssignments = this.summariseStatusCounts(siteAssignmentRows);
    const expenses = this.summariseExpenses(expenseClaims);
    const evaluations = this.summariseEvaluations(evaluationRows);
    const payroll = this.summarisePayroll(periodPayrollRuns, departmentNameById);
    const attendance = this.summariseAttendance(
      periodAttendance,
      departmentNameById,
    );
    // Trend ends at the report's end month, never later than today.
    const headcountTrend = this.buildHeadcountTrend(
      trendEmployees,
      to.getTime() < now.getTime() ? to : now,
    );
    const expiringContracts: HrReportExpiringContractRow[] =
      expiringContractRows.map((row) => {
        const endDate = row.endDate as Date;
        return {
          contractId: row.id,
          contractNumber: row.contractNumber,
          employeeId: row.employeeId,
          employeeName: formatUserDisplayName(row.employee),
          department: row.employee.departmentId
            ? (departmentNameById.get(row.employee.departmentId) ?? null)
            : null,
          endDate: formatDateOnly(endDate),
          month: monthLabel(endDate.getUTCFullYear(), endDate.getUTCMonth() + 1),
        };
      });
    const contractsByMonth: HrReportMonthCount[] = Array.from(
      { length: CONTRACT_TIMELINE_MONTHS },
      (_, offset) => {
        const date = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1 + offset, 1),
        );
        const month = monthLabel(date.getUTCFullYear(), date.getUTCMonth() + 1);
        return {
          month,
          count: expiringContracts.filter((row) => row.month === month).length,
        };
      },
    );

    return {
      generatedAt: new Date().toISOString(),
      range: { from: formatDateOnly(from), to: formatDateOnly(to) },
      departmentId,
      headcount: {
        activeEmployees,
        inactiveEmployees,
        newHiresInRange,
        byDepartment,
        byEmployeeType: this.toNamedCounts(employeeTypeGroups, 'employeeType'),
        byNationality: this.toNamedCounts(nationalityGroups, 'nationality'),
        byGender: this.toNamedCounts(genderGroups, 'gender'),
        withoutDepartment: departmentId ? 0 : withoutDepartment,
        withoutLeavePolicy,
      },
      headcountTrend,
      leave,
      overtime,
      travel: { flights, businessTrips },
      contracts: {
        active: activeContracts,
        expiringInRange,
        endedInRange,
      },
      contractsByMonth,
      expiringContracts,
      payroll,
      attendance,
      siteAssignments: {
        requests: siteAssignments.total,
        approvedRequests: siteAssignments.approved,
        byStatus: siteAssignments.byStatus,
      },
      workFromHome: { days: workFromHomeDays },
      expenses,
      evaluations,
    };
  }

  /** Employee ids in the department, or null when the report is company-wide. */
  private async resolveEmployeeScope(
    companyId: string,
    departmentId: string | null,
  ): Promise<string[] | null> {
    if (!departmentId) {
      return null;
    }
    const employees = await this.prisma.user.findMany({
      where: activeOnly({ companyId, departmentId }),
      select: { id: true },
    });
    return employees.map((row) => row.id);
  }

  private async loadDepartmentNames(
    companyId: string,
    ids: string[],
  ): Promise<Map<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }
    const departments = await this.prisma.department.findMany({
      where: activeOnly({ companyId, id: { in: [...new Set(ids)] } }),
      select: { id: true, name: true },
    });
    return new Map(departments.map((row) => [row.id, row.name]));
  }

  private summariseLeave(
    rows: Array<{
      employeeId: string;
      leaveType: string;
      status: string;
      days: Prisma.Decimal | null;
      employee: {
        firstName: string;
        middleName?: string | null;
        lastName: string;
        chineseName?: string | null;
        departmentId: string | null;
      };
    }>,
    departmentNameById: Map<string, string>,
  ): HrReport['leave'] {
    const byStatus: Record<string, number> = {};
    const typeTotals = new Map<string, { requests: number; days: number }>();
    const employeeTotals = new Map<
      string,
      HrReportEmployeeLeaveRow
    >();

    let approvedRequests = 0;
    let approvedDays = 0;

    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      const days = toNumber(row.days);
      const isApproved = row.status === APPROVED;

      if (isApproved) {
        approvedRequests += 1;
        approvedDays += days;
      }

      const type = typeTotals.get(row.leaveType) ?? { requests: 0, days: 0 };
      type.requests += 1;
      type.days += isApproved ? days : 0;
      typeTotals.set(row.leaveType, type);

      const employee = employeeTotals.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        employeeName: formatUserDisplayName(row.employee),
        department: row.employee.departmentId
          ? (departmentNameById.get(row.employee.departmentId) ?? null)
          : null,
        requests: 0,
        days: 0,
      };
      employee.requests += 1;
      employee.days += isApproved ? days : 0;
      employeeTotals.set(row.employeeId, employee);
    }

    return {
      requests: rows.length,
      approvedRequests,
      approvedDays: round(approvedDays),
      byType: [...typeTotals.entries()]
        .map(([leaveType, totals]) => ({
          leaveType,
          requests: totals.requests,
          days: round(totals.days),
        }))
        .sort((a, b) => b.days - a.days || b.requests - a.requests),
      byStatus,
      topEmployees: [...employeeTotals.values()]
        .map((row) => ({ ...row, days: round(row.days) }))
        .sort((a, b) => b.days - a.days || b.requests - a.requests)
        .slice(0, 10),
    };
  }

  private summariseOvertime(
    rows: Array<{
      employeeId: string;
      status: string;
      totalRegularHours: Prisma.Decimal;
      totalNightHours: Prisma.Decimal;
      totalWeekendHours: Prisma.Decimal;
      totalHolidayHours: Prisma.Decimal;
      totalHours: Prisma.Decimal | null;
      entries?: Array<{
        totalHours: Prisma.Decimal | null;
        siteWithinScheduleHours: Prisma.Decimal;
      }>;
      employee: {
        firstName: string;
        middleName?: string | null;
        lastName: string;
        chineseName?: string | null;
        departmentId: string | null;
      };
    }>,
    departmentNameById: Map<string, string>,
  ): HrReport['overtime'] {
    const byStatus: Record<string, number> = {};
    const employeeTotals = new Map<string, HrReportEmployeeOvertimeRow>();

    let approvedSheets = 0;
    let approvedHours = 0;
    let regularHours = 0;
    let nightHours = 0;
    let weekendHours = 0;
    let holidayHours = 0;
    let siteAssignmentHours = 0;
    let siteWithinScheduleHours = 0;

    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      if (row.status !== APPROVED) {
        continue;
      }

      const hours = toNumber(row.totalHours);
      approvedSheets += 1;
      approvedHours += hours;
      regularHours += toNumber(row.totalRegularHours);
      nightHours += toNumber(row.totalNightHours);
      weekendHours += toNumber(row.totalWeekendHours);
      holidayHours += toNumber(row.totalHolidayHours);
      for (const entry of row.entries ?? []) {
        siteAssignmentHours += toNumber(entry.totalHours);
        siteWithinScheduleHours += toNumber(entry.siteWithinScheduleHours);
      }

      const employee = employeeTotals.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        employeeName: formatUserDisplayName(row.employee),
        department: row.employee.departmentId
          ? (departmentNameById.get(row.employee.departmentId) ?? null)
          : null,
        sheets: 0,
        totalHours: 0,
      };
      employee.sheets += 1;
      employee.totalHours += hours;
      employeeTotals.set(row.employeeId, employee);
    }

    return {
      sheets: rows.length,
      approvedSheets,
      approvedHours: round(approvedHours),
      regularHours: round(regularHours),
      nightHours: round(nightHours),
      weekendHours: round(weekendHours),
      holidayHours: round(holidayHours),
      siteAssignmentHours: round(siteAssignmentHours),
      siteWithinScheduleHours: round(siteWithinScheduleHours),
      otherHours: round(approvedHours - siteWithinScheduleHours),
      byStatus,
      topEmployees: [...employeeTotals.values()]
        .map((row) => ({ ...row, totalHours: round(row.totalHours) }))
        .sort((a, b) => b.totalHours - a.totalHours)
        .slice(0, 10),
    };
  }

  private toNamedCounts<K extends string>(
    rows: Array<{ [P in K]: string | null } & { _count: { id: number } }>,
    key: K,
  ): HrReportNamedCount[] {
    return rows
      .map((row) => ({
        name: row[key] == null ? NOT_SPECIFIED : String(row[key]),
        count: row._count.id,
      }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
  }

  private summarisePayroll(
    runs: Array<{
      status: string;
      entries: Array<{
        grossIncome: Prisma.Decimal;
        pensionEmployee: Prisma.Decimal;
        incomeTax: Prisma.Decimal;
        netPay: Prisma.Decimal;
        employee: { departmentId: string | null };
      }>;
    }>,
    departmentNameById: Map<string, string>,
  ): HrReportPayroll {
    const statusCounts = new Map<string, number>();
    const departmentNet = new Map<string, number>();
    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;

    for (const run of runs) {
      statusCounts.set(run.status, (statusCounts.get(run.status) ?? 0) + 1);
      if (run.status === 'CANCELLED') {
        continue;
      }
      for (const entry of run.entries) {
        const net = toNumber(entry.netPay);
        totalGross += toNumber(entry.grossIncome);
        totalDeductions +=
          toNumber(entry.pensionEmployee) + toNumber(entry.incomeTax);
        totalNet += net;
        const department = entry.employee.departmentId
          ? (departmentNameById.get(entry.employee.departmentId) ?? 'Unassigned')
          : 'Unassigned';
        departmentNet.set(department, (departmentNet.get(department) ?? 0) + net);
      }
    }

    // Money is rounded to cents, not the 0.1 used for days and hours.
    const cents = (value: number): number => Math.round(value * 100) / 100;

    return {
      runs: runs.length,
      totalGross: cents(totalGross),
      totalDeductions: cents(totalDeductions),
      totalNet: cents(totalNet),
      byDepartment: [...departmentNet.entries()]
        .map(([department, net]) => ({ department, totalNet: cents(net) }))
        .sort((a, b) => b.totalNet - a.totalNet),
      byStatus: [...statusCounts.entries()].map(([status, count]) => ({
        status,
        count,
      })),
    };
  }

  private summariseAttendance(
    rows: Array<{
      month: number;
      year: number;
      scheduledDays: Prisma.Decimal;
      presentDays: Prisma.Decimal;
      absentDays: Prisma.Decimal;
      unpaidLeaveDays: Prisma.Decimal;
      employee: { departmentId: string | null };
    }>,
    departmentNameById: Map<string, string>,
  ): HrReportAttendance {
    // A month's working days = the full schedule; mid-month joiners have fewer.
    const workingDaysByMonth = new Map<number, number>();
    const departmentTotals = new Map<
      string,
      { scheduled: number; present: number }
    >();
    let scheduled = 0;
    let present = 0;
    let absent = 0;
    let unpaidLeave = 0;

    for (const row of rows) {
      const rowScheduled = toNumber(row.scheduledDays);
      const rowPresent = toNumber(row.presentDays);
      const key = monthKey(row.year, row.month);
      workingDaysByMonth.set(
        key,
        Math.max(workingDaysByMonth.get(key) ?? 0, rowScheduled),
      );
      scheduled += rowScheduled;
      present += rowPresent;
      absent += toNumber(row.absentDays);
      unpaidLeave += toNumber(row.unpaidLeaveDays);

      const department = row.employee.departmentId
        ? (departmentNameById.get(row.employee.departmentId) ?? 'Unassigned')
        : 'Unassigned';
      const totals = departmentTotals.get(department) ?? {
        scheduled: 0,
        present: 0,
      };
      totals.scheduled += rowScheduled;
      totals.present += rowPresent;
      departmentTotals.set(department, totals);
    }

    return {
      records: rows.length,
      totalWorkingDays: round(
        [...workingDaysByMonth.values()].reduce((sum, days) => sum + days, 0),
      ),
      averageAttendanceRate: percent(present, scheduled),
      totalAbsentDays: round(absent),
      totalUnpaidLeaveDays: round(unpaidLeave),
      byDepartment: [...departmentTotals.entries()]
        .filter(([, totals]) => totals.scheduled > 0)
        .map(([department, totals]) => ({
          department,
          attendanceRate: percent(totals.present, totals.scheduled),
        }))
        .sort((a, b) => b.attendanceRate - a.attendanceRate),
    };
  }

  /**
   * Employed headcount at each month end (the current month counts at `anchor`).
   * Uses EmploymentPeriod rows; users without any fall back to an active login
   * plus employmentDate, matching `employedInMonthWhere`.
   */
  private buildHeadcountTrend(
    employees: Array<{
      isActive: boolean;
      employmentDate: Date | null;
      employmentPeriods: Array<{ startDate: Date; endDate: Date | null }>;
    }>,
    anchor: Date,
  ): HrReportMonthCount[] {
    return Array.from({ length: HEADCOUNT_TREND_MONTHS }, (_, index) => {
      const offset = HEADCOUNT_TREND_MONTHS - 1 - index;
      const year = anchor.getUTCFullYear();
      const month = anchor.getUTCMonth() - offset;
      const monthEnd = new Date(Date.UTC(year, month + 1, 0));
      const time = (offset === 0 ? startOfDayUtc(anchor) : monthEnd).getTime();

      const count = employees.filter((employee) => {
        if (employee.employmentPeriods.length === 0) {
          return (
            employee.isActive &&
            (employee.employmentDate == null ||
              employee.employmentDate.getTime() <= time)
          );
        }
        return employee.employmentPeriods.some(
          (period) =>
            period.startDate.getTime() <= time &&
            (period.endDate == null || period.endDate.getTime() >= time),
        );
      }).length;

      return {
        month: monthLabel(monthEnd.getUTCFullYear(), monthEnd.getUTCMonth() + 1),
        count,
      };
    });
  }

  private summariseStatusCounts(
    rows: Array<{ status: string }>,
  ): { total: number; approved: number; byStatus: Record<string, number> } {
    const byStatus: Record<string, number> = {};
    let approved = 0;
    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      if (row.status === APPROVED) {
        approved += 1;
      }
    }
    return { total: rows.length, approved, byStatus };
  }

  private summariseExpenses(
    rows: Array<{
      status: string;
      totalAmountEtb: Prisma.Decimal;
      items: Array<{ category: string; amountEtb: Prisma.Decimal }>;
    }>,
  ): HrReport['expenses'] {
    const byStatus: Record<string, number> = {};
    const categoryTotals = new Map<string, { count: number; amount: number }>();
    let approvedClaims = 0;
    let approvedAmountEtb = 0;

    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      if (row.status === APPROVED) {
        approvedClaims += 1;
        approvedAmountEtb += toNumber(row.totalAmountEtb);
      }
      for (const item of row.items) {
        const current = categoryTotals.get(item.category) ?? {
          count: 0,
          amount: 0,
        };
        current.count += 1;
        current.amount += toNumber(item.amountEtb);
        categoryTotals.set(item.category, current);
      }
    }

    return {
      claims: rows.length,
      approvedClaims,
      approvedAmountEtb: round(approvedAmountEtb),
      byStatus,
      byCategory: [...categoryTotals.entries()]
        .map(([name, totals]) => ({
          name,
          count: totals.count,
          amount: round(totals.amount),
        }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 10),
    };
  }

  private summariseEvaluations(
    rows: Array<{
      status: string;
      finalScore: Prisma.Decimal | null;
      adjustedScore: Prisma.Decimal | null;
    }>,
  ): HrReport['evaluations'] {
    const byStatus: Record<string, number> = {};
    const completedStatuses = new Set([
      'ACCEPTED',
      'LOCKED',
      'HR_DECIDED',
      'DL_UPHELD',
      'DL_ADJUSTED',
    ]);
    let completed = 0;
    let scoreSum = 0;
    let scoreCount = 0;

    for (const row of rows) {
      byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
      if (completedStatuses.has(row.status)) {
        completed += 1;
      }
      const score = toNumber(row.adjustedScore ?? row.finalScore);
      if (score > 0) {
        scoreSum += score;
        scoreCount += 1;
      }
    }

    return {
      total: rows.length,
      completed,
      averageFinalScore:
        scoreCount > 0 ? round(scoreSum / scoreCount) : null,
      byStatus,
    };
  }
}
