import { BadRequestException } from '@nestjs/common';
import { MilestoneStatus, Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DocumentNumberService } from '../document-number.service';
import { ScheduleService } from '../schedule.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('ScheduleService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const dispatcherUserId = 'dispatcher-1';
  const projectId = 'project-1';
  const taskId = 'task-1';
  function buildTask(status: TaskStatus): Task {
    return {
      id: taskId,
      projectId,
      milestoneId: null,
      parentTaskId: null,
      dispatcherUserId,
      taskIdCode: 'TASK-00001',
      name: 'Foundation work',
      nameZh: '基础工程',
      description: null,
      startDate: null,
      finishDate: null,
      durationDays: null,
      progressPct: 0,
      status,
      isCritical: false,
      commissioningMethod: null,
      requiresArchiving: false,
      taskAttributes: null,
      onSiteReceivingTime: null,
      assignmentToHqTime: null,
      contactFormNumber: null,
      designStage: null,
      urgencyLevel: 'NORMAL',
      hasCustomSchedule: false,
      language: 'ENGLISH',
      approvalLevel: null,
      actualCompletionTime: null,
      actualWorkdays: null,
      completionStatus: null,
      remark: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
    } as unknown as Task;
  }

  let prisma: {
    milestone: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    task: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock };
    project: { findFirst: jest.Mock };
    taskDependency: {
      create: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    taskDiscipline: { findMany: jest.Mock; update: jest.Mock };
    projectTeam: { count: jest.Mock };
    $transaction: jest.Mock;
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: ScheduleService;

  beforeEach(() => {
    prisma = {
      milestone: {
        create: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      task: {
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      project: {
        findFirst: jest.fn().mockResolvedValue({
          designStage: null,
          contractType: null,
        }),
      },
      taskDependency: {
        create: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      taskDiscipline: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      projectTeam: {
        count: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma),
      ),
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
    };

    service = new ScheduleService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        resolveEditableDisciplineIds: jest.fn().mockResolvedValue([]),
      } as never,
      {
        buildTaskListWhere: jest.fn().mockResolvedValue({ projectId }),
        assertTaskReadable: jest.fn(),
        canWriteProjectTasks: jest.fn().mockResolvedValue(true),
      } as never,
      {
        getNextNumber: jest.fn().mockResolvedValue('TASK-00001'),
      } as unknown as DocumentNumberService,
      {} as never,
      {} as never,
    );
  });

  describe('createTask', () => {
    it('persists nameZh when provided on create', async () => {
      prisma.projectTeam.count.mockResolvedValue(1);
      prisma.task.create.mockResolvedValue(buildTask('NOT_STARTED'));

      await service.createTask(ctx, projectId, {
        name: 'Foundation work',
        nameZh: '基础工程',
      });

      expect(prisma.task.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Foundation work',
          nameZh: '基础工程',
        }),
      });
    });
  });

  describe('updateTask', () => {
    function mockTaskWithStatus(status: TaskStatus): void {
      prisma.task.findFirst.mockImplementation(
        (args: { select?: { status?: boolean } }) => {
          if (args?.select?.status) {
            return Promise.resolve({ status });
          }
          return Promise.resolve({ id: taskId });
        },
      );
      prisma.projectTeam.count.mockResolvedValue(1);
    }

    it.each([
      ['NOT_STARTED', 'IN_PROGRESS'],
      ['IN_PROGRESS', 'COMPLETED'],
      ['DELAYED', 'IN_PROGRESS'],
      ['DELAYED', 'NOT_STARTED'],
    ] as const)(
      'allows %s to %s transition',
      async (fromStatus, toStatus) => {
        mockTaskWithStatus(fromStatus);
        prisma.task.update.mockResolvedValue(buildTask(toStatus));

        const result = await service.updateTask(ctx, projectId, taskId, {
          status: toStatus,
        });

        expect(prisma.task.update).toHaveBeenCalled();
        expect(result.status).toBe(toStatus);
      },
    );

    it('blocks DELAYED to COMPLETED transition', async () => {
      mockTaskWithStatus(TaskStatus.DELAYED);

      await expect(
        service.updateTask(ctx, projectId, taskId, {
          status: TaskStatus.COMPLETED,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid task status transition from DELAYED to COMPLETED.',
        ),
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });
  });

  describe('createTaskDependency', () => {
    const taskA = 'task-a';
    const taskB = 'task-b';

    beforeEach(() => {
      prisma.task.findFirst.mockResolvedValue({ id: taskA });
    });

    it('detects dependency cycles A→B→A', async () => {
      prisma.taskDependency.findMany.mockResolvedValue([
        { predecessorTaskId: taskA, successorTaskId: taskB },
      ]);

      await expect(
        service.createTaskDependency(ctx, projectId, {
          predecessorTaskId: taskB,
          successorTaskId: taskA,
          dependencyType: 'FS',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Task dependency would create a circular dependency.',
        ),
      );

      expect(prisma.taskDependency.create).not.toHaveBeenCalled();
    });
  });

  describe('deleteTaskDependency', () => {
    it('soft-deletes the dependency with deletedAt and deletedBy', async () => {
      const dependencyId = 'dependency-1';
      prisma.taskDependency.findFirst.mockResolvedValue({
        id: dependencyId,
        predecessorTaskId: 'task-predecessor',
        successorTaskId: 'task-successor',
      });
      prisma.taskDependency.update.mockResolvedValue({});

      await service.deleteTaskDependency(ctx, projectId, dependencyId);

      expect(prisma.taskDependency.update).toHaveBeenCalledWith({
        where: { id: dependencyId },
        data: {
          deletedAt: expect.any(Date),
          deletedBy: ctx.userId,
        },
      });
      expect(prisma.taskDependency.update).not.toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: dependencyId }, data: expect.objectContaining({ deletedAt: null }) }),
      );
    });
  });

  describe('updateMilestone', () => {
    it('blocks ACHIEVED to IN_PROGRESS transition', async () => {
      prisma.milestone.findFirst.mockResolvedValue({
        id: 'milestone-1',
        projectId,
        name: 'Structural complete',
        plannedDate: new Date('2026-09-01'),
        actualDate: new Date('2026-09-01'),
        status: MilestoneStatus.ACHIEVED,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
        updatedAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      });

      await expect(
        service.updateMilestone(ctx, projectId, 'milestone-1', {
          status: MilestoneStatus.IN_PROGRESS,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid milestone status transition from ACHIEVED to IN_PROGRESS.',
        ),
      );

      expect(prisma.milestone.update).not.toHaveBeenCalled();
    });
  });

  describe('createMilestone', () => {
    it('creates milestone with PLANNED status', async () => {
      prisma.milestone.create.mockResolvedValue({
        id: 'milestone-1',
        projectId,
        name: 'Structural complete',
        plannedDate: new Date('2026-09-01'),
        actualDate: null,
        status: MilestoneStatus.PLANNED,
        createdAt: new Date('2026-06-01T00:00:00.000Z'),
        createdBy: ctx.userId,
        updatedAt: new Date('2026-06-01T00:00:00.000Z'),
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      });

      const result = await service.createMilestone(ctx, projectId, {
        name: 'Structural complete',
        plannedDate: '2026-09-01',
      });

      expect(prisma.milestone.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          status: MilestoneStatus.PLANNED,
        }),
      });
      expect(result.status).toBe('PLANNED');
    });
  });
});
