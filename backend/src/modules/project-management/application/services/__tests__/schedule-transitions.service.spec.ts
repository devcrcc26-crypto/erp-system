import { BadRequestException } from '@nestjs/common';
import { Task, TaskStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ScheduleService } from '../schedule.service';
import { PmContext } from '../../types/pm-context.type';

describe('ScheduleService status transitions', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const taskId = 'task-1';

  function buildTask(status: string): Task {
    return {
      id: taskId,
      projectId,
      milestoneId: null,
      parentTaskId: null,
      dispatcherUserId: null,
      taskIdCode: 'TASK-001',
      name: 'Foundation work',
      nameZh: '基础工程',
      description: null,
      startDate: null,
      finishDate: null,
      durationDays: null,
      progressPct: 0,
      status: status as TaskStatus,
      isCritical: false,
      commissioningMethod: null,
      requiresArchiving: false,
      taskAttributes: null,
      onSiteReceivingTime: null,
      assignmentToHqTime: null,
      contactFormNumber: null,
      designStage: null,
      urgencyLevel: null,
      hasCustomSchedule: false,
      language: null,
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
    task: { findFirst: jest.Mock; update: jest.Mock };
    taskDiscipline: { findMany: jest.Mock };
    projectTeam: { count: jest.Mock };
  };
  let service: ScheduleService;

  beforeEach(() => {
    prisma = {
      task: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      taskDiscipline: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      projectTeam: {
        count: jest.fn(),
      },
    };

    service = new ScheduleService(
      prisma as unknown as PrismaService,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  function mockTaskWithStatus(status: string): void {
    prisma.task.findFirst.mockImplementation((args: { select?: { status?: boolean } }) => {
      if (args?.select?.status) {
        return Promise.resolve({ status });
      }
      return Promise.resolve({ id: taskId });
    });
  }

  describe('updateTask', () => {
    it('allows NOT_STARTED → IN_PROGRESS', async () => {
      mockTaskWithStatus('NOT_STARTED');
      prisma.task.update.mockResolvedValue(
        buildTask('IN_PROGRESS'),
      );

      const result = await service.updateTask(ctx, projectId, taskId, {
        status: 'IN_PROGRESS' as TaskStatus,
      });

      expect(prisma.task.update).toHaveBeenCalled();
      expect(result.status).toBe('IN_PROGRESS');
    });

    it('throws BadRequestException for NOT_STARTED → COMPLETED', async () => {
      mockTaskWithStatus('NOT_STARTED');

      await expect(
        service.updateTask(ctx, projectId, taskId, {
          status: 'COMPLETED' as TaskStatus,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid task status transition from NOT_STARTED to COMPLETED.',
        ),
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('allows IN_PROGRESS → COMPLETED', async () => {
      mockTaskWithStatus('IN_PROGRESS');
      prisma.task.update.mockResolvedValue(buildTask('COMPLETED'));

      const result = await service.updateTask(ctx, projectId, taskId, {
        status: 'COMPLETED' as TaskStatus,
      });

      expect(prisma.task.update).toHaveBeenCalled();
      expect(result.status).toBe('COMPLETED');
    });

    it('throws BadRequestException for COMPLETED → NOT_STARTED', async () => {
      mockTaskWithStatus('COMPLETED');

      await expect(
        service.updateTask(ctx, projectId, taskId, {
          status: 'NOT_STARTED' as TaskStatus,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid task status transition from COMPLETED to NOT_STARTED.',
        ),
      );

      expect(prisma.task.update).not.toHaveBeenCalled();
    });

    it('skips transition check when status is not in DTO', async () => {
      prisma.task.findFirst
        .mockResolvedValueOnce({ id: taskId })
        .mockResolvedValueOnce({ name: 'Foundation work', nameZh: '基础工程' });
      prisma.task.update.mockResolvedValue(buildTask('NOT_STARTED'));

      const result = await service.updateTask(ctx, projectId, taskId, {
        name: 'Updated name',
        nameZh: '更新名称',
      });

      expect(prisma.task.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.task.update).toHaveBeenCalled();
      expect(result.name).toBe('Foundation work');
      expect(result.nameZh).toBe('基础工程');
    });

    it('allows update when status is unchanged (IN_PROGRESS → IN_PROGRESS)', async () => {
      mockTaskWithStatus('IN_PROGRESS');
      prisma.task.update.mockResolvedValue(
        buildTask('IN_PROGRESS'),
      );

      const result = await service.updateTask(ctx, projectId, taskId, {
        status: 'IN_PROGRESS' as TaskStatus,
        name: 'Updated foundation work',
        nameZh: '更新基础工程',
      });

      expect(prisma.task.update).toHaveBeenCalled();
      expect(result.status).toBe('IN_PROGRESS');
    });
  });
});
