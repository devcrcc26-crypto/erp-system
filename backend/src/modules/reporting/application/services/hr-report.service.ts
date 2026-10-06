import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
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

    const userScopeWhere = {
      companyId,
      deletedAt: null,
      ...(departmentId ? { departmentId } : {}),
    };

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
    ] = await Promise.all([
      this.prisma.user.count({
        where: activeOnly({
          companyId,
          isActive: true,
          ...(departmentId ? { departmentId } : {}),
        }),
      }),
      this.prisma.user.count({
        where: activeOnly({
          companyId,
          isActive: false,
          ...(departmentId ? { departmentId } : {}),
        }),
      }),
      this.prisma.user.count({
        where: activeOnly({
          companyId,
          createdAt: { gte: from, lte: to },
          ...(departmentId ? { departmentId } : {}),
        }),
      }),
      this.prisma.user.count({
        where: activeOnly({ companyId, isActive: true, departmentId: null }),
      }),
      this.prisma.user.count({
        where: activeOnly({
          companyId,
          isActive: true,
          leavePolicyId: null,
          ...(departmentId ? { departmentId } : {}),
        }),
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
      this.prisma.user.groupBy({
        by: ['employeeType'],
        where: { ...userScopeWhere, isActive: true, employeeType: { not: null } },
        _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['nationality'],
        where: { ...userScopeWhere, isActive: true, nationality: { not: null } },
        _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['gender'],
        where: { ...userScopeWhere, isActive: true, gender: { not: null } },
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
            select: { firstName: true, lastName: true, departmentId: true },
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
          employee: {
            select: { firstName: true, lastName: true, departmentId: true },
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
    ]);

    const departmentNameById = await this.loadDepartmentNames(
      companyId,
      headcountGroups
        .map((row) => row.departmentId)
        .filter((id): id is string => Boolean(id)),
    );

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
      overtimeSheets.filter((sheet) => {
        const key = monthKey(sheet.year, sheet.month);
        return (
          key >= monthKey(from.getUTCFullYear(), from.getUTCMonth() + 1) &&
          key <= monthKey(to.getUTCFullYear(), to.getUTCMonth() + 1)
        );
      }),
      departmentNameById,
    );
    const siteAssignments = this.summariseStatusCounts(siteAssignmentRows);
    const expenses = this.summariseExpenses(expenseClaims);
    const evaluations = this.summariseEvaluations(evaluationRows);

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
      leave,
      overtime,
      travel: { flights, businessTrips },
      contracts: {
        active: activeContracts,
        expiringInRange,
        endedInRange,
      },
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
        lastName: string;
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
        employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
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
      employee: {
        firstName: string;
        lastName: string;
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

      const employee = employeeTotals.get(row.employeeId) ?? {
        employeeId: row.employeeId,
        employeeName: `${row.employee.firstName} ${row.employee.lastName}`.trim(),
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
      .filter((row) => row[key] != null)
      .map((row) => ({
        name: String(row[key]),
        count: row._count.id,
      }))
      .sort((a, b) => b.count - a.count);
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
