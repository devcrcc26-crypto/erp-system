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

export interface HrReport {
  generatedAt: string;
  range: HrReportRange;
  departmentId: string | null;
  headcount: {
    activeEmployees: number;
    byDepartment: HrReportNamedCount[];
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

    const [
      activeEmployees,
      withoutDepartment,
      withoutLeavePolicy,
      headcountGroups,
      leaveRequests,
      overtimeSheets,
      flights,
      businessTrips,
      activeContracts,
      expiringInRange,
      endedInRange,
    ] = await Promise.all([
      this.prisma.user.count({
        where: activeOnly({
          companyId,
          isActive: true,
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
          companyId,
          deletedAt: null,
          isActive: true,
          departmentId: departmentId ? departmentId : { not: null },
        },
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

    return {
      generatedAt: new Date().toISOString(),
      range: { from: formatDateOnly(from), to: formatDateOnly(to) },
      departmentId,
      headcount: {
        activeEmployees,
        byDepartment,
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
}
