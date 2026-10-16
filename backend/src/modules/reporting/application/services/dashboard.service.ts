import { Injectable, NotFoundException } from '@nestjs/common';
import {
  DesignPackageStatus,
  DailyLogStatus,
  IssueStatus,
  MeetingStatus,
  Prisma,
  ProjectChangeRequestStatus,
  ProjectStatus,
  PunchItemStatus,
  ReviewSessionStatus,
  RfiStatus,
  RiskStatus,
  SubmittalPurpose,
  SubmittalStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { hrProcessEmployeeWhere } from '../../../../shared/prisma/hr-process.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { subtaskRoleOr } from '../../../project-management/domain/task-access-scope.util';
import {
  CreateDashboardWidgetDto,
  UpdateDashboardWidgetDto,
} from '../dtos/reporting.dtos';

type RequestContext = { companyId: string; userId: string };

export interface PortfolioDashboardStats {
  totalProjects: number;
  activeProjects: number;
  completedProjects: number;
  totalUsers: number;
  openIssues: number;
  openRfis: number;
  overdueRfis: number;
  openRisks: number;
  criticalRisks: number;
  openPunchItems: number;
  overduePunchItems: number;
  overdueIssues: number;
  pendingReviews: number;
  activeCrs: number;
  activeERs: number;
  upcomingMeetings: number;
  openActionItems: number;
  pendingDailyLogs: number;
  issuesByStatus: Record<string, number>;
  rfisByStatus: Record<string, number>;
  risksByStatus: Record<string, number>;
  punchByStatus: Record<string, number>;
  projectsByStatus: Record<string, number>;
}

export interface MyDashboardActivityItem {
  type: string;
  title: string;
  date: string;
  link: string;
}

export interface MyDashboardStats {
  mySubtasks: number;
  myActiveReviews: number;
  myOpenIssues: number;
  myOpenRfis: number;
  myOpenActionItems: number;
  myPendingDailyLogs: number;
  myRisks: number;
  recentActivity: MyDashboardActivityItem[];
}

export interface HrDashboardRecentLeaveRequest {
  id: string;
  requestNumber: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
}

export interface HrDashboardUpcomingTravel {
  id: string;
  type: 'FLIGHT' | 'BUSINESS_TRIP';
  number: string;
  destination: string;
  departureDate: string;
  passengerCount: number;
}

export interface HrDashboardOvertimeRow {
  employeeName: string;
  totalHours: number;
}

export interface HrDashboardTrendRow {
  month: string;
  total: number;
  approved: number;
  rejected: number;
}

export interface HrDashboardModuleRow {
  module: string;
  pending: number;
}

export interface HrDashboardDepartmentRow {
  department: string;
  count: number;
}

export interface HrDashboardStats {
  totalEmployees: number;
  onLeaveThisWeek: number;
  pendingLeaveRequests: number;
  pendingOvertimeSheets: number;
  pendingFlightBookings: number;
  pendingBusinessTripBookings: number;
  approvedFlightsThisMonth: number;
  overtimeSubmissionsThisMonth: number;
  contractsExpiringSoon: number;
  employeesWithoutPolicy: number;
  leaveByType: Record<string, number>;
  leaveRequestsTrend: HrDashboardTrendRow[];
  pendingByModule: HrDashboardModuleRow[];
  headcountByDepartment: HrDashboardDepartmentRow[];
  recentLeaveRequests: HrDashboardRecentLeaveRequest[];
  upcomingTravel: HrDashboardUpcomingTravel[];
  overtimeThisMonth: HrDashboardOvertimeRow[];
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns dashboard widgets visible to the current user's roles.
   */
  async listForUser(ctx: RequestContext): Promise<unknown[]> {
    const roleIds = await this.getUserRoleIds(ctx.userId, ctx.companyId);
    if (roleIds.length === 0) {
      return [];
    }

    return this.prisma.dashboardWidget.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        roleId: { in: roleIds },
      }),
      orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
    });
  }

  async listAll(ctx: RequestContext): Promise<unknown[]> {
    return this.prisma.dashboardWidget.findMany({
      where: activeOnly({ companyId: ctx.companyId }),
      orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
      include: { role: { select: { id: true, name: true } } },
    });
  }

  async create(
    ctx: RequestContext,
    dto: CreateDashboardWidgetDto,
  ): Promise<unknown> {
    await this.assertRole(dto.roleId, ctx.companyId);

    return this.prisma.dashboardWidget.create({
      data: {
        companyId: ctx.companyId,
        roleId: dto.roleId,
        widgetType: dto.widgetType,
        title: dto.title,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        positionX: dto.positionX ?? 0,
        positionY: dto.positionY ?? 0,
        width: dto.width ?? 4,
        height: dto.height ?? 2,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async update(
    ctx: RequestContext,
    id: string,
    dto: UpdateDashboardWidgetDto,
  ): Promise<unknown> {
    await this.findOrThrow(id, ctx.companyId);
    if (dto.roleId) {
      await this.assertRole(dto.roleId, ctx.companyId);
    }

    const { config, ...rest } = dto;
    return this.prisma.dashboardWidget.update({
      where: { id },
      data: {
        ...rest,
        ...(config !== undefined
          ? { config: config as Prisma.InputJsonValue }
          : {}),
        updatedBy: ctx.userId,
      },
    });
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    await this.findOrThrow(id, ctx.companyId);
    await this.prisma.dashboardWidget.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Company-wide PM aggregates for the system dashboard.
   */
  async getPortfolioDashboard(
    ctx: RequestContext,
  ): Promise<PortfolioDashboardStats> {
    const { companyId } = ctx;
    const companyProjects = activeOnly({ companyId });
    const viaProject = {
      deletedAt: null,
      project: companyProjects,
    } as const;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const rfiOpenStatuses: RfiStatus[] = [
      RfiStatus.DRAFT,
      RfiStatus.SUBMITTED,
      RfiStatus.UNDER_REVIEW,
    ];
    const erPurposes: SubmittalPurpose[] = [
      SubmittalPurpose.DISCIPLINE_SITE,
      SubmittalPurpose.DISCIPLINE_CONSULTANT,
    ];

    const [
      totalProjects,
      activeProjects,
      completedProjects,
      totalUsers,
      openIssuesCount,
      inProgressIssues,
      closedIssues,
      openRfis,
      answeredRfis,
      closedRfis,
      overdueRfis,
      openRisks,
      mitigatedRisks,
      acceptedRisks,
      closedRisks,
      criticalRisks,
      raisedPunch,
      assignedPunch,
      correctedPunch,
      verifiedPunch,
      closedPunch,
      overduePunchItems,
      overdueIssues,
      pendingReviews,
      activeCrs,
      activeERs,
      upcomingMeetings,
      openActionItems,
      pendingDailyLogs,
      projectStatusGroups,
    ] = await Promise.all([
      this.prisma.project.count({ where: companyProjects }),
      this.prisma.project.count({
        where: { ...companyProjects, status: ProjectStatus.IN_PROGRESS },
      }),
      this.prisma.project.count({
        where: { ...companyProjects, status: ProjectStatus.COMPLETED },
      }),
      this.prisma.user.count({ where: activeOnly({ companyId }) }),
      this.prisma.issue.count({
        where: { ...viaProject, status: IssueStatus.OPEN },
      }),
      this.prisma.issue.count({
        where: { ...viaProject, status: IssueStatus.IN_PROGRESS },
      }),
      this.prisma.issue.count({
        where: { ...viaProject, status: IssueStatus.CLOSED },
      }),
      this.prisma.rfi.count({
        where: { ...viaProject, status: { in: rfiOpenStatuses } },
      }),
      this.prisma.rfi.count({
        where: { ...viaProject, status: RfiStatus.ANSWERED },
      }),
      this.prisma.rfi.count({
        where: { ...viaProject, status: RfiStatus.CLOSED },
      }),
      this.prisma.rfi.count({
        where: {
          ...viaProject,
          status: { in: rfiOpenStatuses },
          dueDate: { lt: today },
        },
      }),
      this.prisma.risk.count({
        where: { ...viaProject, status: RiskStatus.OPEN },
      }),
      this.prisma.risk.count({
        where: { ...viaProject, status: RiskStatus.MITIGATED },
      }),
      this.prisma.risk.count({
        where: { ...viaProject, status: RiskStatus.ACCEPTED },
      }),
      this.prisma.risk.count({
        where: { ...viaProject, status: RiskStatus.CLOSED },
      }),
      this.prisma.risk.count({
        where: {
          ...viaProject,
          status: { in: [RiskStatus.OPEN, RiskStatus.MITIGATED] },
          riskScore: { gte: 15 },
        },
      }),
      this.prisma.punchItem.count({
        where: { ...viaProject, status: PunchItemStatus.RAISED },
      }),
      this.prisma.punchItem.count({
        where: { ...viaProject, status: PunchItemStatus.ASSIGNED },
      }),
      this.prisma.punchItem.count({
        where: { ...viaProject, status: PunchItemStatus.CORRECTED },
      }),
      this.prisma.punchItem.count({
        where: { ...viaProject, status: PunchItemStatus.VERIFIED },
      }),
      this.prisma.punchItem.count({
        where: { ...viaProject, status: PunchItemStatus.CLOSED },
      }),
      this.prisma.punchItem.count({
        where: {
          ...viaProject,
          status: {
            in: [
              PunchItemStatus.RAISED,
              PunchItemStatus.ASSIGNED,
              PunchItemStatus.CORRECTED,
            ],
          },
          dueDate: { lt: today },
        },
      }),
      this.prisma.issue.count({
        where: {
          ...viaProject,
          status: { in: [IssueStatus.OPEN, IssueStatus.IN_PROGRESS] },
          dueDate: { lt: today },
        },
      }),
      this.prisma.reviewSession.count({
        where: activeOnly({
          companyId,
          status: ReviewSessionStatus.ACTIVE,
        }),
      }),
      this.prisma.projectChangeRequest.count({
        where: {
          ...viaProject,
          status: ProjectChangeRequestStatus.SUBMITTED,
        },
      }),
      this.prisma.submittal.count({
        where: {
          ...viaProject,
          submittalPurpose: { in: erPurposes },
          status: {
            notIn: [SubmittalStatus.SUBMITTED, SubmittalStatus.WITHDRAWN],
          },
        },
      }),
      this.prisma.meeting.count({
        where: {
          ...viaProject,
          status: {
            in: [MeetingStatus.SCHEDULED, MeetingStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.actionItem.count({
        where: {
          deletedAt: null,
          status: 'OPEN',
          meeting: { deletedAt: null, project: companyProjects },
        },
      }),
      this.prisma.dailyLog.count({
        where: {
          ...viaProject,
          status: DailyLogStatus.SUBMITTED,
        },
      }),
      this.prisma.project.groupBy({
        by: ['status'],
        where: companyProjects,
        _count: { _all: true },
      }),
    ]);

    const projectsByStatus: Record<string, number> = {
      NOT_STARTED: 0,
      IN_PROGRESS: 0,
      ON_HOLD: 0,
      COMPLETED: 0,
      CANCELLED: 0,
    };
    for (const group of projectStatusGroups) {
      projectsByStatus[group.status] = group._count._all;
    }

    return {
      totalProjects,
      activeProjects,
      completedProjects,
      totalUsers,
      openIssues: openIssuesCount + inProgressIssues,
      openRfis,
      overdueRfis,
      openRisks,
      criticalRisks,
      openPunchItems:
        raisedPunch + assignedPunch + correctedPunch + verifiedPunch,
      overduePunchItems,
      overdueIssues,
      pendingReviews,
      activeCrs,
      activeERs,
      upcomingMeetings,
      openActionItems,
      pendingDailyLogs,
      issuesByStatus: {
        OPEN: openIssuesCount,
        IN_PROGRESS: inProgressIssues,
        CLOSED: closedIssues,
      },
      rfisByStatus: {
        OPEN: openRfis,
        ANSWERED: answeredRfis,
        CLOSED: closedRfis,
      },
      risksByStatus: {
        OPEN: openRisks,
        MITIGATED: mitigatedRisks,
        ACCEPTED: acceptedRisks,
        CLOSED: closedRisks,
      },
      punchByStatus: {
        RAISED: raisedPunch,
        ASSIGNED: assignedPunch,
        CORRECTED: correctedPunch,
        VERIFIED: verifiedPunch,
        CLOSED: closedPunch,
      },
      projectsByStatus,
    };
  }

  /**
   * HR aggregates: leave, overtime, and travel bookings for the HR home dashboard.
   */
  async getHrDashboard(ctx: RequestContext): Promise<HrDashboardStats> {
    const { companyId } = ctx;
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const next30Days = new Date(now);
    next30Days.setDate(now.getDate() + 30);

    const in90Days = new Date(now);
    in90Days.setDate(now.getDate() + 90);
    in90Days.setHours(23, 59, 59, 999);

    const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    trendStart.setHours(0, 0, 0, 0);

    const [
      totalEmployees,
      onLeaveThisWeek,
      pendingLeaveRequests,
      pendingOvertimeSheets,
      pendingFlightBookings,
      pendingBusinessTripBookings,
      approvedFlightsThisMonth,
      overtimeSubmissionsThisMonth,
      contractsExpiringSoon,
      employeesWithoutPolicy,
      leaveByTypeGroups,
      leaveTrendSource,
      pendingByCategoryGroups,
      headcountGroups,
      recentLeaveRequests,
      upcomingFlights,
      upcomingBusinessTrips,
      overtimeThisMonth,
    ] = await Promise.all([
      this.prisma.user.count({
        where: hrProcessEmployeeWhere({ companyId, deletedAt: null, isActive: true }),
      }),
      this.prisma.leaveRequest.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'APPROVED',
          startDate: { lte: endOfWeek },
          endDate: { gte: startOfWeek },
        },
      }),
      this.prisma.leaveRequest.count({
        where: {
          companyId,
          deletedAt: null,
          status: { in: ['SUBMITTED', 'IN_REVIEW'] },
        },
      }),
      this.prisma.overtimeSheet.count({
        where: {
          companyId,
          deletedAt: null,
          status: { in: ['SUBMITTED', 'IN_REVIEW'] },
        },
      }),
      this.prisma.flightApplication.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'APPROVED',
          combinedTicketDocumentId: null,
        },
      }),
      this.prisma.businessTrip.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'APPROVED',
          combinedTicketDocumentId: null,
        },
      }),
      this.prisma.flightApplication.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'APPROVED',
          departureDate: { gte: startOfMonth, lte: endOfMonth },
        },
      }),
      this.prisma.overtimeSheet.count({
        where: {
          companyId,
          deletedAt: null,
          status: { in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED'] },
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
      }),
      this.prisma.employeeContract.count({
        where: {
          companyId,
          deletedAt: null,
          status: 'ACTIVE',
          endDate: {
            gte: now,
            lte: in90Days,
          },
        },
      }),
      this.prisma.user.count({
        where: hrProcessEmployeeWhere({
          companyId,
          deletedAt: null,
          isActive: true,
          leavePolicyId: null,
        }),
      }),
      this.prisma.leaveRequest.groupBy({
        by: ['leaveType'],
        where: {
          companyId,
          deletedAt: null,
          status: { in: ['SUBMITTED', 'IN_REVIEW', 'APPROVED'] },
          startDate: { gte: trendStart },
        },
        _count: { _all: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          companyId,
          deletedAt: null,
          createdAt: { gte: trendStart },
        },
        select: {
          createdAt: true,
          status: true,
        },
      }),
      this.prisma.approvalRequest.groupBy({
        by: ['categoryId'],
        where: {
          companyId,
          deletedAt: null,
          status: { in: ['SUBMITTED', 'IN_REVIEW'] },
        },
        _count: { id: true },
      }),
      this.prisma.user.groupBy({
        by: ['departmentId'],
        where: hrProcessEmployeeWhere({
          companyId,
          deletedAt: null,
          isActive: true,
          departmentId: { not: null },
        }),
        _count: { id: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: { companyId, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: {
          id: true,
          requestNumber: true,
          leaveType: true,
          startDate: true,
          endDate: true,
          days: true,
          status: true,
          employee: {
            select: { firstName: true, lastName: true, email: true },
          },
          periods: {
            orderBy: { startDate: 'asc' },
            select: { startDate: true, endDate: true, days: true },
          },
        },
      }),
      this.prisma.flightApplication.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: 'APPROVED',
          departureDate: { gte: now, lte: next30Days },
        },
        orderBy: { departureDate: 'asc' },
        take: 5,
        select: {
          id: true,
          applicationNumber: true,
          destination: true,
          departureDate: true,
          _count: { select: { passengers: true } },
        },
      }),
      this.prisma.businessTrip.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: 'APPROVED',
          departureDate: { gte: now, lte: next30Days },
        },
        orderBy: { departureDate: 'asc' },
        take: 5,
        select: {
          id: true,
          tripNumber: true,
          destinationCity: true,
          destinationCountry: true,
          departureDate: true,
          _count: { select: { passengers: true } },
        },
      }),
      this.prisma.overtimeSheet.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: 'APPROVED',
          month: now.getMonth() + 1,
          year: now.getFullYear(),
        },
        orderBy: { totalHours: 'desc' },
        take: 10,
        select: {
          totalHours: true,
          employee: {
            select: { firstName: true, lastName: true, email: true },
          },
        },
      }),
    ]);

    const leaveByType: Record<string, number> = {};
    for (const group of leaveByTypeGroups) {
      leaveByType[group.leaveType] = group._count._all;
    }

    const leaveRequestsTrend = this.buildLeaveRequestsTrend(
      leaveTrendSource,
      now,
    );

    const categoryIds = pendingByCategoryGroups.map((row) => row.categoryId);
    const categories =
      categoryIds.length > 0
        ? await this.prisma.approvalCategory.findMany({
            where: {
              companyId,
              id: { in: categoryIds },
              deletedAt: null,
            },
            select: { id: true, name: true },
          })
        : [];
    const categoryNameById = new Map(
      categories.map((category) => [category.id, category.name]),
    );
    const pendingByModule: HrDashboardModuleRow[] = pendingByCategoryGroups
      .map((row) => ({
        module: categoryNameById.get(row.categoryId) ?? 'Unknown',
        pending: row._count.id,
      }))
      .sort((a, b) => b.pending - a.pending);

    const departmentIds = headcountGroups
      .map((row) => row.departmentId)
      .filter((id): id is string => Boolean(id));
    const departments =
      departmentIds.length > 0
        ? await this.prisma.department.findMany({
            where: {
              companyId,
              id: { in: departmentIds },
              deletedAt: null,
            },
            select: { id: true, name: true },
          })
        : [];
    const departmentNameById = new Map(
      departments.map((department) => [department.id, department.name]),
    );
    const headcountByDepartment: HrDashboardDepartmentRow[] = headcountGroups
      .filter((row) => row.departmentId)
      .map((row) => ({
        department:
          departmentNameById.get(row.departmentId as string) ?? 'Unknown',
        count: row._count.id,
      }))
      .sort((a, b) => b.count - a.count);

    const upcomingTravel: HrDashboardUpcomingTravel[] = [
      ...upcomingFlights.map((flight) => ({
        id: flight.id,
        type: 'FLIGHT' as const,
        number: flight.applicationNumber,
        destination: flight.destination,
        departureDate: flight.departureDate.toISOString(),
        passengerCount: flight._count.passengers,
      })),
      ...upcomingBusinessTrips.map((trip) => ({
        id: trip.id,
        type: 'BUSINESS_TRIP' as const,
        number: trip.tripNumber,
        destination: `${trip.destinationCity}, ${trip.destinationCountry}`,
        departureDate: trip.departureDate.toISOString(),
        passengerCount: trip._count.passengers,
      })),
    ].sort(
      (a, b) =>
        new Date(a.departureDate).getTime() -
        new Date(b.departureDate).getTime(),
    );

    return {
      totalEmployees,
      onLeaveThisWeek,
      pendingLeaveRequests,
      pendingOvertimeSheets,
      pendingFlightBookings: pendingFlightBookings + pendingBusinessTripBookings,
      pendingBusinessTripBookings,
      approvedFlightsThisMonth,
      overtimeSubmissionsThisMonth,
      contractsExpiringSoon,
      employeesWithoutPolicy,
      leaveByType,
      leaveRequestsTrend,
      pendingByModule,
      headcountByDepartment,
      recentLeaveRequests: recentLeaveRequests.map((request) => {
        const firstPeriod = request.periods[0];
        const lastPeriod = request.periods[request.periods.length - 1];
        const startDate = request.startDate ?? firstPeriod?.startDate;
        const endDate = request.endDate ?? lastPeriod?.endDate;
        const days =
          request.days ??
          request.periods.reduce(
            (sum, period) => sum + Number(period.days),
            0,
          );
        return {
          id: request.id,
          requestNumber: request.requestNumber,
          employeeName: formatPersonName(request.employee),
          leaveType: request.leaveType,
          startDate: startDate ? startDate.toISOString() : '',
          endDate: endDate ? endDate.toISOString() : '',
          days: Number(days ?? 0),
          status: request.status,
        };
      }),
      upcomingTravel,
      overtimeThisMonth: overtimeThisMonth.map((sheet) => ({
        employeeName: formatPersonName(sheet.employee),
        totalHours: Number(sheet.totalHours),
      })),
    };
  }

  /**
   * Builds a fixed 6-month leave trend series (oldest → newest).
   */
  private buildLeaveRequestsTrend(
    rows: Array<{ createdAt: Date; status: string }>,
    now: Date,
  ): HrDashboardTrendRow[] {
    const buckets: HrDashboardTrendRow[] = [];
    for (let offset = 5; offset >= 0; offset -= 1) {
      const monthDate = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      buckets.push({
        month: monthDate.toLocaleString('en-US', {
          month: 'short',
          year: 'numeric',
        }),
        total: 0,
        approved: 0,
        rejected: 0,
      });
    }

    const indexByKey = new Map<string, number>();
    for (let index = 0; index < buckets.length; index += 1) {
      const date = new Date(now.getFullYear(), now.getMonth() - (5 - index), 1);
      indexByKey.set(`${date.getFullYear()}-${date.getMonth()}`, index);
    }

    for (const row of rows) {
      const key = `${row.createdAt.getFullYear()}-${row.createdAt.getMonth()}`;
      const index = indexByKey.get(key);
      if (index === undefined) {
        continue;
      }
      buckets[index].total += 1;
      if (row.status === 'APPROVED') {
        buckets[index].approved += 1;
      } else if (row.status === 'REJECTED') {
        buckets[index].rejected += 1;
      }
    }

    return buckets;
  }

  /**
   * FK-scoped dashboard for the authenticated user.
   */
  async getMyDashboard(ctx: RequestContext): Promise<MyDashboardStats> {
    const { companyId, userId } = ctx;
    const companyProjects = activeOnly({ companyId });

    const [
      mySubtasks,
      myActiveReviews,
      myOpenIssues,
      myOpenRfis,
      myOpenActionItems,
      myPendingDailyLogs,
      myRisks,
      recentActivity,
    ] = await Promise.all([
      this.prisma.designPackage.count({
        where: activeOnly({
          companyId,
          OR: subtaskRoleOr(userId),
          packageStatus: { not: DesignPackageStatus.CLOSED },
        }),
      }),
      this.prisma.reviewSession.count({
        where: activeOnly({
          companyId,
          status: ReviewSessionStatus.ACTIVE,
          assignedToUserId: userId,
        }),
      }),
      this.prisma.issue.count({
        where: activeOnly({
          companyId,
          status: { in: [IssueStatus.OPEN, IssueStatus.IN_PROGRESS] },
          OR: [{ assignedTo: userId }, { raisedBy: userId }],
        }),
      }),
      this.prisma.rfi.count({
        where: activeOnly({
          companyId,
          status: {
            in: [
              RfiStatus.DRAFT,
              RfiStatus.SUBMITTED,
              RfiStatus.UNDER_REVIEW,
              RfiStatus.ANSWERED,
            ],
          },
          OR: [{ assignedTo: userId }, { raisedBy: userId }],
        }),
      }),
      this.prisma.actionItem.count({
        where: {
          deletedAt: null,
          status: 'OPEN',
          ownerId: userId,
          meeting: { deletedAt: null, project: companyProjects },
        },
      }),
      this.prisma.dailyLog.count({
        where: activeOnly({
          companyId,
          createdBy: userId,
          status: {
            in: [DailyLogStatus.DRAFT, DailyLogStatus.SUBMITTED],
          },
        }),
      }),
      this.prisma.risk.count({
        where: {
          deletedAt: null,
          ownerId: userId,
          status: {
            in: [RiskStatus.OPEN, RiskStatus.MITIGATED, RiskStatus.ACCEPTED],
          },
          project: companyProjects,
        },
      }),
      this.buildRecentActivity(ctx),
    ]);

    return {
      mySubtasks,
      myActiveReviews,
      myOpenIssues,
      myOpenRfis,
      myOpenActionItems,
      myPendingDailyLogs,
      myRisks,
      recentActivity,
    };
  }

  private async buildRecentActivity(
    ctx: RequestContext,
  ): Promise<MyDashboardActivityItem[]> {
    const { companyId, userId } = ctx;
    const companyProjects = activeOnly({ companyId });
    const take = 10;

    const [notifications, rfiResponses, issueResponses, reviewSessions, actions] =
      await Promise.all([
        this.prisma.notification.findMany({
          where: { companyId, recipientId: userId },
          orderBy: { createdAt: 'desc' },
          take,
          select: {
            subject: true,
            link: true,
            createdAt: true,
          },
        }),
        this.prisma.rfiResponse.findMany({
          where: {
            rfi: activeOnly({
              companyId,
              OR: [{ assignedTo: userId }, { raisedBy: userId }],
            }),
          },
          orderBy: { createdAt: 'desc' },
          take,
          select: {
            createdAt: true,
            responseText: true,
            rfi: { select: { rfiNumber: true, id: true, projectId: true } },
            responder: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        }),
        this.prisma.issueResponse.findMany({
          where: {
            issue: activeOnly({
              companyId,
              OR: [{ assignedTo: userId }, { raisedBy: userId }],
            }),
          },
          orderBy: { createdAt: 'desc' },
          take,
          select: {
            createdAt: true,
            responseText: true,
            issue: {
              select: { issueNumber: true, id: true, projectId: true },
            },
            responder: {
              select: { firstName: true, lastName: true, email: true },
            },
          },
        }),
        this.prisma.reviewSession.findMany({
          where: activeOnly({
            companyId,
            assignedToUserId: userId,
          }),
          orderBy: { updatedAt: 'desc' },
          take,
          select: {
            id: true,
            updatedAt: true,
            status: true,
            designPackage: {
              select: {
                name: true,
                packageCode: true,
                taskDiscipline: {
                  select: { task: { select: { projectId: true } } },
                },
              },
            },
          },
        }),
        this.prisma.actionItem.findMany({
          where: {
            deletedAt: null,
            ownerId: userId,
            meeting: { deletedAt: null, project: companyProjects },
          },
          orderBy: { createdAt: 'desc' },
          take,
          select: {
            id: true,
            title: true,
            description: true,
            createdAt: true,
            meeting: { select: { projectId: true, meetingNumber: true } },
          },
        }),
      ]);

    const activity: MyDashboardActivityItem[] = [];

    for (const row of notifications) {
      activity.push({
        type: 'NOTIFICATION',
        title: row.subject,
        date: row.createdAt.toISOString(),
        link: row.link ?? '/dashboard',
      });
    }

    for (const row of rfiResponses) {
      const name = formatPersonName(row.responder);
      activity.push({
        type: 'RFI_RESPONSE',
        title: `${name} responded to ${row.rfi.rfiNumber}`,
        date: row.createdAt.toISOString(),
        link: `/projects/${row.rfi.projectId}/rfis/${row.rfi.id}`,
      });
    }

    for (const row of issueResponses) {
      const name = formatPersonName(row.responder);
      activity.push({
        type: 'ISSUE_RESPONSE',
        title: `${name} responded to ${row.issue.issueNumber}`,
        date: row.createdAt.toISOString(),
        link: `/projects/${row.issue.projectId}/issues/${row.issue.id}`,
      });
    }

    for (const row of reviewSessions) {
      const pkg = row.designPackage;
      const projectId = pkg.taskDiscipline.task.projectId;
      activity.push({
        type: 'REVIEW_SESSION',
        title: `Review pending: ${pkg.packageCode} - ${pkg.name}`,
        date: row.updatedAt.toISOString(),
        link: `/projects/${projectId}/review-inbox`,
      });
    }

    for (const row of actions) {
      activity.push({
        type: 'ACTION_ITEM',
        title:
          row.title?.trim() ||
          row.description.slice(0, 80) ||
          `Action from ${row.meeting.meetingNumber}`,
        date: row.createdAt.toISOString(),
        link: `/projects/${row.meeting.projectId}/meetings`,
      });
    }

    return activity
      .sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      )
      .slice(0, take);
  }

  private async getUserRoleIds(
    userId: string,
    companyId: string,
  ): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: activeOnly({ userId }),
      include: { role: true },
    });

    return userRoles
      .filter((ur) => ur.role.companyId === companyId && ur.role.isActive)
      .map((ur) => ur.roleId);
  }

  private async assertRole(roleId: string, companyId: string): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: activeOnly({ id: roleId, companyId }),
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
  }

  private async findOrThrow(id: string, companyId: string): Promise<void> {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!widget) {
      throw new NotFoundException('Dashboard widget not found');
    }
  }
}

function formatPersonName(user: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  chineseName?: string | null;
  email: string | null;
}): string {
  const full = formatUserDisplayName(user);
  return full === 'Unknown user' ? user.email || 'Someone' : full;
}
