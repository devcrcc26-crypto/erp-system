import { Injectable } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  AttendanceMonthStatus,
  LeaveRequestStatus,
  LeaveType,
  OvertimeSheetStatus,
  PayrollEntryFlag,
  PayrollRunStatus,
  PerDiemStatus,
  Prisma,
  SiteAssignmentStatus,
  EmployeeContractStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import {
  getTodayInTimezone,
  parseLocalDateOnly,
} from '../../../../shared/utils/date-validation.util';

export type AttendanceImportStatus = 'not_imported' | 'imported';
export type AttendanceApprovalStatus =
  | 'not_started'
  | 'in_progress'
  | 'approved';

export interface DashboardOperationalStats {
  visibility: {
    headcount: boolean;
    attendance: boolean;
    contracts: boolean;
    siteAssignments: boolean;
    perDiem: boolean;
    overtime: boolean;
    leave: boolean;
    personal: boolean;
  };
  headcount: {
    total: number;
    onLeaveToday: number;
    newThisMonth: number;
  } | null;
  attendance: {
    month: string;
    importStatus: AttendanceImportStatus;
    approvalStatus: AttendanceApprovalStatus;
    submittedCount: number;
    approvedCount: number;
    totalEmployees: number;
  } | null;
  overtime: {
    totalHours: number;
    pendingApprovalCount: number;
    approvedCount: number;
    employeesWithOT: number;
  };
  leave: {
    pendingApprovalCount: number;
    currentlyOnLeave: number;
    thisMonthRequests: number;
  };
  contractsExpiring: {
    within30: number;
    within60: number;
    within90: number;
    expiredUnrenewed: number;
  } | null;
  siteAssignments: {
    currentlyAssigned: number;
    expiringIn7Days: number;
    expiringIn30Days: number;
  } | null;
  perDiem: {
    pendingSettlement: number;
    pendingApproval: number;
  } | null;
  myPendingApprovals: {
    total: number;
    byType: Array<{ type: string; count: number }>;
  };
  personal: {
    myOtHoursThisMonth: number;
    myLeaveBalanceDays: number | null;
    myPendingRequestCount: number;
    upcomingSiteAssignment: {
      siteName: string;
      startDate: string;
      endDate: string;
    } | null;
  } | null;
  /** Direct-report rollup. Null unless the caller has direct reports. */
  myTeam: DashboardMyTeamStats | null;
  /** Per-employee OT breakdown this month (top 10). HR only. */
  overtimeByEmployee: DashboardOvertimeByEmployee[] | null;
  /** This month's leave requests grouped by leave type. HR only. */
  leaveByType: DashboardLeaveByType[] | null;
  /** Current month payroll run summary. HR only; null when no run exists. */
  payroll: DashboardPayrollStats | null;
  /** Self-scoped personal summary, always present. */
  myWork: DashboardMyWork;
  /** Five soonest-ending active contracts. HR only. */
  contractsExpiringSoonList: DashboardExpiringContract[] | null;
  /** Open approval requests across the company. HR only. */
  pendingApprovalsCompanyWide: number | null;
}

export interface DashboardMyTeamStats {
  totalDirectReports: number;
  onLeaveToday: number;
  pendingMyApproval: number;
  totalOTHoursThisMonth: number;
  otByEmployee: Array<{ employeeId: string; name: string; hours: number }>;
  currentlyOnLeave: number;
  siteCurrentlyAssigned: number;
  siteExpiringSoon: number;
}

export interface DashboardOvertimeByEmployee {
  employeeId: string;
  name: string;
  normal: number;
  evening: number;
  sunday: number;
  holiday: number;
  total: number;
}

export interface DashboardLeaveByType {
  type: string;
  count: number;
}

export interface DashboardPayrollStats {
  status: string;
  totalEmployees: number;
  flaggedCount: number;
}

