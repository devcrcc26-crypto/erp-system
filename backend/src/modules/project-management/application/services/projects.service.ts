import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RfiStatus, IssueStatus, PunchItemStatus, Task } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  AddProjectTeamMemberDto,
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
import { ProjectScopeService } from './project-scope.service';

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
  ) {}

  /**
   * Returns a paginated list of projects for the caller's company.
   */
  async listProjects(
    ctx: PmContext,
    query: ProjectListQueryDto,
  ): Promise<PaginatedResult<MappedProject>> {
    const where = this.buildProjectListWhere(ctx, query);
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

    return buildPaginatedResult(
      rows.map(mapProject),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a single project by id scoped to the caller's company.
   */
  async getProject(ctx: PmContext, id: string): Promise<MappedProject> {
    const project = await this.projectScopeService.getProjectOrThrow(ctx, id);
    return mapProject(project);
  }

  /**
   * Creates a new project for the caller's company.
   */
  async createProject(
    ctx: PmContext,
    dto: CreateProjectDto,
  ): Promise<MappedProject> {
    await this.assertProjectCodeAvailable(ctx, dto.projectCode);

    const project = await this.prisma.project.create({
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
        projectManagerId: dto.projectManagerId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapProject(project);
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
        updatedBy: ctx.userId,
      },
    });

    return mapProject(project);
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

    return members.map(mapProjectTeamMember);
  }

  /**
   * Adds a team member to a project.
   */
  async addTeamMember(
    ctx: PmContext,
    projectId: string,
    dto: AddProjectTeamMemberDto,
  ): Promise<MappedProjectTeamMember> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.assertUserInCompany(ctx, dto.userId);

    const member = await this.prisma.projectTeam.create({
      data: {
        projectId,
        userId: dto.userId,
        roleOnProject: dto.roleOnProject,
        assignedFrom: parseOptionalDate(dto.assignedFrom),
        assignedTo: parseOptionalDate(dto.assignedTo),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapProjectTeamMember(member);
  }

  /**
   * Soft-removes a team member from a project.
   */
  async removeTeamMember(
    ctx: PmContext,
    projectId: string,
    memberId: string,
  ): Promise<void> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const member = await this.prisma.projectTeam.findFirst({
      where: activeOnly({ id: memberId, projectId }),
    });
    if (!member) {
      throw new NotFoundException('Team member not found');
    }

    await this.prisma.projectTeam.update({
      where: { id: memberId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private buildProjectListWhere(
    ctx: PmContext,
    query: ProjectListQueryDto,
  ): Prisma.ProjectWhereInput {
    const where: Prisma.ProjectWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

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
