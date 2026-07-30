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
        title: `Review pending: ${pkg.packageCode} — ${pkg.name}`,
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
  lastName: string;
  email: string | null;
}): string {
  const full = `${user.firstName} ${user.lastName}`.trim();
  return full || user.email || 'Someone';
}
