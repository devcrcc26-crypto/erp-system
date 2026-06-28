import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  RfiStatus,
  IssueStatus,
  PunchItemStatus,
  DeliverableStatus,
  Task,
  TaskStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
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
import { enrichRowsWithUserDisplayNames, enrichWithUserDisplayNames } from '../utils/pm-user-names.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { DisciplineScopeService } from './discipline-scope.service';
import { ProjectScopeService } from './project-scope.service';

const PROJECT_STATUS_TRANSITIONS: Record<string, string[]> = {
  PLANNING: ['TENDER', 'ON_HOLD'],
  TENDER: ['MOBILIZATION', 'PLANNING', 'ON_HOLD'],
  MOBILIZATION: ['ACTIVE', 'ON_HOLD', 'TENDER'],
  ACTIVE: ['ON_HOLD', 'COMPLETED'],
  ON_HOLD: ['PLANNING', 'TENDER', 'MOBILIZATION', 'ACTIVE'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
};

const PROJECT_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
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

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map(mapProject),
      [['projectManagerId', 'projectManagerName']],
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

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapProject(project),
      [['projectManagerId', 'projectManagerName']],
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

    const projectManagerId = dto.projectManagerId ?? ctx.userId;

    if (dto.responsiblePersonId) {
      await this.assertUserInCompany(ctx, dto.responsiblePersonId);
    }
    if (dto.responsibleDepartmentId) {
      await this.assertDepartmentInCompany(ctx, dto.responsibleDepartmentId);
    }
    if (projectManagerId !== ctx.userId) {
      await this.assertUserInCompany(ctx, projectManagerId);
    }

    const project = await this.prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          companyId: ctx.companyId,
          projectCode: dto.projectCode,
          name: dto.name,
          clientCompanyId: dto.clientCompanyId,
          branchId: dto.branchId,
          location: dto.location,
          projectType: dto.projectType,
          contractType: dto.contractType,
          status: dto.status,
          startDate: parseOptionalDate(dto.startDate),
          plannedFinishDate: parseOptionalDate(dto.plannedFinishDate),
          budget: parseOptionalDecimal(dto.budget),
          currency: dto.currency,
          projectManagerId,
          client: dto.client,
          commissioningMethod: dto.commissioningMethod,
          responsibleDepartmentId: dto.responsibleDepartmentId,
          designProperties: dto.designProperties,
          designStage: dto.designStage,
          responsiblePersonId: dto.responsiblePersonId,
          description: dto.description,
          overallProgressPct: dto.overallProgressPct ?? 0,
          isOutsourced: dto.isOutsourced ?? false,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      await this.ensureActiveTeamMember(tx, created.id, ctx.userId, ctx.userId);
      if (projectManagerId !== ctx.userId) {
        await this.ensureActiveTeamMember(
          tx,
          created.id,
          projectManagerId,
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
      [['projectManagerId', 'projectManagerName']],
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
    if (dto.responsibleDepartmentId) {
      await this.assertDepartmentInCompany(ctx, dto.responsibleDepartmentId);
    }

    if (dto.status !== undefined) {
      const current = await this.prisma.project.findFirst({
        where: activeOnly({ id, companyId: ctx.companyId }),
        select: { status: true },
      });
      if (current && dto.status !== current.status) {
        const allowed =
          PROJECT_STATUS_TRANSITIONS[current.status as string] ?? [];
        if (!allowed.includes(dto.status as string)) {
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
                notIn: [IssueStatus.VERIFIED, IssueStatus.CLOSED],
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
        clientCompanyId: dto.clientCompanyId,
        branchId: dto.branchId,
        location: dto.location,
        projectType: dto.projectType,
        contractType: dto.contractType,
        status: dto.status,
        startDate: parseOptionalDate(dto.startDate),
        plannedFinishDate: parseOptionalDate(dto.plannedFinishDate),
        actualFinishDate: parseOptionalDate(dto.actualFinishDate),
        budget: parseOptionalDecimal(dto.budget),
        currency: dto.currency,
        projectManagerId: dto.projectManagerId,
        client: dto.client,
        commissioningMethod: dto.commissioningMethod,
        responsibleDepartmentId: dto.responsibleDepartmentId,
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
      [['projectManagerId', 'projectManagerName']],
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

    const [openRfis, overdueRfis, openIssues, openPunchItems, tasks] =
      await Promise.all([
        this.prisma.rfi.count({
          where: {
            ...projectWhere,
            status: { not: RfiStatus.CLOSED },
          },
        }),
        this.prisma.rfi.count({
          where: {
            ...projectWhere,
            dueDate: { lt: today },
            status: { notIn: [RfiStatus.CLOSED, RfiStatus.ANSWERED] },
          },
        }),
        this.prisma.issue.count({
          where: {
            ...projectWhere,
            status: { not: IssueStatus.CLOSED },
          },
        }),
        this.prisma.punchItem.count({
          where: {
            ...projectWhere,
            status: { not: PunchItemStatus.CLOSED },
          },
        }),
        this.prisma.task.findMany({
          where: activeOnly({ projectId }),
        }),
      ]);

    const scheduleMetrics = this.computeScheduleMetrics(tasks);

    return {
      openRfis,
      overdueRfis,
      openIssues,
      openPunchItems,
      ...scheduleMetrics,
    };
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
          select: { id: true, firstName: true, lastName: true, email: true },
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

  /**
   * Asserts every user id belongs to the active project team.
   */
  async assertUsersOnProjectTeam(
    projectId: string,
    userIds: readonly (string | null | undefined)[],
  ): Promise<void> {
    const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))];
    if (ids.length === 0) {
      return;
    }

    const count = await this.prisma.projectTeam.count({
      where: activeOnly({ projectId, userId: { in: ids } }),
    });
    if (count !== ids.length) {
      throw new NotFoundException('One or more users are not on the project team');
    }
  }

  private async buildProjectListWhere(
    ctx: PmContext,
    query: ProjectListQueryDto,
  ): Promise<Prisma.ProjectWhereInput> {
    const where: Prisma.ProjectWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

    if (!(await this.disciplineScopeService.hasDisciplineScopeBypass(ctx))) {
      const [disciplineProjectIds, teamProjectIds] = await Promise.all([
        this.disciplineScopeService.getAssignedProjectIds(ctx),
        this.projectScopeService.getTeamProjectIds(ctx),
      ]);
      const projectIds = [
        ...new Set([...disciplineProjectIds, ...teamProjectIds]),
      ];
      where.id = { in: projectIds.length > 0 ? projectIds : ['__none__'] };
    }

    if (query.status) {
      where.status = query.status;
    }
    if (query.projectType) {
      where.projectType = query.projectType;
    }
    if (query.projectManagerId) {
      where.projectManagerId = query.projectManagerId;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { name: { contains: term, mode: 'insensitive' } },
        { projectCode: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
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

  private async assertDepartmentInCompany(
    ctx: PmContext,
    departmentId: string,
  ): Promise<void> {
    const department = await this.prisma.department.findFirst({
      where: activeOnly({ id: departmentId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!department) {
      throw new NotFoundException('Department not found');
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

  private computeScheduleMetrics(tasks: Task[]): {
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
    const actualProgressPct = this.clampPercent(
      tasks.reduce((sum, task) => sum + task.progressPct, 0) / tasks.length,
    );

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
      plannedProgressPct !== null
        ? actualProgressPct - plannedProgressPct
        : null;

    return {
      scheduleVariancePct,
      plannedProgressPct,
      actualProgressPct,
    };
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
}