export interface DashboardMyWork {
  leaveBalanceDays: number | null;
  otHoursThisMonth: number;
  pendingRequestsCount: number;
  nextSiteAssignment: {
    location: string;
    startDate: string;
    endDate: string;
  } | null;
}

export interface DashboardExpiringContract {
  employeeId: string;
  employeeName: string;
  endDate: string;
  endsToday: boolean;
}

interface RequestContext {
  companyId: string;
  userId: string;
}

interface CacheEntry {
  expiresAt: number;
  value: DashboardOperationalStats;
}

const CACHE_TTL_MS = 60_000;
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const TOP_OT_EMPLOYEES = 10;
const EXPIRING_CONTRACTS_LIMIT = 5;

const OPEN_APPROVAL_STATUSES: ApprovalRequestStatus[] = [
  ApprovalRequestStatus.PENDING,
  ApprovalRequestStatus.SUBMITTED,
  ApprovalRequestStatus.IN_REVIEW,
];

const OT_COUNTED_STATUSES: OvertimeSheetStatus[] = [
  OvertimeSheetStatus.SUBMITTED,
  OvertimeSheetStatus.IN_REVIEW,
  OvertimeSheetStatus.APPROVED,
];

/**
 * Aggregated operational dashboard stats (Addis Ababa calendar day).
 * Results are cached 60s per company+user.
 */
@Injectable()
export class DashboardOperationalStatsService {
  private readonly cache = new Map<string, CacheEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async getStats(ctx: RequestContext): Promise<DashboardOperationalStats> {
    const cacheKey = `${ctx.companyId}:${ctx.userId}`;
    const hit = this.cache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }

