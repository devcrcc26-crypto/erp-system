import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DesignPackageStatus,
  MilestoneStatus,
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
  CreateMilestoneDto,
  CreateTaskDependencyDto,
  CreateTaskDisciplineDto,
  CreateTaskDto,
  UpdateMilestoneDto,
  UpdateTaskDependencyDto,
  UpdateTaskDisciplineDto,
  UpdateTaskDto,
} from '../dtos/pm.dtos';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { wouldCreateTaskDependencyCycle } from '../../domain/task-dependency-graph';
import { PmContext } from '../types/pm-context.type';
import {
  mapMilestone,
  mapTask,
  mapTaskDependency,
  mapTaskDiscipline,
  MappedMilestone,
  MappedProjectTaskDiscipline,
  MappedTask,
  MappedTaskDependency,
  MappedTaskDiscipline,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { buildTaskSubtaskWorkDaysSummaries } from '../utils/task-subtask-date-summary.util';
import { DocumentNumberService } from './document-number.service';
import { DisciplineScopeService } from './discipline-scope.service';
import { formatLocalizedName } from '../../../../shared/utils/bilingual-name.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { TaskAssignmentNotificationService } from './task-assignment-notification.service';
import { ProjectScopeService } from './project-scope.service';
import { TaskAccessScopeService } from './task-access-scope.service';

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
  'nameZh',
  'taskIdCode',
  'startDate',
  'finishDate',
  'status',
]);

const TASK_DISCIPLINE_USER_INCLUDE = {
  instituteChiefUser: {
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      chineseName: true,
    },
  },
  supportingDesignerUser: {
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      chineseName: true,
    },
  },
} as const;

const MILESTONE_STATUS_TRANSITIONS: Record<
  MilestoneStatus,
  MilestoneStatus[]
> = {
  PLANNED: [MilestoneStatus.IN_PROGRESS, MilestoneStatus.MISSED],
  IN_PROGRESS: [MilestoneStatus.ACHIEVED, MilestoneStatus.MISSED],
  ACHIEVED: [],
  MISSED: [MilestoneStatus.IN_PROGRESS],
};

/**
 * Project programme / Gantt schedule.
 * TODO: not connected to HR work schedule
 */
