import { Injectable } from '@nestjs/common';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  AttendanceMonthStatus,
  LeaveRequestStatus,
  LeaveType,
  OvertimeSheetStatus,
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
      personal: !isHr,
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

      this.loadMyPendingApprovals(companyId, userId),

      visibility.personal
        ? this.prisma.overtimeSheet.aggregate({
            where: {
              companyId,
              deletedAt: null,
              employeeId: userId,
              month,
              year,
              status: { in: OT_COUNTED_STATUSES },
            },
            _sum: { totalHours: true },
          })
        : Promise.resolve({ _sum: { totalHours: null } }),
      visibility.personal
        ? this.prisma.leaveBalance.findFirst({
            where: {
              companyId,
              employeeId: userId,
              year,
              leaveType: LeaveType.ANNUAL,
            },
            select: { remaining: true },
          })
        : Promise.resolve(null),
      visibility.personal
        ? this.prisma.approvalRequest.count({
            where: {
              companyId,
              deletedAt: null,
              requestedBy: userId,
              status: { in: OPEN_APPROVAL_STATUSES },
            },
          })
        : Promise.resolve(0),
      visibility.personal
        ? this.prisma.siteAssignment.findFirst({
            where: {
              companyId,
              deletedAt: null,
              employeeId: userId,
              status: SiteAssignmentStatus.APPROVED,
              endDate: { gte: today },
            },
            orderBy: { startDate: 'asc' },
            select: { siteName: true, startDate: true, endDate: true },
          })
        : Promise.resolve(null),
    ]);

    const approvalStatus = mapAttendanceApprovalStatus(
      attendanceBatch ? (attendanceApproval?.status ?? null) : null,
      Boolean(attendanceBatch),
    );
    const submittedCount = attendanceSubmitted;
    const approvedCount =
      approvalStatus === 'approved' ? submittedCount : 0;

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
      personal: visibility.personal
        ? {
            myOtHoursThisMonth: Number(personalOt._sum.totalHours ?? 0),
            myLeaveBalanceDays:
              personalLeaveBalance?.remaining != null
                ? Number(personalLeaveBalance.remaining)
                : null,
            myPendingRequestCount: personalPendingRequests,
            upcomingSiteAssignment: upcomingSite
              ? {
                  siteName: upcomingSite.siteName,
                  startDate: upcomingSite.startDate.toISOString().slice(0, 10),
                  endDate: upcomingSite.endDate.toISOString().slice(0, 10),
                }
              : null,
          }
        : null,
    };
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