    const value = await this.computeStats(ctx);
    this.cache.set(cacheKey, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value,
    });
    return value;
  }

  private async computeStats(
    ctx: RequestContext,
  ): Promise<DashboardOperationalStats> {
    const { companyId, userId } = ctx;
    const todayStr = getTodayInTimezone();
    const today = parseLocalDateOnly(todayStr);
    const [yearStr, monthStr] = todayStr.split('-');
    const year = Number(yearStr);
    const month = Number(monthStr);
    const monthStart = parseLocalDateOnly(
      `${year}-${String(month).padStart(2, '0')}-01`,
    );
    const nextMonth =
      month === 12
        ? parseLocalDateOnly(`${year + 1}-01-01`)
        : parseLocalDateOnly(
            `${year}-${String(month + 1).padStart(2, '0')}-01`,
          );
    const in7 = addDays(today, 7);
    const in30 = addDays(today, 30);
    const in60 = addDays(today, 60);
    const in90 = addDays(today, 90);

    const [isHr, directReportIds] = await Promise.all([
      this.permissionService.hasPermission(userId, companyId, 'hr', 'view'),
      this.loadDirectReportIds(companyId, userId),
    ]);
    const isSupervisor = directReportIds.length > 0;
    const scopeEmployeeIds = this.resolveScopeIds(
      isHr,
      isSupervisor,
      userId,
      directReportIds,
    );

    const visibility = {
      headcount: isHr,
      attendance: isHr,
      contracts: isHr,
      siteAssignments: isHr || isSupervisor,
      perDiem: true,
      overtime: true,
      leave: true,
      personal: true,
    };

    const employeeFilter = (ids: string[] | null): Prisma.UserWhereInput =>
      ids === null
        ? hrProcessEmployeeWhere({ companyId, deletedAt: null, isActive: true })
        : hrProcessEmployeeWhere({
            companyId,
            deletedAt: null,
            isActive: true,
            id: { in: ids },
          });

    const scopedEmployeeRelation =
      scopeEmployeeIds === null
        ? hrProcessEmployeeWhere({})
        : hrProcessEmployeeWhere({ id: { in: scopeEmployeeIds } });

    const myPendingPromise = this.loadMyPendingApprovals(companyId, userId);
    const extrasPromise = Promise.all([
      isSupervisor
        ? this.loadMyTeamStats({
            companyId,
            directReportIds,
            today,
            in7,
            month,
            year,
            myPendingPromise,
          })
        : Promise.resolve(null),
      isHr
        ? this.loadOvertimeByEmployee(companyId, month, year)
        : Promise.resolve(null),
      isHr
        ? this.loadLeaveByType(companyId, monthStart, nextMonth)
        : Promise.resolve(null),
      isHr
        ? this.loadPayrollSummary(companyId, month, year)
        : Promise.resolve(null),
      isHr
        ? this.loadContractsExpiringSoonList(companyId, today, todayStr)
        : Promise.resolve(null),
      isHr
        ? this.prisma.approvalRequest.count({
            where: {
              companyId,
              deletedAt: null,
              status: { in: OPEN_APPROVAL_STATUSES },
            },
          })
        : Promise.resolve(null),
    ]);
    // Avoid an unhandled rejection if the main batch fails before extras are awaited.
    extrasPromise.catch(() => undefined);

    const [
      headcountTotal,
      onLeaveToday,
      newThisMonth,
      attendanceBatch,
      attendanceApproval,
      attendanceSubmitted,
      attendanceTotalEmployees,
      otAgg,
      otPending,
      otApproved,
      otEmployees,
      leavePending,
      leaveOnLeaveScoped,
      leaveThisMonth,
      within30,
      within60,
      within90,
      expiredContracts,
      siteCurrent,
      siteExp7,
      siteExp30,
      perDiemPendingSettlement,
      perDiemPendingApproval,
      myPendingTiers,
      personalOt,
      personalLeaveBalance,
      personalPendingRequests,
      upcomingSite,
    ] = await Promise.all([
      visibility.headcount
        ? this.prisma.user.count({ where: employeeFilter(null) })
        : Promise.resolve(0),
      visibility.headcount
        ? this.countOnLeaveToday(companyId, today, null)
        : Promise.resolve(0),
      visibility.headcount
        ? this.prisma.user.count({
            where: {
              ...employeeFilter(null),
              employmentDate: { gte: monthStart, lt: nextMonth },
            },
          })
        : Promise.resolve(0),

      visibility.attendance
        ? this.prisma.attendanceImportBatch.findUnique({
            where: {
              companyId_month_year: { companyId, month, year },
            },
            select: { id: true },
          })
        : Promise.resolve(null),
      visibility.attendance
        ? this.prisma.attendanceMonthlyApproval.findUnique({
            where: {
              companyId_month_year: { companyId, month, year },
            },
            select: { status: true },
          })
        : Promise.resolve(null),
      visibility.attendance
        ? this.prisma.attendanceRecord.count({
            where: {
              companyId,
              month,
              year,
              employee: hrProcessEmployeeWhere({}),
            },
          })
        : Promise.resolve(0),
      visibility.attendance
        ? this.prisma.user.count({ where: employeeFilter(null) })
        : Promise.resolve(0),

      this.prisma.overtimeSheet.aggregate({
        where: {
          companyId,
          deletedAt: null,
          month,
          year,
          status: { in: OT_COUNTED_STATUSES },
          employee: scopedEmployeeRelation,
        },
        _sum: { totalHours: true },
      }),
      this.prisma.overtimeSheet.count({
        where: {
          companyId,
          deletedAt: null,
          month,
          year,
          status: {
            in: [OvertimeSheetStatus.SUBMITTED, OvertimeSheetStatus.IN_REVIEW],
          },
          employee: scopedEmployeeRelation,
        },
      }),
      this.prisma.overtimeSheet.count({
        where: {
          companyId,
          deletedAt: null,
          month,
          year,
          status: OvertimeSheetStatus.APPROVED,
          employee: scopedEmployeeRelation,
        },
      }),
      this.prisma.overtimeSheet.findMany({
        where: {
          companyId,
          deletedAt: null,
          month,
          year,
          status: { in: OT_COUNTED_STATUSES },
          employee: scopedEmployeeRelation,
        },
        select: { employeeId: true },
        distinct: ['employeeId'],
      }),

      isHr
        ? this.prisma.leaveRequest.count({
            where: {
              companyId,
              deletedAt: null,
              status: {
                in: [LeaveRequestStatus.SUBMITTED, LeaveRequestStatus.IN_REVIEW],
              },
            },
          })
        : this.countLeavePendingMyAction(companyId, userId),
      this.countOnLeaveToday(companyId, today, scopeEmployeeIds),
      this.prisma.leaveRequest.count({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: monthStart, lt: nextMonth },
          employee: scopedEmployeeRelation,
        },
      }),

      visibility.contracts
        ? this.countContractsExpiring(companyId, today, in30)
        : Promise.resolve(0),
      visibility.contracts
        ? this.countContractsExpiring(companyId, today, in60)
        : Promise.resolve(0),
      visibility.contracts
        ? this.countContractsExpiring(companyId, today, in90)
        : Promise.resolve(0),
      visibility.contracts
        ? this.countExpiredUnrenewed(companyId, today)
        : Promise.resolve(0),

      visibility.siteAssignments
        ? this.prisma.siteAssignment.count({
            where: {
              companyId,
              deletedAt: null,
              status: SiteAssignmentStatus.APPROVED,
              startDate: { lte: today },
              endDate: { gte: today },
              employee: scopedEmployeeRelation,
            },
          })
        : Promise.resolve(0),
      visibility.siteAssignments
        ? this.prisma.siteAssignment.count({
            where: {
              companyId,
              deletedAt: null,
              status: SiteAssignmentStatus.APPROVED,
              endDate: { gte: today, lte: in7 },
              employee: scopedEmployeeRelation,
            },
          })
        : Promise.resolve(0),
      visibility.siteAssignments
        ? this.prisma.siteAssignment.count({
            where: {
              companyId,
              deletedAt: null,
              status: SiteAssignmentStatus.APPROVED,
              endDate: { gte: today, lte: in30 },
              employee: scopedEmployeeRelation,
            },
          })
        : Promise.resolve(0),

      this.prisma.perDiemRequest.count({
        where: {
          companyId,
          deletedAt: null,
          status: PerDiemStatus.ACTIVE,
          settlementId: null,
          ...(isHr ? {} : { employeeId: userId }),
        },
      }),
      this.prisma.perDiemRequest.count({
        where: {
          companyId,
          deletedAt: null,
          status: {
            in: [PerDiemStatus.SUBMITTED, PerDiemStatus.IN_REVIEW],
          },
          ...(isHr ? {} : { employeeId: userId }),
        },
      }),

      myPendingPromise,

      this.prisma.overtimeSheet.aggregate({
        where: {
          companyId,
          deletedAt: null,
          employeeId: userId,
          month,
          year,
          status: { in: OT_COUNTED_STATUSES },
        },
        _sum: { totalHours: true },
      }),
      this.prisma.leaveBalance.findFirst({
        where: {
          companyId,
          employeeId: userId,
          year,
          leaveType: LeaveType.ANNUAL,
        },
        select: { remaining: true },
      }),
      this.prisma.approvalRequest.count({
        where: {
          companyId,
          deletedAt: null,
          requestedBy: userId,
          status: { in: OPEN_APPROVAL_STATUSES },
        },
      }),
      this.prisma.siteAssignment.findFirst({
        where: {
          companyId,
          deletedAt: null,
          employeeId: userId,
          status: SiteAssignmentStatus.APPROVED,
          endDate: { gte: today },
        },
        orderBy: { startDate: 'asc' },
        select: { siteName: true, startDate: true, endDate: true },
      }),
    ]);

    const [
      myTeam,
      overtimeByEmployee,
      leaveByType,
      payroll,
      contractsExpiringSoonList,
      pendingApprovalsCompanyWide,
    ] = await extrasPromise;

    const approvalStatus = mapAttendanceApprovalStatus(
      attendanceBatch ? (attendanceApproval?.status ?? null) : null,
      Boolean(attendanceBatch),
    );
    const submittedCount = attendanceSubmitted;
    const approvedCount =
      approvalStatus === 'approved' ? submittedCount : 0;

    const myOtHoursThisMonth = Number(personalOt._sum.totalHours ?? 0);
    const myLeaveBalanceDays =
      personalLeaveBalance?.remaining != null
        ? Number(personalLeaveBalance.remaining)
        : null;
    const nextSiteAssignment: DashboardMyWork['nextSiteAssignment'] =
      upcomingSite
        ? {
            location: upcomingSite.siteName,
            startDate: upcomingSite.startDate.toISOString().slice(0, 10),
            endDate: upcomingSite.endDate.toISOString().slice(0, 10),
          }
        : null;

    return {
      visibility,
      headcount: visibility.headcount
        ? {
            total: headcountTotal,
            onLeaveToday,
            newThisMonth,
          }
        : null,
      attendance: visibility.attendance
        ? {
            month: `${MONTH_NAMES[month - 1]} ${year}`,
            importStatus: attendanceBatch ? 'imported' : 'not_imported',
            approvalStatus,
            submittedCount,
            approvedCount,
            totalEmployees: attendanceTotalEmployees,
          }
        : null,
      overtime: {
        totalHours: Number(otAgg._sum.totalHours ?? 0),
        pendingApprovalCount: otPending,
        approvedCount: otApproved,
        employeesWithOT: otEmployees.length,
      },
      leave: {
        pendingApprovalCount: leavePending,
        currentlyOnLeave: leaveOnLeaveScoped,
        thisMonthRequests: leaveThisMonth,
      },
      contractsExpiring: visibility.contracts
        ? {
            within30,
            within60,
            within90,
            expiredUnrenewed: expiredContracts,
          }
        : null,
      siteAssignments: visibility.siteAssignments
        ? {
            currentlyAssigned: siteCurrent,
            expiringIn7Days: siteExp7,
            expiringIn30Days: siteExp30,
          }
        : null,
      perDiem: {
        pendingSettlement: perDiemPendingSettlement,
        pendingApproval: perDiemPendingApproval,
      },
      myPendingApprovals: myPendingTiers,
      personal: {
        myOtHoursThisMonth,
        myLeaveBalanceDays,
        myPendingRequestCount: personalPendingRequests,
        upcomingSiteAssignment: nextSiteAssignment
          ? {
              siteName: nextSiteAssignment.location,
              startDate: nextSiteAssignment.startDate,
              endDate: nextSiteAssignment.endDate,
            }
          : null,
      },
      myTeam,
      overtimeByEmployee,
      leaveByType,
      payroll,
      myWork: {
        leaveBalanceDays: myLeaveBalanceDays,
        otHoursThisMonth: myOtHoursThisMonth,
        pendingRequestsCount: personalPendingRequests,
        nextSiteAssignment,
      },
      contractsExpiringSoonList,
      pendingApprovalsCompanyWide,
    };
  }

  /** Direct-report rollup for supervisors (self excluded from OT figures). */
  private async loadMyTeamStats(args: {
    companyId: string;
    directReportIds: string[];
    today: Date;
    in7: Date;
    month: number;
    year: number;
    myPendingPromise: Promise<{ total: number }>;
  }): Promise<DashboardMyTeamStats> {
    const { companyId, directReportIds, today, in7, month, year } = args;
    const [onLeaveToday, myPending, sheets, siteCurrent, siteExpiring] =
      await Promise.all([
        this.countOnLeaveToday(companyId, today, directReportIds),
        args.myPendingPromise,
        this.prisma.overtimeSheet.findMany({
          where: {
            companyId,
            deletedAt: null,
            month,
            year,
            status: { in: OT_COUNTED_STATUSES },
            employeeId: { in: directReportIds },
          },
          select: {
            employeeId: true,
            totalRegularHours: true,
            totalNightHours: true,
            totalWeekendHours: true,
            totalHolidayHours: true,
            employee: { select: { firstName: true, lastName: true } },
          },
        }),
        this.prisma.siteAssignment.count({
          where: {
            companyId,
            deletedAt: null,
            status: SiteAssignmentStatus.APPROVED,
            startDate: { lte: today },
            endDate: { gte: today },
            employeeId: { in: directReportIds },
          },
        }),
        this.prisma.siteAssignment.count({
          where: {
            companyId,
            deletedAt: null,
            status: SiteAssignmentStatus.APPROVED,
            endDate: { gte: today, lte: in7 },
            employeeId: { in: directReportIds },
          },
        }),
      ]);

    const otByEmployee = sheets
      .map((sheet) => ({
        employeeId: sheet.employeeId,
        name: formatPersonName(sheet.employee),
        hours: roundHours(
          Number(sheet.totalRegularHours) +
            Number(sheet.totalNightHours) +
            Number(sheet.totalWeekendHours) +
            Number(sheet.totalHolidayHours),
        ),
      }))
      .filter((row) => row.hours > 0)
      .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));

    return {
      totalDirectReports: directReportIds.length,
      onLeaveToday,
      pendingMyApproval: myPending.total,
      totalOTHoursThisMonth: roundHours(
        otByEmployee.reduce((sum, row) => sum + row.hours, 0),
      ),
      otByEmployee,
      currentlyOnLeave: onLeaveToday,
      siteCurrentlyAssigned: siteCurrent,
      siteExpiringSoon: siteExpiring,
    };
  }

  /** Top 10 employees by overtime hours this month, split by bucket (from entries). */
  private async loadOvertimeByEmployee(
    companyId: string,
    month: number,
    year: number,
  ): Promise<DashboardOvertimeByEmployee[]> {
    const grouped = await this.prisma.overtimeEntry.groupBy({
      by: ['sheetId'],
      where: {
        sheet: {
          companyId,
          deletedAt: null,
          month,
          year,
          status: { in: OT_COUNTED_STATUSES },
          employee: hrProcessEmployeeWhere({}),
        },
      },
      _sum: {
        regularHours: true,
        nightHours: true,
        weekendHours: true,
        holidayHours: true,
      },
    });
    if (grouped.length === 0) {
      return [];
    }

    const rows = grouped
      .map((row) => {
        const normal = Number(row._sum.regularHours ?? 0);
        const evening = Number(row._sum.nightHours ?? 0);
        const sunday = Number(row._sum.weekendHours ?? 0);
        const holiday = Number(row._sum.holidayHours ?? 0);
        return {
          sheetId: row.sheetId,
          normal,
          evening,
          sunday,
          holiday,
          total: normal + evening + sunday + holiday,
        };
      })
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP_OT_EMPLOYEES);
    if (rows.length === 0) {
      return [];
    }

    const sheets = await this.prisma.overtimeSheet.findMany({
      where: { companyId, id: { in: rows.map((row) => row.sheetId) } },
      select: {
        id: true,
        employeeId: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    const sheetById = new Map(sheets.map((sheet) => [sheet.id, sheet]));

    const result: DashboardOvertimeByEmployee[] = [];
    for (const row of rows) {
      const sheet = sheetById.get(row.sheetId);
      if (!sheet) {
        continue;
      }
      result.push({
        employeeId: sheet.employeeId,
        name: formatPersonName(sheet.employee),
        normal: roundHours(row.normal),
        evening: roundHours(row.evening),
        sunday: roundHours(row.sunday),
        holiday: roundHours(row.holiday),
        total: roundHours(row.total),
      });
    }
    return result;
  }

  /** Company-wide leave requests created this month, grouped by leave type. */
  private async loadLeaveByType(
    companyId: string,
    monthStart: Date,
    nextMonth: Date,
  ): Promise<DashboardLeaveByType[]> {
    const grouped = await this.prisma.leaveRequest.groupBy({
      by: ['leaveType'],
      where: {
        companyId,
        deletedAt: null,
        createdAt: { gte: monthStart, lt: nextMonth },
        status: {
          notIn: [LeaveRequestStatus.DRAFT, LeaveRequestStatus.CANCELLED],
        },
        employee: hrProcessEmployeeWhere({}),
      },
      _count: { _all: true },
    });
    return grouped
      .map((row) => ({ type: row.leaveType as string, count: row._count._all }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
  }

  /** Current month payroll run summary; null when no run exists. */
  private async loadPayrollSummary(
    companyId: string,
    month: number,
    year: number,
  ): Promise<DashboardPayrollStats | null> {
    const run = await this.prisma.payrollRun.findFirst({
      where: { companyId, month, year, deletedAt: null },
      select: { id: true, status: true, totalEmployees: true },
    });
    if (!run) {
      return null;
    }
    const flaggedCount = await this.prisma.payrollEntry.count({
      where: {
        companyId,
        runId: run.id,
        flag: { not: PayrollEntryFlag.NONE },
      },
    });
    return {
      status: mapPayrollStatus(run.status),
      totalEmployees: run.totalEmployees,
      flaggedCount,
    };
  }

  /** Five soonest-ending ACTIVE contracts from today onward. */
  private async loadContractsExpiringSoonList(
    companyId: string,
    today: Date,
    todayStr: string,
  ): Promise<DashboardExpiringContract[]> {
    const contracts = await this.prisma.employeeContract.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: EmployeeContractStatus.ACTIVE,
        endDate: { not: null, gte: today },
        employee: hrProcessEmployeeWhere({}),
      },
      orderBy: { endDate: 'asc' },
      take: EXPIRING_CONTRACTS_LIMIT,
      select: {
        employeeId: true,
        endDate: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });
    const result: DashboardExpiringContract[] = [];
    for (const contract of contracts) {
      if (!contract.endDate) {
        continue;
      }
      const endDate = contract.endDate.toISOString().slice(0, 10);
      result.push({
        employeeId: contract.employeeId,
        employeeName: formatPersonName(contract.employee),
        endDate,
        endsToday: endDate === todayStr,
      });
    }
    return result;
  }

  /** null = company-wide; otherwise explicit employee id list. */
  private resolveScopeIds(
    isHr: boolean,
    isSupervisor: boolean,
    userId: string,
    directReportIds: string[],
  ): string[] | null {
    if (isHr) {
      return null;
    }
    if (isSupervisor) {
      return [...new Set([userId, ...directReportIds])];
    }
    return [userId];
  }

  private async loadDirectReportIds(
    companyId: string,
    userId: string,
  ): Promise<string[]> {
    const reports = await this.prisma.user.findMany({
      where: hrProcessEmployeeWhere({
        companyId,
        deletedAt: null,
        isActive: true,
        reportsToUserId: userId,
      }),
      select: { id: true },
    });
    return reports.map((row) => row.id);
  }

  private async countOnLeaveToday(
    companyId: string,
    today: Date,
    employeeIds: string[] | null,
  ): Promise<number> {
    return this.prisma.leaveRequest.count({
      where: {
        companyId,
        deletedAt: null,
        status: LeaveRequestStatus.APPROVED,
        ...(employeeIds
          ? { employeeId: { in: employeeIds } }
          : { employee: hrProcessEmployeeWhere({}) }),
        periods: {
          some: {
            startDate: { lte: today },
            endDate: { gte: today },
          },
        },
      },
    });
  }

  private async countContractsExpiring(
    companyId: string,
    from: Date,
    to: Date,
  ): Promise<number> {
    return this.prisma.employeeContract.count({
      where: {
        companyId,
        deletedAt: null,
        status: EmployeeContractStatus.ACTIVE,
        endDate: { gte: from, lte: to },
        employee: hrProcessEmployeeWhere({}),
      },
    });
  }

  private async countExpiredUnrenewed(
    companyId: string,
    today: Date,
  ): Promise<number> {
    const expired = await this.prisma.employeeContract.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: EmployeeContractStatus.ACTIVE,
        endDate: { lt: today },
        employee: hrProcessEmployeeWhere({ isActive: true, deletedAt: null }),
      },
      select: { employeeId: true, endDate: true },
    });
    if (expired.length === 0) {
      return 0;
    }
    const employeeIds = [...new Set(expired.map((row) => row.employeeId))];
    const renewals = await this.prisma.employeeContract.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: EmployeeContractStatus.ACTIVE,
        employeeId: { in: employeeIds },
        OR: [{ endDate: null }, { endDate: { gte: today } }],
      },
      select: { employeeId: true },
    });
    const renewed = new Set(renewals.map((row) => row.employeeId));
    return employeeIds.filter((id) => !renewed.has(id)).length;
  }

  private async countLeavePendingMyAction(
    companyId: string,
    userId: string,
  ): Promise<number> {
    const tiers = await this.prisma.approvalTier.findMany({
      where: {
        approverId: userId,
        decision: {
          in: [
            ApprovalTierDecision.PENDING,
            ApprovalTierDecision.CONDITIONALLY_APPROVED,
          ],
        },
        request: {
          companyId,
          deletedAt: null,
          status: { in: OPEN_APPROVAL_STATUSES },
          leaveRequest: { isNot: null },
        },
      },
      select: {
        tierOrder: true,
        request: { select: { currentTier: true } },
      },
    });
    return tiers.filter((tier) => tier.tierOrder === tier.request.currentTier)
      .length;
  }

  private async loadMyPendingApprovals(
    companyId: string,
    userId: string,
  ): Promise<{ total: number; byType: Array<{ type: string; count: number }> }> {
    const tiers = await this.prisma.approvalTier.findMany({
      where: {
        approverId: userId,
        decision: {
          in: [
            ApprovalTierDecision.PENDING,
            ApprovalTierDecision.CONDITIONALLY_APPROVED,
          ],
        },
        request: {
          companyId,
          deletedAt: null,
          status: { in: OPEN_APPROVAL_STATUSES },
        },
      },
      select: {
        tierOrder: true,
        request: {
          select: {
            currentTier: true,
            category: { select: { name: true, code: true } },
          },
        },
      },
    });

    const actionable = tiers.filter(
      (tier) => tier.tierOrder === tier.request.currentTier,
    );
    const counts = new Map<string, number>();
    for (const tier of actionable) {
      const label =
        tier.request.category?.name?.trim() ||
        tier.request.category?.code ||
        'Other';
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    const byType = [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
    return { total: actionable.length, byType };
  }
}

function formatPersonName(person: {
  firstName: string;
  lastName: string;
}): string {
  return `${person.firstName} ${person.lastName}`.trim();
}

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

function mapPayrollStatus(status: PayrollRunStatus): string {
  switch (status) {
    case PayrollRunStatus.DRAFT:
      return 'Draft';
    case PayrollRunStatus.REVIEWED:
    case PayrollRunStatus.SUBMITTED:
      return 'Submitted';
    case PayrollRunStatus.APPROVED:
    case PayrollRunStatus.GM_APPROVED:
      return 'Approved';
    case PayrollRunStatus.PAID:
      return 'Locked';
    default:
      return status;
  }
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function mapAttendanceApprovalStatus(
  status: AttendanceMonthStatus | null,
  imported: boolean,
): AttendanceApprovalStatus {
  if (!imported || status == null) {
    return 'not_started';
  }
  if (status === AttendanceMonthStatus.APPROVED) {
    return 'approved';
  }
  if (
    status === AttendanceMonthStatus.REVIEWED ||
    status === AttendanceMonthStatus.UNLOCKED ||
    status === AttendanceMonthStatus.PENDING_REVIEW
  ) {
    return status === AttendanceMonthStatus.PENDING_REVIEW
      ? 'not_started'
      : 'in_progress';
  }
  return 'not_started';
}
