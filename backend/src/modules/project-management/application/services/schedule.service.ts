import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateMilestoneDto,
  CreateTaskDependencyDto,
  CreateTaskDisciplineDto,
  CreateTaskDto,
  UpdateMilestoneDto,
  UpdateTaskDisciplineDto,
  UpdateTaskDto,
} from '../dtos/pm.dtos';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PmContext } from '../types/pm-context.type';
import {
  mapMilestone,
  mapTask,
  mapTaskDependency,
  mapTaskDiscipline,
  MappedMilestone,
  MappedTask,
  MappedTaskDependency,
  MappedTaskDiscipline,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { DocumentNumberService } from './document-number.service';
import { ProjectScopeService } from './project-scope.service';

const MILESTONE_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'plannedDate',
  'status',
]);

const TASK_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'taskIdCode',
  'startDate',
  'finishDate',
  'status',
]);

@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
  ) {}

  /**
   * Returns a paginated list of milestones for a project.
   */
  async listMilestones(
    ctx: PmContext,
    projectId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<MappedMilestone>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = activeOnly({ projectId });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      MILESTONE_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.milestone.findMany({ where, skip, take, orderBy }),
      this.prisma.milestone.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapMilestone),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Creates a milestone on a project schedule.
   */
  async createMilestone(
    ctx: PmContext,
    projectId: string,
    dto: CreateMilestoneDto,
  ): Promise<MappedMilestone> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const milestone = await this.prisma.milestone.create({
      data: {
        projectId,
        name: dto.name,
        plannedDate: parseOptionalDate(dto.plannedDate),
        actualDate: parseOptionalDate(dto.actualDate),
        status: dto.status ?? 'PLANNED',
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapMilestone(milestone);
  }

  /**
   * Updates an existing project milestone.
   */
  async updateMilestone(
    ctx: PmContext,
    projectId: string,
    milestoneId: string,
    dto: UpdateMilestoneDto,
  ): Promise<MappedMilestone> {
    await this.getMilestoneOrThrow(projectId, milestoneId);

    const milestone = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        name: dto.name,
        plannedDate: parseOptionalDate(dto.plannedDate),
        actualDate: parseOptionalDate(dto.actualDate),
        status: dto.status,
        updatedBy: ctx.userId,
      },
    });

    return mapMilestone(milestone);
  }

  /**
   * Soft-deletes a project milestone.
   */
  async deleteMilestone(
    ctx: PmContext,
    projectId: string,
    milestoneId: string,
  ): Promise<void> {
    await this.getMilestoneOrThrow(projectId, milestoneId);
    await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns a paginated list of tasks for a project.
   */
  async listTasks(
    ctx: PmContext,
    projectId: string,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<MappedTask>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = activeOnly({ projectId });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      TASK_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.task.findMany({ where, skip, take, orderBy }),
      this.prisma.task.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapTask),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Creates a task on a project schedule.
   */
  async createTask(
    ctx: PmContext,
    projectId: string,
    dto: CreateTaskDto,
  ): Promise<MappedTask> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    if (dto.milestoneId) {
      await this.getMilestoneOrThrow(projectId, dto.milestoneId);
    }
    if (dto.parentTaskId) {
      await this.getTaskOrThrow(projectId, dto.parentTaskId);
    }
    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }
    if (dto.responsiblePersonId) {
      await this.assertUserInCompany(ctx, dto.responsiblePersonId);
    }

    const taskIdCode =
      dto.taskIdCode?.trim() ||
      (await this.documentNumberService.getNextNumber(ctx, 'TASK'));

    const task = await this.prisma.task.create({
      data: {
        projectId,
        milestoneId: dto.milestoneId,
        parentTaskId: dto.parentTaskId,
        assignedTo: dto.assignedTo,
        taskIdCode,
        name: dto.name,
        description: dto.description,
        startDate: parseOptionalDate(dto.startDate),
        finishDate: parseOptionalDate(dto.finishDate),
        durationDays: dto.durationDays,
        progressPct: dto.progressPct ?? 0,
        status: dto.status,
        isCritical: dto.isCritical ?? false,
        commissioningMethod: dto.commissioningMethod,
        requiresArchiving: dto.requiresArchiving ?? false,
        taskAttributes: dto.taskAttributes,
        onSiteReceivingTime: parseOptionalDate(dto.onSiteReceivingTime),
        assignmentToHqTime: parseOptionalDate(dto.assignmentToHqTime),
        contactFormNumber: dto.contactFormNumber,
        designStage: dto.designStage,
        urgencyLevel: dto.urgencyLevel,
        hasCustomSchedule: dto.hasCustomSchedule ?? false,
        language: dto.language,
        approvalLevel: dto.approvalLevel,
        chiefEngineerName: dto.chiefEngineerName,
        dispatcherName: dto.dispatcherName,
        responsiblePersonId: dto.responsiblePersonId,
        actualCompletionTime: parseOptionalDate(dto.actualCompletionTime),
        actualWorkdays: dto.actualWorkdays,
        completionStatus: dto.completionStatus,
        remark: dto.remark,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapTask(task);
  }

  /**
   * Updates an existing project task.
   */
  async updateTask(
    ctx: PmContext,
    projectId: string,
    taskId: string,
    dto: UpdateTaskDto,
  ): Promise<MappedTask> {
    await this.getTaskOrThrow(projectId, taskId);

    if (dto.milestoneId) {
      await this.getMilestoneOrThrow(projectId, dto.milestoneId);
    }
    if (dto.parentTaskId) {
      if (dto.parentTaskId === taskId) {
        throw new BadRequestException('Task cannot be its own parent');
      }
      await this.getTaskOrThrow(projectId, dto.parentTaskId);
    }
    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }
    if (dto.responsiblePersonId) {
      await this.assertUserInCompany(ctx, dto.responsiblePersonId);
    }

    const task = await this.prisma.task.update({
      where: { id: taskId },
      data: {
        milestoneId: dto.milestoneId,
        parentTaskId: dto.parentTaskId,
        assignedTo: dto.assignedTo,
        taskIdCode: dto.taskIdCode,
        name: dto.name,
        description: dto.description,
        startDate: parseOptionalDate(dto.startDate),
        finishDate: parseOptionalDate(dto.finishDate),
        durationDays: dto.durationDays,
        progressPct: dto.progressPct,
        status: dto.status,
        isCritical: dto.isCritical,
        commissioningMethod: dto.commissioningMethod,
        requiresArchiving: dto.requiresArchiving,
        taskAttributes: dto.taskAttributes,
        onSiteReceivingTime: parseOptionalDate(dto.onSiteReceivingTime),
        assignmentToHqTime: parseOptionalDate(dto.assignmentToHqTime),
        contactFormNumber: dto.contactFormNumber,
        designStage: dto.designStage,
        urgencyLevel: dto.urgencyLevel,
        hasCustomSchedule: dto.hasCustomSchedule,
        language: dto.language,
        approvalLevel: dto.approvalLevel,
        chiefEngineerName: dto.chiefEngineerName,
        dispatcherName: dto.dispatcherName,
        responsiblePersonId: dto.responsiblePersonId,
        actualCompletionTime: parseOptionalDate(dto.actualCompletionTime),
        actualWorkdays: dto.actualWorkdays,
        completionStatus: dto.completionStatus,
        remark: dto.remark,
        updatedBy: ctx.userId,
      },
    });

    return mapTask(task);
  }

  /**
   * Soft-deletes a project task.
   */
  async deleteTask(
    ctx: PmContext,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    await this.getTaskOrThrow(projectId, taskId);
    await this.prisma.task.update({
      where: { id: taskId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns all task dependencies for a project.
   */
  async listTaskDependencies(
    ctx: PmContext,
    projectId: string,
  ): Promise<MappedTaskDependency[]> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const dependencies = await this.prisma.taskDependency.findMany({
      where: {
        predecessorTask: activeOnly({ projectId }),
        successorTask: activeOnly({ projectId }),
      },
      orderBy: { createdAt: 'asc' },
    });

    return dependencies.map(mapTaskDependency);
  }

  /**
   * Creates a dependency between two project tasks.
   */
  async createTaskDependency(
    ctx: PmContext,
    projectId: string,
    dto: CreateTaskDependencyDto,
  ): Promise<MappedTaskDependency> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    if (dto.predecessorTaskId === dto.successorTaskId) {
      throw new BadRequestException(
        'Predecessor and successor must be different tasks',
      );
    }

    await this.getTaskOrThrow(projectId, dto.predecessorTaskId);
    await this.getTaskOrThrow(projectId, dto.successorTaskId);

    const dependency = await this.prisma.taskDependency.create({
      data: {
        predecessorTaskId: dto.predecessorTaskId,
        successorTaskId: dto.successorTaskId,
        dependencyType: dto.dependencyType,
        lagDays: dto.lagDays ?? 0,
        createdBy: ctx.userId,
      },
    });

    return mapTaskDependency(dependency);
  }

  /**
   * Deletes a task dependency scoped to a project.
   */
  async deleteTaskDependency(
    ctx: PmContext,
    projectId: string,
    dependencyId: string,
  ): Promise<void> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const dependency = await this.prisma.taskDependency.findFirst({
      where: {
        id: dependencyId,
        predecessorTask: activeOnly({ projectId }),
        successorTask: activeOnly({ projectId }),
      },
    });
    if (!dependency) {
      throw new NotFoundException('Task dependency not found');
    }

    await this.prisma.taskDependency.delete({ where: { id: dependencyId } });
  }

  /**
   * Returns all disciplines for a project task.
   */
  async listTaskDisciplines(
    ctx: PmContext,
    projectId: string,
    taskId: string,
  ): Promise<MappedTaskDiscipline[]> {
    await this.getTaskOrThrow(projectId, taskId);

    const disciplines = await this.prisma.taskDiscipline.findMany({
      where: { taskId, companyId: ctx.companyId },
      orderBy: { createdAt: 'asc' },
    });

    return disciplines.map(mapTaskDiscipline);
  }

  /**
   * Creates a discipline row for a project task.
   */
  async createTaskDiscipline(
    ctx: PmContext,
    projectId: string,
    taskId: string,
    dto: CreateTaskDisciplineDto,
  ): Promise<MappedTaskDiscipline> {
    await this.getTaskOrThrow(projectId, taskId);

    const discipline = await this.prisma.taskDiscipline.create({
      data: {
        taskId,
        companyId: ctx.companyId,
        disciplineName: dto.disciplineName,
        designerName: dto.designerName,
        reviewerName: dto.reviewerName,
        disciplinaryLeader: dto.disciplinaryLeader,
        deptChiefEngineer: dto.deptChiefEngineer,
        instituteChiefEngineer: dto.instituteChiefEngineer,
        actualCompletionTime: parseOptionalDate(dto.actualCompletionTime),
        deptReviewTime: parseOptionalDate(dto.deptReviewTime),
        instituteReviewTime: parseOptionalDate(dto.instituteReviewTime),
        createdBy: ctx.userId,
      },
    });

    return mapTaskDiscipline(discipline);
  }

  /**
   * Updates an existing task discipline.
   */
  async updateTaskDiscipline(
    ctx: PmContext,
    projectId: string,
    taskId: string,
    disciplineId: string,
    dto: UpdateTaskDisciplineDto,
  ): Promise<MappedTaskDiscipline> {
    await this.getTaskDisciplineOrThrow(ctx, projectId, taskId, disciplineId);

    const discipline = await this.prisma.taskDiscipline.update({
      where: { id: disciplineId },
      data: {
        disciplineName: dto.disciplineName,
        designerName: dto.designerName,
        reviewerName: dto.reviewerName,
        disciplinaryLeader: dto.disciplinaryLeader,
        deptChiefEngineer: dto.deptChiefEngineer,
        instituteChiefEngineer: dto.instituteChiefEngineer,
        actualCompletionTime: parseOptionalDate(dto.actualCompletionTime),
        deptReviewTime: parseOptionalDate(dto.deptReviewTime),
        instituteReviewTime: parseOptionalDate(dto.instituteReviewTime),
      },
    });

    return mapTaskDiscipline(discipline);
  }

  /**
   * Hard-deletes a task discipline.
   */
  async deleteTaskDiscipline(
    ctx: PmContext,
    projectId: string,
    taskId: string,
    disciplineId: string,
  ): Promise<void> {
    await this.getTaskDisciplineOrThrow(ctx, projectId, taskId, disciplineId);
    await this.prisma.taskDiscipline.delete({ where: { id: disciplineId } });
  }

  private async getMilestoneOrThrow(
    projectId: string,
    milestoneId: string,
  ): Promise<{ id: string }> {
    const milestone = await this.prisma.milestone.findFirst({
      where: activeOnly({ id: milestoneId, projectId }),
      select: { id: true },
    });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }
    return milestone;
  }

  private async getTaskOrThrow(
    projectId: string,
    taskId: string,
  ): Promise<{ id: string }> {
    const task = await this.prisma.task.findFirst({
      where: activeOnly({ id: taskId, projectId }),
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException('Task not found');
    }
    return task;
  }

  private async getTaskDisciplineOrThrow(
    ctx: PmContext,
    projectId: string,
    taskId: string,
    disciplineId: string,
  ): Promise<{ id: string }> {
    await this.getTaskOrThrow(projectId, taskId);

    const discipline = await this.prisma.taskDiscipline.findFirst({
      where: { id: disciplineId, taskId, companyId: ctx.companyId },
      select: { id: true },
    });
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }
    return discipline;
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
}