@Injectable()
export class ScheduleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly taskAccessScopeService: TaskAccessScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly taskAssignmentNotificationService: TaskAssignmentNotificationService,
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
   * Returns a single project milestone by id.
   */
  async getMilestoneById(
    ctx: PmContext,
    projectId: string,
    milestoneId: string,
  ): Promise<MappedMilestone> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const milestone = await this.prisma.milestone.findFirst({
      where: activeOnly({ id: milestoneId, projectId }),
    });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }

    return mapMilestone(milestone);
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
        status:
          (dto.status as MilestoneStatus | undefined) ?? MilestoneStatus.PLANNED,
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
    const existing = await this.getMilestoneOrThrow(projectId, milestoneId);

    if (dto.status !== undefined && dto.status !== existing.status) {
      const allowed = MILESTONE_STATUS_TRANSITIONS[existing.status];
      if (!allowed.includes(dto.status as MilestoneStatus)) {
        throw new BadRequestException(
          `Invalid milestone status transition from ${existing.status} to ${dto.status}.`,
        );
      }
    }

    const milestone = await this.prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        name: dto.name,
        plannedDate: parseOptionalDate(dto.plannedDate),
        actualDate: parseOptionalDate(dto.actualDate),
        status: dto.status as MilestoneStatus | undefined,
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
    const where = await this.taskAccessScopeService.buildTaskListWhere(
      ctx,
      projectId,
    );
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

    const taskIds = rows.map((task) => task.id);
    const subtaskWorkDaysSummaries =
      taskIds.length > 0
        ? await this.loadSubtaskWorkDaysSummariesForTasks(ctx.companyId, taskIds)
        : new Map<
            string,
            {
              computedPlannedWorkDays: number | null;
              computedActualWorkDays: number | null;
            }
          >();

    return buildPaginatedResult(
      rows.map((task) => ({
        ...mapTask(task),
        ...(subtaskWorkDaysSummaries.get(task.id) ?? {
          computedPlannedWorkDays: null,
          computedActualWorkDays: null,
        }),
      })),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Batch-loads subtask work-day totals for task list columns.
   */
  private async loadSubtaskWorkDaysSummariesForTasks(
    companyId: string,
    taskIds: string[],
  ): Promise<
    Map<
      string,
      {
        computedPlannedWorkDays: number | null;
        computedActualWorkDays: number | null;
      }
    >
  > {
    const subtaskRows = await this.prisma.designPackage.findMany({
      where: activeOnly({
        companyId,
        taskDiscipline: activeOnly({
          taskId: { in: taskIds },
        }),
      }),
      select: {
        plannedStartDate: true,
        plannedFinishDate: true,
        actualWorkDays: true,
        packageStatus: true,
        taskDiscipline: {
          select: { taskId: true },
        },
      },
    });

    return buildTaskSubtaskWorkDaysSummaries(
      taskIds,
      subtaskRows.map((row) => ({
        taskId: row.taskDiscipline.taskId,
        plannedStartDate: row.plannedStartDate,
        plannedFinishDate: row.plannedFinishDate,
        actualWorkDays: row.actualWorkDays,
        packageStatus: row.packageStatus,
      })),
    );
  }

  /**
   * Returns a single project task by id.
   */
  async getTaskById(
    ctx: PmContext,
    projectId: string,
    taskId: string,
  ): Promise<MappedTask> {
    const task = await this.taskAccessScopeService.assertTaskReadable(
      ctx,
      projectId,
      taskId,
    );

    return mapTask(task);
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
    if (!(await this.taskAccessScopeService.canWriteProjectTasks(ctx, projectId))) {
      throw new NotFoundException('Project not found');
    }

    if (dto.milestoneId) {
      await this.getMilestoneOrThrow(projectId, dto.milestoneId);
    }
    if (dto.parentTaskId) {
      throw new BadRequestException(
        'Child tasks cannot be created. Assign work using subtasks on a discipline instead.',
      );
    }
    const taskIdCode =
      dto.taskIdCode?.trim() ||
      (await this.documentNumberService.getNextNumber(ctx, 'TASK'));

    const project = await this.prisma.project.findFirst({
      where: activeOnly({ id: projectId }),
      select: { designStage: true, contractType: true },
    });

    const taskStatus = dto.status ?? 'NOT_STARTED';
    this.assertActualCompletionAllowed(
      taskStatus,
      parseOptionalDate(dto.actualCompletionTime),
    );

    const designStage = dto.designStage ?? project?.designStage ?? undefined;
    const commissionMode = dto.commissionMode ?? project?.contractType ?? undefined;

    const createdDisciplines: Array<{ id: string; disciplineName: string }> =
      [];

    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.task.create({
        data: {
          projectId,
          milestoneId: dto.milestoneId,
          parentTaskId: dto.parentTaskId,
          dispatcherUserId: dto.dispatcherUserId,
          supervisingChiefUserId: dto.supervisingChiefUserId,
          assignedPersonUserId: dto.assignedPersonUserId,
          taskIdCode,
          overseasTaskNumber: dto.overseasTaskNumber?.trim() || null,
          name: dto.name,
          nameZh: dto.nameZh,
          description: dto.description,
          startDate: parseOptionalDate(dto.startDate),
          finishDate: parseOptionalDate(dto.finishDate),
          durationDays: dto.durationDays,
          progressPct: dto.progressPct ?? 0,
          status: taskStatus,
          isCritical: dto.isCritical ?? false,
          commissionMode,
          requiresArchiving: dto.requiresArchiving ?? false,
          taskAttributes: dto.taskAttributes,
          onSiteReceivingTime: parseOptionalDate(dto.onSiteReceivingTime),
          assignmentToHqTime: parseOptionalDate(dto.assignmentToHqTime),
          contactFormNumber: dto.contactFormNumber,
          designStage,
          urgencyLevel: dto.urgencyLevel,
          hasCustomSchedule: dto.hasCustomSchedule ?? false,
          language: dto.language,
          approvalLevel: dto.approvalLevel,
          actualCompletionTime: parseOptionalDate(dto.actualCompletionTime),
          actualWorkdays: dto.actualWorkdays,
          completionStatus: dto.completionStatus,
          remark: dto.remark,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      if (dto.disciplines?.length) {
        let nextDisciplineIndex = 1;
        for (const disciplineDto of dto.disciplines) {
          const catalog = await this.resolveEngineeringDiscipline(
            ctx,
            disciplineDto.disciplineId,
          );
          const disciplinaryLeader = await this.resolveUserDisplayName(
            ctx,
            disciplineDto.disciplineLeadUserId,
          );
          const discipline = await tx.taskDiscipline.create({
            data: {
              taskId: created.id,
              companyId: ctx.companyId,
              disciplineId: catalog.id,
              disciplineName: catalog.name,
              disciplineIndex: nextDisciplineIndex,
              disciplineLeadUserId: disciplineDto.disciplineLeadUserId,
              disciplinaryLeader,
              createdBy: ctx.userId,
              updatedBy: ctx.userId,
            },
          });
          nextDisciplineIndex += 1;
          createdDisciplines.push({
            id: discipline.id,
            disciplineName: discipline.disciplineName,
          });
        }
      }

      return created;
    });

    for (const discipline of createdDisciplines) {
      await this.engineeringDocumentFolderService.ensureDisciplineFolder(
        ctx,
        projectId,
        discipline.id,
        discipline.disciplineName,
      );
    }

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
    await this.assertTaskWritable(ctx, projectId, taskId);

    if (dto.milestoneId) {
      await this.getMilestoneOrThrow(projectId, dto.milestoneId);
    }
    if (dto.parentTaskId !== undefined) {
      throw new BadRequestException(
        'Child task parent links cannot be changed. Use subtasks on a discipline instead.',
      );
    }
    if (dto.status !== undefined) {
      const current = await this.prisma.task.findFirst({
        where: activeOnly({ id: taskId, projectId }),
        select: { status: true },
      });
      if (dto.status !== current!.status) {
        const TASK_STATUS_TRANSITIONS: Record<string, string[]> = {
          NOT_STARTED: ['IN_PROGRESS', 'DELAYED'],
          IN_PROGRESS: ['COMPLETED', 'DELAYED', 'NOT_STARTED'],
          DELAYED: ['IN_PROGRESS', 'NOT_STARTED'],
          // Intentional: allow reopening completed tasks for schedule corrections.
          COMPLETED: ['IN_PROGRESS'],
        };
        const allowed = TASK_STATUS_TRANSITIONS[current!.status];
        if (!allowed?.includes(dto.status)) {
          throw new BadRequestException(
            `Invalid task status transition from ${current!.status} to ${dto.status}.`,
          );
        }
      }

      if (dto.status === 'COMPLETED') {
        const disciplines = await this.prisma.taskDiscipline.findMany({
          where: activeOnly({ taskId, companyId: ctx.companyId }),
          select: { disciplineName: true, isClosed: true },
        });
        if (disciplines.length > 0) {
          const openDisciplineNames = disciplines
            .filter((discipline) => !discipline.isClosed)
            .map((discipline) => discipline.disciplineName);
          if (openDisciplineNames.length > 0) {
            throw new BadRequestException(
              `Task cannot be completed: ${openDisciplineNames.length} discipline(s) still open: [${openDisciplineNames.join(', ')}]`,
            );
          }
        }
      }
    }

    const currentTask = await this.prisma.task.findFirst({
      where: activeOnly({ id: taskId, projectId }),
      select: { status: true, actualCompletionTime: true },
    });
    if (currentTask) {
      const nextStatus = dto.status ?? currentTask.status;
      const nextActualCompletion =
        dto.actualCompletionTime !== undefined
          ? parseOptionalDate(dto.actualCompletionTime)
          : currentTask.actualCompletionTime;
      this.assertActualCompletionAllowed(nextStatus, nextActualCompletion);
    }

    if (dto.disciplineIdsToRemove?.length) {
      throw new BadRequestException(
        'Cannot remove an assigned discipline leader. Change roles on subtasks instead.',
      );
    }

    const createdDisciplines: Array<{ id: string; disciplineName: string }> =
      [];

    const task = await this.prisma.$transaction(async (tx) => {
      if (dto.disciplineIdsToRemove?.length) {
        for (const disciplineId of dto.disciplineIdsToRemove) {
          await tx.taskDiscipline.update({
            where: { id: disciplineId },
            data: { deletedAt: new Date(), deletedBy: ctx.userId },
          });
        }
      }

      if (dto.disciplinesToAdd?.length) {
        const maxDiscipline = await tx.taskDiscipline.aggregate({
          where: activeOnly({
            taskId,
            companyId: ctx.companyId,
          }),
          _max: { disciplineIndex: true },
        });
        let nextDisciplineIndex =
          (maxDiscipline._max.disciplineIndex ?? 0) + 1;

        for (const disciplineDto of dto.disciplinesToAdd) {
          const catalog = await this.resolveEngineeringDiscipline(
            ctx,
            disciplineDto.disciplineId,
          );
          const disciplinaryLeader = await this.resolveUserDisplayName(
            ctx,
            disciplineDto.disciplineLeadUserId,
          );
          const discipline = await tx.taskDiscipline.create({
            data: {
              taskId,
              companyId: ctx.companyId,
              disciplineId: catalog.id,
              disciplineName: catalog.name,
              disciplineIndex: nextDisciplineIndex,
              disciplineLeadUserId: disciplineDto.disciplineLeadUserId,
              disciplinaryLeader,
              createdBy: ctx.userId,
              updatedBy: ctx.userId,
            },
          });
          nextDisciplineIndex += 1;
          createdDisciplines.push({
            id: discipline.id,
            disciplineName: discipline.disciplineName,
          });
        }
      }

      return tx.task.update({
        where: { id: taskId },
        data: {
          milestoneId: dto.milestoneId,
          parentTaskId: dto.parentTaskId,
          dispatcherUserId: dto.dispatcherUserId,
          supervisingChiefUserId: dto.supervisingChiefUserId,
          assignedPersonUserId: dto.assignedPersonUserId,
          taskIdCode: dto.taskIdCode,
          overseasTaskNumber:
            dto.overseasTaskNumber !== undefined
              ? dto.overseasTaskNumber?.trim() || null
              : undefined,
          name: dto.name,
          nameZh: dto.nameZh,
          description: dto.description,
          startDate: parseOptionalDate(dto.startDate),
          finishDate: parseOptionalDate(dto.finishDate),
          durationDays: dto.durationDays,
          progressPct: dto.progressPct,
          status: dto.status,
          isCritical: dto.isCritical,
          commissionMode: dto.commissionMode,
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
          actualCompletionTime: parseOptionalDate(dto.actualCompletionTime),
          actualWorkdays: dto.actualWorkdays,
          completionStatus: dto.completionStatus,
          remark: dto.remark,
          updatedBy: ctx.userId,
        },
      });
    });

    for (const discipline of createdDisciplines) {
      await this.engineeringDocumentFolderService.ensureDisciplineFolder(
        ctx,
        projectId,
        discipline.id,
        discipline.disciplineName,
      );
    }

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
    await this.assertTaskWritable(ctx, projectId, taskId);
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
        ...activeOnly({}),
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

    await this.assertTaskDependencyAcyclic(projectId, {
      predecessorTaskId: dto.predecessorTaskId,
      successorTaskId: dto.successorTaskId,
    });

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
   * Updates an existing task dependency.
   */
  async updateTaskDependency(
    ctx: PmContext,
    projectId: string,
    dependencyId: string,
    dto: UpdateTaskDependencyDto,
  ): Promise<MappedTaskDependency> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const existing = await this.prisma.taskDependency.findFirst({
      where: {
        ...activeOnly({ id: dependencyId }),
        predecessorTask: activeOnly({ projectId }),
        successorTask: activeOnly({ projectId }),
      },
    });
    if (!existing) {
      throw new NotFoundException('Task dependency not found');
    }

    const predecessorTaskId =
      dto.predecessorTaskId ?? existing.predecessorTaskId;
    const successorTaskId = dto.successorTaskId ?? existing.successorTaskId;

    if (predecessorTaskId === successorTaskId) {
      throw new BadRequestException(
        'Predecessor and successor must be different tasks',
      );
    }

    await this.getTaskOrThrow(projectId, predecessorTaskId);
    await this.getTaskOrThrow(projectId, successorTaskId);

    await this.assertTaskDependencyAcyclic(
      projectId,
      { predecessorTaskId, successorTaskId },
      dependencyId,
    );

    const dependency = await this.prisma.taskDependency.update({
      where: { id: dependencyId },
      data: {
        predecessorTaskId,
        successorTaskId,
        ...(dto.dependencyType !== undefined
          ? { dependencyType: dto.dependencyType }
          : {}),
        ...(dto.lagDays !== undefined ? { lagDays: dto.lagDays } : {}),
      },
    });

    return mapTaskDependency(dependency);
  }

  /**
   * Soft-deletes a task dependency scoped to a project.
   */
  async deleteTaskDependency(
    ctx: PmContext,
    projectId: string,
    dependencyId: string,
  ): Promise<void> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const dependency = await this.prisma.taskDependency.findFirst({
      where: {
        ...activeOnly({ id: dependencyId }),
        predecessorTask: activeOnly({ projectId }),
        successorTask: activeOnly({ projectId }),
      },
    });
    if (!dependency) {
      throw new NotFoundException('Task dependency not found');
    }

    await this.prisma.taskDependency.update({
      where: { id: dependencyId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns all disciplines across every schedule task in a project.
   */
  async listProjectDisciplines(
    ctx: PmContext,
    projectId: string,
  ): Promise<MappedProjectTaskDiscipline[]> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const scopeFilter = await this.disciplineScopeService.disciplineWhereForUser(
      ctx,
      projectId,
    );

    const disciplines = await this.prisma.taskDiscipline.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        task: { projectId },
        ...scopeFilter,
      }),
      include: {
        task: {
          select: { name: true, nameZh: true, overseasTaskNumber: true },
        },
        ...TASK_DISCIPLINE_USER_INCLUDE,
      },
      orderBy: [{ task: { name: 'asc' } }, { disciplineIndex: 'asc' }, { createdAt: 'asc' }],
    });

    return disciplines.map((discipline) => ({
      ...mapTaskDiscipline(
        discipline,
        discipline.task.overseasTaskNumber,
      ),
      taskName: formatLocalizedName(
        discipline.task.name,
        discipline.task.nameZh,
      ),
      overseasTaskNumber: discipline.task.overseasTaskNumber,
    }));
  }

  /**
   * Resolves a discipline by id within a project schedule.
   */
  async getProjectDiscipline(
    ctx: PmContext,
    projectId: string,
    disciplineId: string,
  ): Promise<MappedProjectTaskDiscipline> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.disciplineScopeService.assertDisciplineAccess(
      ctx,
      projectId,
      disciplineId,
    );

    const discipline = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: disciplineId,
        companyId: ctx.companyId,
        task: { projectId },
      }),
      include: {
        task: {
          select: { name: true, nameZh: true, overseasTaskNumber: true },
        },
        ...TASK_DISCIPLINE_USER_INCLUDE,
      },
    });

    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }

    return {
      ...mapTaskDiscipline(
        discipline,
        discipline.task.overseasTaskNumber,
      ),
      taskName: formatLocalizedName(
        discipline.task.name,
        discipline.task.nameZh,
      ),
      overseasTaskNumber: discipline.task.overseasTaskNumber,
    };
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
    const scopeFilter = await this.disciplineScopeService.disciplineWhereForUser(
      ctx,
      projectId,
    );

    const disciplines = await this.prisma.taskDiscipline.findMany({
      where: activeOnly({ taskId, companyId: ctx.companyId, ...scopeFilter }),
      include: TASK_DISCIPLINE_USER_INCLUDE,
      orderBy: { disciplineIndex: 'asc' },
    });

    const overseasTaskNumber = await this.resolveTaskOverseasNumber(taskId);
    return disciplines.map((discipline) =>
      mapTaskDiscipline(discipline, overseasTaskNumber),
    );
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

    const roleNames = await this.resolveDisciplineRoleNames(ctx, dto);
    const catalog = await this.resolveEngineeringDiscipline(ctx, dto.disciplineId);

    const maxDiscipline = await this.prisma.taskDiscipline.aggregate({
      where: activeOnly({
        taskId,
        companyId: ctx.companyId,
      }),
      _max: { disciplineIndex: true },
    });
    const disciplineIndex = (maxDiscipline._max.disciplineIndex ?? 0) + 1;

    const discipline = await this.prisma.taskDiscipline.create({
      data: {
        taskId,
        companyId: ctx.companyId,
        disciplineId: catalog.id,
        disciplineName: catalog.name,
        disciplineIndex,
        designerName: roleNames.designerName,
        reviewerName: roleNames.reviewerName,
        disciplinaryLeader: roleNames.disciplinaryLeader,
        deptChiefEngineer: roleNames.deptChiefEngineer,
        disciplineOwnerName: roleNames.disciplineOwnerName,
        designerUserId: dto.designerUserId,
        ownerUserId: dto.ownerUserId,
        reviewerUserId: dto.reviewerUserId,
        disciplineLeadUserId: dto.disciplineLeadUserId,
        chiefUserId: dto.chiefUserId,
        instituteChiefUserId: dto.instituteChiefUserId,
        supportingDesignerUserId: dto.supportingDesignerUserId,
        actualCompletionTime: parseOptionalDate(dto.actualCompletionTime),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: TASK_DISCIPLINE_USER_INCLUDE,
    });

    await this.engineeringDocumentFolderService.ensureDisciplineFolder(
      ctx,
      projectId,
      discipline.id,
      discipline.disciplineName,
    );

    if (dto.disciplineLeadUserId) {
      const task = await this.prisma.task.findFirst({
        where: activeOnly({ id: taskId, projectId }),
        include: {
          project: { select: { name: true, nameZh: true, projectCode: true } },
        },
      });
      if (task) {
        await this.taskAssignmentNotificationService.notifyDisciplineLeaderAssigned(
          ctx,
          {
            recipientId: dto.disciplineLeadUserId,
            projectName: task.project.name,
            projectNumber: task.project.projectCode,
            taskName: formatLocalizedName(task.name, task.nameZh),
            disciplineName: discipline.disciplineName,
            taskId,
            taskDisciplineId: discipline.id,
          },
        );
      }
    }

    return mapTaskDiscipline(
      discipline,
      await this.resolveTaskOverseasNumber(taskId),
    );
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

    const priorLeader = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({ id: disciplineId, taskId, companyId: ctx.companyId }),
      select: { disciplineLeadUserId: true },
    });

    const roleNames = await this.resolveDisciplineRoleNames(ctx, dto);

    const catalog = dto.disciplineId
      ? await this.resolveEngineeringDiscipline(ctx, dto.disciplineId)
      : null;

    const discipline = await this.prisma.taskDiscipline.update({
      where: { id: disciplineId },
      data: {
        ...(catalog
          ? { disciplineId: catalog.id, disciplineName: catalog.name }
          : {}),
        ...(dto.disciplineName && !catalog
          ? { disciplineName: dto.disciplineName }
          : {}),
        designerName: roleNames.designerName,
        reviewerName: roleNames.reviewerName,
        disciplinaryLeader: roleNames.disciplinaryLeader,
        deptChiefEngineer: roleNames.deptChiefEngineer,
        disciplineOwnerName: roleNames.disciplineOwnerName,
        designerUserId: dto.designerUserId,
        ownerUserId: dto.ownerUserId,
        reviewerUserId: dto.reviewerUserId,
        disciplineLeadUserId: dto.disciplineLeadUserId,
        chiefUserId: dto.chiefUserId,
        instituteChiefUserId: dto.instituteChiefUserId,
        supportingDesignerUserId: dto.supportingDesignerUserId,
        actualCompletionTime: parseOptionalDate(dto.actualCompletionTime),
        updatedBy: ctx.userId,
      },
      include: TASK_DISCIPLINE_USER_INCLUDE,
    });

    if (
      dto.disciplineLeadUserId &&
      dto.disciplineLeadUserId !== priorLeader?.disciplineLeadUserId
    ) {
      const task = await this.prisma.task.findFirst({
        where: activeOnly({ id: taskId, projectId }),
        include: {
          project: { select: { name: true, nameZh: true, projectCode: true } },
        },
      });
      if (task) {
        await this.taskAssignmentNotificationService.notifyDisciplineLeaderAssigned(
          ctx,
          {
            recipientId: dto.disciplineLeadUserId,
            projectName: task.project.name,
            projectNumber: task.project.projectCode,
            taskName: formatLocalizedName(task.name, task.nameZh),
            disciplineName: discipline.disciplineName,
            taskId,
            taskDisciplineId: discipline.id,
          },
        );
      }
    }

    return mapTaskDiscipline(
      discipline,
      await this.resolveTaskOverseasNumber(taskId),
    );
  }

  /**
   * Closes a task discipline after all design packages are closed.
   */
  async closeTaskDiscipline(
    ctx: PmContext,
    projectId: string,
    taskId: string,
    disciplineId: string,
  ): Promise<MappedTaskDiscipline> {
    await this.getTaskDisciplineOrThrow(ctx, projectId, taskId, disciplineId);

    const discipline = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({ id: disciplineId, taskId, companyId: ctx.companyId }),
      include: {
        designPackages: {
          where: activeOnly({}),
          select: { name: true, packageStatus: true },
        },
      },
    });
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }

    if (discipline.isClosed) {
      throw new ConflictException('Discipline is already closed.');
    }

    const openPackages = discipline.designPackages.filter(
      (pkg) => pkg.packageStatus !== DesignPackageStatus.CLOSED,
    );
    if (openPackages.length > 0) {
      const names = openPackages.map((pkg) => pkg.name).join(', ');
      throw new BadRequestException(
        `Cannot close discipline: ${openPackages.length} package(s) still open: [${names}]`,
      );
    }

    const updated = await this.prisma.taskDiscipline.update({
      where: { id: disciplineId },
      data: {
        isClosed: true,
        closedAt: new Date(),
        closedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: TASK_DISCIPLINE_USER_INCLUDE,
    });

    return mapTaskDiscipline(
      updated,
      await this.resolveTaskOverseasNumber(taskId),
    );
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
    await this.prisma.taskDiscipline.update({
      where: { id: disciplineId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private async getMilestoneOrThrow(
    projectId: string,
    milestoneId: string,
  ): Promise<{ id: string; status: MilestoneStatus }> {
    const milestone = await this.prisma.milestone.findFirst({
      where: activeOnly({ id: milestoneId, projectId }),
      select: { id: true, status: true },
    });
    if (!milestone) {
      throw new NotFoundException('Milestone not found');
    }
    return milestone;
  }

  private async assertTaskWritable(
    ctx: PmContext,
    projectId: string,
    taskId: string,
  ): Promise<void> {
    await this.taskAccessScopeService.assertTaskReadable(ctx, projectId, taskId);
    if (!(await this.taskAccessScopeService.canWriteProjectTasks(ctx, projectId))) {
      throw new NotFoundException('Task not found');
    }
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

  private async assertTaskDependencyAcyclic(
    projectId: string,
    candidate: { predecessorTaskId: string; successorTaskId: string },
    excludeDependencyId?: string,
  ): Promise<void> {
    const existing = await this.prisma.taskDependency.findMany({
      where: {
        ...activeOnly(
          excludeDependencyId ? { id: { not: excludeDependencyId } } : {},
        ),
        predecessorTask: activeOnly({ projectId }),
        successorTask: activeOnly({ projectId }),
      },
      select: { predecessorTaskId: true, successorTaskId: true },
    });

    if (
      wouldCreateTaskDependencyCycle(existing, candidate)
    ) {
      throw new BadRequestException(
        'Task dependency would create a circular dependency.',
      );
    }
  }

  private async getTaskDisciplineOrThrow(
    ctx: PmContext,
    projectId: string,
    taskId: string,
    disciplineId: string,
  ): Promise<{ id: string }> {
    await this.getTaskOrThrow(projectId, taskId);

    const discipline = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({ id: disciplineId, taskId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }
    return discipline;
  }

  private async resolveDisciplineRoleNames(
    ctx: PmContext,
    dto: Pick<
      CreateTaskDisciplineDto,
      | 'designerUserId'
      | 'ownerUserId'
      | 'reviewerUserId'
      | 'disciplineLeadUserId'
      | 'chiefUserId'
      | 'designerName'
      | 'reviewerName'
      | 'disciplinaryLeader'
      | 'deptChiefEngineer'
    >,
  ): Promise<{
    designerName: string | undefined;
    reviewerName: string | undefined;
    disciplinaryLeader: string | undefined;
    deptChiefEngineer: string | undefined;
    disciplineOwnerName: string | undefined;
  }> {
    return {
      designerName: dto.designerUserId
        ? await this.resolveUserDisplayName(ctx, dto.designerUserId)
        : dto.designerName,
      reviewerName: dto.reviewerUserId
        ? await this.resolveUserDisplayName(ctx, dto.reviewerUserId)
        : dto.reviewerName,
      disciplinaryLeader: dto.disciplineLeadUserId
        ? await this.resolveUserDisplayName(ctx, dto.disciplineLeadUserId)
        : dto.disciplinaryLeader,
      deptChiefEngineer: dto.chiefUserId
        ? await this.resolveUserDisplayName(ctx, dto.chiefUserId)
        : dto.deptChiefEngineer,
      disciplineOwnerName: dto.ownerUserId
        ? await this.resolveUserDisplayName(ctx, dto.ownerUserId)
        : undefined,
    };
  }

  private async resolveUserDisplayName(
    ctx: PmContext,
    userId: string,
  ): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: {
        firstName: true,
        middleName: true,
        lastName: true,
        chineseName: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const name = formatUserDisplayName(user);
    return name === 'Unknown user' ? userId : name;
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

  private assertActualCompletionAllowed(
    status: TaskStatus,
    actualCompletionTime: Date | null | undefined,
  ): void {
    if (status === 'NOT_STARTED' && actualCompletionTime != null) {
      throw new BadRequestException(
        'Actual completion time cannot be set while task status is Not started.',
      );
    }
  }

  private async resolveTaskOverseasNumber(taskId: string): Promise<string | null> {
    const task = await this.prisma.task.findFirst({
      where: activeOnly({ id: taskId }),
      select: { overseasTaskNumber: true },
    });
    return task?.overseasTaskNumber ?? null;
  }

  private async resolveEngineeringDiscipline(
    ctx: PmContext,
    disciplineId: string,
  ): Promise<{ id: string; name: string }> {
    const row = await this.prisma.discipline.findFirst({
      where: activeOnly({
        id: disciplineId,
        companyId: ctx.companyId,
        isActive: true,
      }),
      select: { id: true, name: true },
    });
    if (!row) {
      throw new BadRequestException(
        'Engineering discipline not found or inactive',
      );
    }
    return row;
  }
}
