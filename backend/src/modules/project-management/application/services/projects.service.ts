import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CorrespondenceStatus,
  DailyLogStatus,
  DesignPackageProjectedStatus,
  IssueStatus,
  MeetingStatus,
  Prisma,
  ProjectChangeRequestStatus,
  PunchItemStatus,
  RfiStatus,
  RiskStatus,
  SubmittalPurpose,
  SubmittalStatus,
  DeliverableStatus,
  Task,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import {
  buildOrderBy,
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  SetProjectTeamDto,
  CreateProjectDto,
  ProjectListQueryDto,
  UpdateProjectDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapProject,
  mapProjectTeamMember,
  MappedProject,
  MappedProjectDashboardStats,
  MappedProjectTeamMember,
  parseOptionalDate,
  parseOptionalDecimal,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import {
  resolveProjectProgressPct,
} from '../utils/project-progress.util';
import { enrichRowsWithUserDisplayNames, enrichWithUserDisplayNames } from '../utils/pm-user-names.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import { normalizeProjectClientInput } from '@/shared/project-client-presets';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { DisciplineScopeService } from './discipline-scope.service';
import { ProjectScopeService } from './project-scope.service';
import { TaskAccessScopeService } from './task-access-scope.service';

import {
  PROJECT_STATUS_TRANSITIONS,
  type ProjectStatus,
} from '@/shared/project-status';

const PROJECT_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'nameZh',
  'projectCode',
  'status',
  'startDate',
  'plannedFinishDate',
]);

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly taskAccessScopeService: TaskAccessScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
  ) {}

  /**
   * Returns a paginated list of projects for the caller's company.
   */
  async listProjects(
    ctx: PmContext,
    query: ProjectListQueryDto,
  ): Promise<PaginatedResult<MappedProject>> {
    const where = await this.buildProjectListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      PROJECT_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip,
        take,
        orderBy,
      }),
      this.prisma.project.count({ where }),
    ]);

    const taskProgressByProjectId = await this.loadTaskProgressByProjectId(
      rows.map((row) => row.id),
    );

    const mapped = rows.map((row) =>
      this.mapProjectWithTaskProgress(row, taskProgressByProjectId),
    );

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapped,
      [['responsiblePersonId', 'responsiblePersonName']],
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Returns a single project by id scoped to the caller's company.
   */
  async getProject(ctx: PmContext, id: string): Promise<MappedProject> {
    const project = await this.projectScopeService.getProjectOrThrow(ctx, id);

    await this.engineeringDocumentFolderService.ensureProjectFolder(
      ctx,
      project.id,
      project.projectCode,
      project.name,
    );

    const taskProgressByProjectId = await this.loadTaskProgressByProjectId([
      project.id,
    ]);

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      this.mapProjectWithTaskProgress(project, taskProgressByProjectId),
      [['responsiblePersonId', 'responsiblePersonName']],
    );
  }

  /**
   * Creates a new project for the caller's company.
   */
  async createProject(
    ctx: PmContext,
    dto: CreateProjectDto,
  ): Promise<MappedProject> {
    await this.assertProjectCodeAvailable(ctx, dto.projectCode);

    const responsiblePersonId = dto.responsiblePersonId ?? ctx.userId;

    if (responsiblePersonId !== ctx.userId) {
      await this.assertUserInCompany(ctx, responsiblePersonId);
    }

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          companyId: ctx.companyId,
          projectCode: dto.projectCode,
          name: dto.name,
          nameZh: dto.nameZh,
          clientCompanyId: dto.clientCompanyId,
          branchId: dto.branchId,
          location: dto.location,
          projectType: dto.projectType,
          railwayLengthKm: dto.railwayLengthKm,
          urbanRailLengthKm: dto.urbanRailLengthKm,
          roadLengthKm: dto.roadLengthKm,
          grossFloorAreaM2: dto.grossFloorAreaM2,
          contractType: dto.contractType,
          status: dto.status,
          startDate: parseOptionalDate(dto.startDate),
          plannedFinishDate: parseOptionalDate(dto.plannedFinishDate),
          budget: parseOptionalDecimal(dto.budget),
          currency: dto.currency,
          client: normalizeProjectClientInput(dto.client) ?? null,
          responsibleDepartment: dto.responsibleDepartment,
          designProperties: dto.designProperties,
          designStage: dto.designStage,
          responsiblePersonId,
          description: dto.description,
          overallProgressPct: dto.overallProgressPct ?? 0,
          isOutsourced: dto.isOutsourced ?? false,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      await this.ensureActiveTeamMember(tx, created.id, ctx.userId, ctx.userId);
      if (responsiblePersonId !== ctx.userId) {
        await this.ensureActiveTeamMember(
          tx,
          created.id,
          responsiblePersonId,
          ctx.userId,
        );
      }

      return created;
    });

    await this.engineeringDocumentFolderService.ensureProjectFolder(
      ctx,
      project.id,
      project.projectCode,
      project.name,
    );

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapProject(project),
      [['responsiblePersonId', 'responsiblePersonName']],
    );
  }

  /**
   * Updates an existing project scoped to the caller's company.
   */
  async updateProject(
    ctx: PmContext,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<MappedProject> {
    await this.projectScopeService.getProjectOrThrow(ctx, id);

    if (dto.projectCode) {
      await this.assertProjectCodeAvailable(ctx, dto.projectCode, id);
    }

    if (dto.responsiblePersonId) {
      await this.assertUserInCompany(ctx, dto.responsiblePersonId);
    }

    if (dto.status !== undefined) {
      const current = await this.prisma.project.findFirst({
        where: activeOnly({ id, companyId: ctx.companyId }),
        select: { status: true },
      });
      if (current && dto.status !== current.status) {
        const currentStatus = current.status as ProjectStatus;
        const allowed = PROJECT_STATUS_TRANSITIONS[currentStatus] ?? [];
        if (!allowed.includes(dto.status as ProjectStatus)) {
          throw new BadRequestException(
            `Invalid project status transition from ${current.status} to ${dto.status}.`,
          );
        }
      }

      if (dto.status === 'COMPLETED') {
        const [
          openTasks,
          openIssues,
          openRfis,
          openPunchItems,
          openDeliverables,
        ] = await Promise.all([
          this.prisma.task.count({
            where: activeOnly({
              projectId: id,
              status: { not: TaskStatus.COMPLETED },
            }),
          }),
          this.prisma.issue.count({
            where: activeOnly({
              projectId: id,
              status: {
                not: IssueStatus.CLOSED,
              },
            }),
          }),
          this.prisma.rfi.count({
            where: activeOnly({
              projectId: id,
              status: { not: RfiStatus.CLOSED },
            }),
          }),
          this.prisma.punchItem.count({
            where: activeOnly({
              projectId: id,
              status: {
                notIn: [PunchItemStatus.VERIFIED, PunchItemStatus.CLOSED],
              },
            }),
          }),
          this.prisma.deliverable.count({
            where: activeOnly({
              projectId: id,
              status: {
                notIn: [DeliverableStatus.APPROVED, DeliverableStatus.WAIVED],
              },
            }),
          }),
        ]);

        if (
          openTasks > 0 ||
          openIssues > 0 ||
          openRfis > 0 ||
          openPunchItems > 0 ||
          openDeliverables > 0
        ) {
          throw new BadRequestException(
            `Project cannot be completed: ${openTasks} tasks, ${openIssues} issues, ${openRfis} RFIs, ${openPunchItems} punch items, ${openDeliverables} deliverables still open.`,
          );
        }
      }
    }

    const project = await this.prisma.project.update({
      where: { id },
      data: {
        projectCode: dto.projectCode,
        name: dto.name,
        nameZh: dto.nameZh,
        clientCompanyId: dto.clientCompanyId,
        branchId: dto.branchId,
        location: dto.location,
        projectType: dto.projectType,
        railwayLengthKm: dto.railwayLengthKm,
        urbanRailLengthKm: dto.urbanRailLengthKm,
        roadLengthKm: dto.roadLengthKm,
        grossFloorAreaM2: dto.grossFloorAreaM2,
        contractType: dto.contractType,
        status: dto.status,
        startDate: parseOptionalDate(dto.startDate),
        plannedFinishDate: parseOptionalDate(dto.plannedFinishDate),
        actualFinishDate: parseOptionalDate(dto.actualFinishDate),
        budget: parseOptionalDecimal(dto.budget),
        currency: dto.currency,
        client:
          dto.client !== undefined
            ? (normalizeProjectClientInput(dto.client ?? undefined) ?? null)
            : undefined,
        responsibleDepartment: dto.responsibleDepartment,
        designProperties: dto.designProperties,
        designStage: dto.designStage,
        responsiblePersonId: dto.responsiblePersonId,
        description: dto.description,
        overallProgressPct: dto.overallProgressPct,
        isOutsourced: dto.isOutsourced,
        updatedBy: ctx.userId,
      },
    });

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapProject(project),
      [['responsiblePersonId', 'responsiblePersonName']],
    );
  }

  /**
   * Soft-deletes a project scoped to the caller's company.
   */
  async deleteProject(ctx: PmContext, id: string): Promise<void> {
    await this.projectScopeService.getProjectOrThrow(ctx, id);
    await this.prisma.project.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns dashboard KPI counts and schedule metrics for a project.
   */
  async getDashboardStats(
    ctx: PmContext,
    projectId: string,
  ): Promise<MappedProjectDashboardStats> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const projectWhere = activeOnly({ projectId });
    const rfiOpenStatuses: RfiStatus[] = [
      RfiStatus.DRAFT,
      RfiStatus.SUBMITTED,
      RfiStatus.UNDER_REVIEW,
    ];
    const punchOpenStatuses: PunchItemStatus[] = [
      PunchItemStatus.RAISED,
      PunchItemStatus.ASSIGNED,
      PunchItemStatus.CORRECTED,
    ];
    const erPurposes: SubmittalPurpose[] = [
      SubmittalPurpose.DISCIPLINE_SITE,
      SubmittalPurpose.DISCIPLINE_CONSULTANT,
    ];

    const [
      openIssues,
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
      draftCrs,
      submittedCrs,
      approvedCrs,
      rejectedCrs,
      draftLogs,
      submittedLogs,
      approvedLogs,
      upcomingMeetings,
      completedMeetings,
      openActions,
      draftCorr,
      sentCorr,
      acknowledgedCorr,
      activeSubmittals,
      approvedSubmittals,
      activeERs,
      issuedERs,
      subtaskStatusGroups,
      overdueIssues,
      overduePunch,
      tasks,
    ] = await Promise.all([
      this.prisma.issue.count({
        where: { ...projectWhere, status: IssueStatus.OPEN },
      }),
      this.prisma.issue.count({
        where: { ...projectWhere, status: IssueStatus.IN_PROGRESS },
      }),
      this.prisma.issue.count({
        where: { ...projectWhere, status: IssueStatus.CLOSED },
      }),
      this.prisma.rfi.count({
        where: { ...projectWhere, status: { in: rfiOpenStatuses } },
      }),
      this.prisma.rfi.count({
        where: { ...projectWhere, status: RfiStatus.ANSWERED },
      }),
      this.prisma.rfi.count({
        where: { ...projectWhere, status: RfiStatus.CLOSED },
      }),
      this.prisma.rfi.count({
        where: {
          ...projectWhere,
          status: { in: rfiOpenStatuses },
          dueDate: { lt: today },
        },
      }),
      this.prisma.risk.count({
        where: { ...projectWhere, status: RiskStatus.OPEN },
      }),
      this.prisma.risk.count({
        where: { ...projectWhere, status: RiskStatus.MITIGATED },
      }),
      this.prisma.risk.count({
        where: { ...projectWhere, status: RiskStatus.ACCEPTED },
      }),
      this.prisma.risk.count({
        where: { ...projectWhere, status: RiskStatus.CLOSED },
      }),
      this.prisma.risk.count({
        where: {
          ...projectWhere,
          status: { in: [RiskStatus.OPEN, RiskStatus.MITIGATED] },
          riskScore: { gte: 15 },
        },
      }),
      this.prisma.punchItem.count({
        where: { ...projectWhere, status: PunchItemStatus.RAISED },
      }),
      this.prisma.punchItem.count({
        where: { ...projectWhere, status: PunchItemStatus.ASSIGNED },
      }),
      this.prisma.punchItem.count({
        where: { ...projectWhere, status: PunchItemStatus.CORRECTED },
      }),
      this.prisma.punchItem.count({
        where: { ...projectWhere, status: PunchItemStatus.VERIFIED },
      }),
      this.prisma.punchItem.count({
        where: { ...projectWhere, status: PunchItemStatus.CLOSED },
      }),
      this.prisma.projectChangeRequest.count({
        where: {
          ...projectWhere,
          status: ProjectChangeRequestStatus.DRAFT,
        },
      }),
      this.prisma.projectChangeRequest.count({
        where: {
          ...projectWhere,
          status: ProjectChangeRequestStatus.SUBMITTED,
        },
      }),
      this.prisma.projectChangeRequest.count({
        where: {
          ...projectWhere,
          status: ProjectChangeRequestStatus.APPROVED,
        },
      }),
      this.prisma.projectChangeRequest.count({
        where: {
          ...projectWhere,
          status: ProjectChangeRequestStatus.REJECTED,
        },
      }),
      this.prisma.dailyLog.count({
        where: { ...projectWhere, status: DailyLogStatus.DRAFT },
      }),
      this.prisma.dailyLog.count({
        where: { ...projectWhere, status: DailyLogStatus.SUBMITTED },
      }),
      this.prisma.dailyLog.count({
        where: { ...projectWhere, status: DailyLogStatus.APPROVED },
      }),
      this.prisma.meeting.count({
        where: {
          ...projectWhere,
          status: {
            in: [MeetingStatus.SCHEDULED, MeetingStatus.IN_PROGRESS],
          },
        },
      }),
      this.prisma.meeting.count({
        where: { ...projectWhere, status: MeetingStatus.COMPLETED },
      }),
      this.prisma.actionItem.count({
        where: {
          deletedAt: null,
          status: 'OPEN',
          meeting: { projectId, deletedAt: null },
        },
      }),
      this.prisma.correspondence.count({
        where: { ...projectWhere, status: CorrespondenceStatus.DRAFT },
      }),
      this.prisma.correspondence.count({
        where: { ...projectWhere, status: CorrespondenceStatus.SENT },
      }),
      this.prisma.correspondence.count({
        where: {
          ...projectWhere,
          status: CorrespondenceStatus.ACKNOWLEDGED,
        },
      }),
      this.prisma.submittal.count({
        where: {
          ...projectWhere,
          submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION,
          status: {
            in: [
              SubmittalStatus.DRAFT,
              SubmittalStatus.SUBMITTED,
              SubmittalStatus.UNDER_REVIEW,
            ],
          },
        },
      }),
      this.prisma.submittal.count({
        where: {
          ...projectWhere,
          submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION,
          status: {
            in: [
              SubmittalStatus.APPROVED,
              SubmittalStatus.APPROVED_WITH_COMMENTS,
            ],
          },
        },
      }),
      this.prisma.submittal.count({
        where: {
          ...projectWhere,
          submittalPurpose: { in: erPurposes },
          status: {
            notIn: [SubmittalStatus.SUBMITTED, SubmittalStatus.WITHDRAWN],
          },
        },
      }),
      this.prisma.submittal.count({
        where: {
          ...projectWhere,
          submittalPurpose: { in: erPurposes },
          status: SubmittalStatus.SUBMITTED,
        },
      }),
      this.prisma.designPackage.groupBy({
        by: ['projectedStatus'],
        where: activeOnly({
          taskDiscipline: {
            deletedAt: null,
            task: { projectId, deletedAt: null },
          },
        }),
        _count: { _all: true },
      }),
      this.prisma.issue.count({
        where: {
          ...projectWhere,
          status: { in: [IssueStatus.OPEN, IssueStatus.IN_PROGRESS] },
          dueDate: { lt: today },
        },
      }),
      this.prisma.punchItem.count({
        where: {
          ...projectWhere,
          status: { in: punchOpenStatuses },
          dueDate: { lt: today },
        },
      }),
      this.prisma.task.findMany({
        where: activeOnly({ projectId }),
      }),
    ]);

    const subtasksByStatus: Record<string, number> = {};
    for (const status of Object.values(DesignPackageProjectedStatus)) {
      subtasksByStatus[status] = 0;
    }
    for (const group of subtaskStatusGroups) {
      subtasksByStatus[group.projectedStatus] = group._count._all;
    }

    const taskProgressById = await this.computeTaskProgressMap(
      tasks.map((task) => task.id),
    );
    const scheduleMetrics = this.computeScheduleMetrics(tasks, taskProgressById);

    return {
      openRfis,
      overdueRfis,
      openIssues,
      openPunchItems:
        raisedPunch + assignedPunch + correctedPunch + verifiedPunch,
      ...scheduleMetrics,
      inProgressIssues,
      closedIssues,
      answeredRfis,
      closedRfis,
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
      draftCrs,
      submittedCrs,
      approvedCrs,
      rejectedCrs,
      draftLogs,
      submittedLogs,
      approvedLogs,
      upcomingMeetings,
      completedMeetings,
      openActions,
      draftCorr,
      sentCorr,
      acknowledgedCorr,
      activeSubmittals,
      approvedSubmittals,
      activeERs,
      issuedERs,
      subtasksByStatus,
      overdueIssues,
      overduePunch,
    };
  }

  /**
   * Returns active company users for role assignment pickers on a readable project.
   */
  async listAssignableUsers(
    ctx: PmContext,
    projectId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    await this.taskAccessScopeService.assertProjectReadable(ctx, projectId);

    const where = activeOnly({ companyId: ctx.companyId });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: this.assignableUserSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Returns active team members assigned to a project.
   */
  async listTeam(
    ctx: PmContext,
    projectId: string,
  ): Promise<MappedProjectTeamMember[]> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const members = await this.prisma.projectTeam.findMany({
      where: activeOnly({ projectId }),
      orderBy: { createdAt: 'asc' },
    });

    const seenUserIds = new Set<string>();
    const uniqueMembers = members.filter((member) => {
      if (seenUserIds.has(member.userId)) {
        return false;
      }
      seenUserIds.add(member.userId);
      return true;
    });

    const userIds = uniqueMembers.map((member) => member.userId);
    const users = userIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: userIds }, companyId: ctx.companyId },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        })
      : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    return uniqueMembers.map((member) => {
      const user = userById.get(member.userId);
      return {
        ...mapProjectTeamMember(member),
        userName: user ? formatUserDisplayName(user) : null,
        userEmail: user?.email ?? null,
      };
    });
  }

  /**
   * Replaces the project team with the given user ids.
   */
  async setTeam(
    ctx: PmContext,
    projectId: string,
    dto: SetProjectTeamDto,
  ): Promise<MappedProjectTeamMember[]> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const resolvedMembers = this.resolveSetTeamMembers(dto);
    const uniqueUserIds = [...new Set(resolvedMembers.map((member) => member.userId))];
    for (const userId of uniqueUserIds) {
      await this.assertUserInCompany(ctx, userId);
    }

    const visibleModulesByUserId = new Map(
      resolvedMembers.map((member) => [member.userId, member.visibleModules]),
    );

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectTeam.findMany({
        where: { projectId },
      });
      const desired = new Set(uniqueUserIds);
      const rowsByUserId = new Map<string, typeof existing>();

      for (const row of existing) {
        const rows = rowsByUserId.get(row.userId) ?? [];
        rows.push(row);
        rowsByUserId.set(row.userId, rows);
      }

      for (const [userId, rows] of rowsByUserId) {
        const activeRows = rows.filter((row) => row.deletedAt === null);
        const inactiveRows = rows.filter((row) => row.deletedAt !== null);
        const shouldBeActive = desired.has(userId);
        const visibleModules = visibleModulesByUserId.get(userId) ?? [];

        if (shouldBeActive) {
          if (activeRows.length > 0) {
            await tx.projectTeam.update({
              where: { id: activeRows[0].id },
              data: {
                visibleModules,
                updatedBy: ctx.userId,
              },
            });
            for (let index = 1; index < activeRows.length; index += 1) {
              await tx.projectTeam.update({
                where: { id: activeRows[index].id },
                data: { deletedAt: new Date(), deletedBy: ctx.userId },
              });
            }
          } else if (inactiveRows.length > 0) {
            await tx.projectTeam.update({
              where: { id: inactiveRows[0].id },
              data: {
                deletedAt: null,
                deletedBy: null,
                visibleModules,
                updatedBy: ctx.userId,
              },
            });
          }
          continue;
        }

        for (const row of activeRows) {
          await tx.projectTeam.update({
            where: { id: row.id },
            data: { deletedAt: new Date(), deletedBy: ctx.userId },
          });
        }
      }

      for (const userId of uniqueUserIds) {
        if (!rowsByUserId.has(userId)) {
          try {
            await tx.projectTeam.create({
              data: {
                projectId,
                userId,
                visibleModules: visibleModulesByUserId.get(userId) ?? [],
                createdBy: ctx.userId,
                updatedBy: ctx.userId,
              },
            });
          } catch (error: unknown) {
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === 'P2002'
            ) {
              throw new ConflictException(
                'User is already a member of this project.',
              );
            }
            throw error;
          }
        }
      }
    });

    return this.listTeam(ctx, projectId);
  }

  private resolveSetTeamMembers(
    dto: SetProjectTeamDto,
  ): Array<{ userId: string; visibleModules: string[] }> {
    if (dto.members && dto.members.length > 0) {
      return dto.members.map((member) => ({
        userId: member.userId,
        visibleModules: member.visibleModules ?? [],
      }));
    }

    if (dto.userIds && dto.userIds.length > 0) {
      return dto.userIds.map((userId) => ({
        userId,
        visibleModules: [],
      }));
    }

    throw new BadRequestException('Provide userIds or members for the project team.');
  }

  /**
   * Returns whether a user is an active member of the project team.
   */
  async isUserOnProjectTeam(projectId: string, userId: string): Promise<boolean> {
    const member = await this.prisma.projectTeam.findFirst({
      where: activeOnly({ projectId, userId }),
      select: { id: true },
    });
    return member !== null;
  }

  private async buildProjectListWhere(
    ctx: PmContext,
    query: ProjectListQueryDto,
  ): Promise<Prisma.ProjectWhereInput> {
    const filters: Prisma.ProjectWhereInput = {};

    const statusFilter = parseStatusFilter<ProjectStatus>(query.status);
    if (statusFilter) {
      filters.status = statusFilter;
    }
    if (query.projectType) {
      filters.projectType = query.projectType;
    }
    if (query.responsiblePersonId) {
      filters.responsiblePersonId = query.responsiblePersonId;
    }
    if (query.responsibleDepartment) {
      filters.responsibleDepartment = query.responsibleDepartment;
    }
    if (query.designProperties) {
      filters.designProperties = query.designProperties;
    }
    if (query.designStage) {
      filters.designStage = query.designStage;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      filters.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { nameZh: { contains: term, mode: 'insensitive' } },
        { projectCode: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
      ];
    }

    return this.taskAccessScopeService.buildProjectListWhere(
      ctx,
      activeOnly({
        companyId: ctx.companyId,
        ...filters,
      }),
    );
  }

  private async assertProjectCodeAvailable(
    ctx: PmContext,
    projectCode: string,
    excludeId?: string,
  ): Promise<void> {
    const existing = await this.prisma.project.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        projectCode,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      }),
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Project code already exists');
    }
  }

  private async assertUserInCompany(
    ctx: PmContext,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private async ensureActiveTeamMember(
    tx: Prisma.TransactionClient,
    projectId: string,
    userId: string,
    actorId: string,
  ): Promise<void> {
    const existing = await tx.projectTeam.findFirst({
      where: { projectId, userId },
    });

    if (existing?.deletedAt === null) {
      return;
    }

    if (existing) {
      await tx.projectTeam.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          deletedBy: null,
          updatedBy: actorId,
        },
      });
      return;
    }

    await tx.projectTeam.create({
      data: {
        projectId,
        userId,
        visibleModules: [],
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  private async loadTaskProgressByProjectId(
    projectIds: readonly string[],
  ): Promise<Map<string, number>> {
    const progressByProjectId = new Map<string, number>();
    if (projectIds.length === 0) {
      return progressByProjectId;
    }

    const tasks = await this.prisma.task.findMany({
      where: activeOnly({ projectId: { in: [...projectIds] } }),
      select: { id: true, projectId: true },
    });

    const taskProgressById = await this.computeTaskProgressMap(
      tasks.map((task) => task.id),
    );

    const valuesByProjectId = new Map<string, number[]>();
    for (const task of tasks) {
      const progress = taskProgressById.get(task.id);
      if (progress == null) {
        continue;
      }
      const values = valuesByProjectId.get(task.projectId) ?? [];
      values.push(progress);
      valuesByProjectId.set(task.projectId, values);
    }

    for (const [projectId, values] of valuesByProjectId) {
      progressByProjectId.set(
        projectId,
        this.clampPercent(values.reduce((sum, value) => sum + value, 0) / values.length),
      );
    }

    return progressByProjectId;
  }

  private mapProjectWithTaskProgress(
    project: Parameters<typeof mapProject>[0],
    taskProgressByProjectId: ReadonlyMap<string, number>,
  ): MappedProject {
    const mapped = mapProject(project);
    return {
      ...mapped,
      overallProgressPct: resolveProjectProgressPct(
        mapped.overallProgressPct,
        taskProgressByProjectId.get(project.id),
      ),
    };
  }

  private computeScheduleMetrics(
    tasks: Task[],
    taskProgressById: ReadonlyMap<string, number>,
  ): {
    scheduleVariancePct: number | null;
    plannedProgressPct: number | null;
    actualProgressPct: number | null;
  } {
    if (tasks.length === 0) {
      return {
        scheduleVariancePct: null,
        plannedProgressPct: null,
        actualProgressPct: null,
      };
    }

    const today = new Date();
    const progressValues = tasks
      .map((task) => taskProgressById.get(task.id))
      .filter((value): value is number => value != null);
    const actualProgressPct =
      progressValues.length > 0
        ? this.clampPercent(
            progressValues.reduce((sum, value) => sum + value, 0) /
              progressValues.length,
          )
        : null;

    const plannedValues = tasks
      .map((task) => this.computePlannedProgress(task, today))
      .filter((value): value is number => value !== null);

    const plannedProgressPct =
      plannedValues.length > 0
        ? this.clampPercent(
            plannedValues.reduce((sum, value) => sum + value, 0) /
              plannedValues.length,
          )
        : null;

    const scheduleVariancePct =
      plannedProgressPct !== null && actualProgressPct !== null
        ? actualProgressPct - plannedProgressPct
        : null;

    return {
      scheduleVariancePct,
      plannedProgressPct,
      actualProgressPct,
    };
  }

  /**
   * Per-task progress derived from subtask (design package) completion:
   * closed packages / total packages, rounded. Tasks with no subtasks are
   * omitted (no computable progress) rather than defaulting to 0.
   */
  private async computeTaskProgressMap(
    taskIds: readonly string[],
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (taskIds.length === 0) {
      return result;
    }

    const disciplines = await this.prisma.taskDiscipline.findMany({
      where: activeOnly({ taskId: { in: [...taskIds] } }),
      select: {
        taskId: true,
        designPackages: {
          where: activeOnly({}),
          select: { packageStatus: true },
        },
      },
    });

    const totals = new Map<string, { closed: number; total: number }>();
    for (const discipline of disciplines) {
      const entry = totals.get(discipline.taskId) ?? { closed: 0, total: 0 };
      entry.total += discipline.designPackages.length;
      entry.closed += discipline.designPackages.filter(
        (pkg) => pkg.packageStatus === 'CLOSED',
      ).length;
      totals.set(discipline.taskId, entry);
    }

    for (const [taskId, { closed, total }] of totals) {
      if (total > 0) {
        result.set(taskId, this.clampPercent((closed / total) * 100));
      }
    }

    return result;
  }

  private computePlannedProgress(task: Task, today: Date): number | null {
    const start = task.startDate;
    const finish = task.finishDate;
    if (!start || !finish) {
      return null;
    }
    if (today <= start) {
      return 0;
    }
    if (today >= finish) {
      return 100;
    }
    const total = finish.getTime() - start.getTime();
    if (total <= 0) {
      return 100;
    }
    return this.clampPercent(
      ((today.getTime() - start.getTime()) / total) * 100,
    );
  }

  private clampPercent(value: number): number {
    return Math.max(0, Math.min(100, Math.round(value)));
  }

  private assignableUserSelect(): Prisma.UserSelect {
    return {
      id: true,
      firstName: true,
      lastName: true,
      chineseName: true,
      email: true,
      discipline: true,
      engineeringDisciplineId: true,
      engineeringDiscipline: { select: { id: true, name: true, nameZh: true } },
      isActive: true,
      userRoles: {
        where: activeOnly({}),
        select: {
          id: true,
          roleId: true,
          role: { select: { id: true, name: true } },
        },
      },
    };
  }
}
