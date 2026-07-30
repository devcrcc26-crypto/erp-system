import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Prisma, Task } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ProjectsService } from '../projects.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('ProjectsService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const responsiblePersonId = 'user-pm';
  const memberUserId = 'user-2';
  const projectId = 'project-1';

  let prisma: {
    project: {
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    projectTeam: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { findFirst: jest.Mock; findMany: jest.Mock };
    rfi: { count: jest.Mock };
    issue: { count: jest.Mock };
    punchItem: { count: jest.Mock };
    risk: { count: jest.Mock };
    projectChangeRequest: { count: jest.Mock };
    dailyLog: { count: jest.Mock };
    meeting: { count: jest.Mock };
    actionItem: { count: jest.Mock };
    correspondence: { count: jest.Mock };
    submittal: { count: jest.Mock };
    designPackage: { groupBy: jest.Mock };
    task: { findMany: jest.Mock };
    taskDiscipline: { findMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: ProjectsService;

  beforeEach(() => {
    prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        update: jest.fn(),
      },
      projectTeam: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
      },
      user: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      rfi: {
        count: jest.fn().mockResolvedValue(0),
      },
      issue: {
        count: jest.fn().mockResolvedValue(0),
      },
      punchItem: {
        count: jest.fn().mockResolvedValue(0),
      },
      risk: {
        count: jest.fn().mockResolvedValue(0),
      },
      projectChangeRequest: {
        count: jest.fn().mockResolvedValue(0),
      },
      dailyLog: {
        count: jest.fn().mockResolvedValue(0),
      },
      meeting: {
        count: jest.fn().mockResolvedValue(0),
      },
      actionItem: {
        count: jest.fn().mockResolvedValue(0),
      },
      correspondence: {
        count: jest.fn().mockResolvedValue(0),
      },
      submittal: {
        count: jest.fn().mockResolvedValue(0),
      },
      designPackage: {
        groupBy: jest.fn().mockResolvedValue([]),
      },
      task: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      taskDiscipline: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      $transaction: jest.fn(),
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
      }),
    };

    service = new ProjectsService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
      } as unknown as DisciplineScopeService,
      {
        getVisibleProjectIds: jest.fn().mockResolvedValue(null),
      } as never,
      {
        ensureProjectFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/DEMO-001' }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  describe('createProject', () => {
    it('auto-seeds two ProjectTeam rows for creator and responsible person', async () => {
      const createdProject = {
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'DEMO-002',
        name: 'Airport Expansion',
        nameZh: '机场扩建',
        responsiblePersonId,
      };
      const teamCreate = jest.fn().mockResolvedValue({});

      prisma.$transaction.mockImplementation(
        async (
          callback: (tx: {
            project: { create: jest.Mock };
            projectTeam: {
              findFirst: jest.Mock;
              create: jest.Mock;
              update: jest.Mock;
            };
          }) => Promise<typeof createdProject>,
        ) =>
          callback({
            project: {
              create: jest.fn().mockResolvedValue(createdProject),
            },
            projectTeam: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: teamCreate,
              update: jest.fn(),
            },
          }),
      );

      prisma.user.findFirst.mockResolvedValue({ id: responsiblePersonId });

      await service.createProject(ctx, {
        projectCode: 'DEMO-002',
        name: 'Airport Expansion',
        nameZh: '机场扩建',
        responsiblePersonId,
      });

      expect(teamCreate).toHaveBeenCalledTimes(2);
      expect(teamCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          userId: ctx.userId,
        }),
      });
      expect(teamCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId,
          userId: responsiblePersonId,
        }),
      });
    });
  });

  describe('chinese name fields', () => {
    it('persists nameZh when provided on create', async () => {
      const projectCreate = jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'DEMO-003',
        name: 'Marina Tower',
        nameZh: '滨海大厦',
        responsiblePersonId: ctx.userId,
      });

      prisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            project: { create: projectCreate },
            projectTeam: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
              update: jest.fn(),
            },
          }),
      );

      await service.createProject(ctx, {
        projectCode: 'DEMO-003',
        name: 'Marina Tower',
        nameZh: '滨海大厦',
      });

      expect(projectCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Marina Tower',
          nameZh: '滨海大厦',
        }),
      });
    });

    it('creates project without nameZh when omitted', async () => {
      const projectCreate = jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'DEMO-004',
        name: 'Riverside Complex',
        nameZh: null,
        responsiblePersonId: ctx.userId,
      });

      prisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            project: { create: projectCreate },
            projectTeam: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
              update: jest.fn(),
            },
          }),
      );

      await service.createProject(ctx, {
        projectCode: 'DEMO-004',
        name: 'Riverside Complex',
      });

      expect(projectCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'Riverside Complex',
          nameZh: undefined,
        }),
      });
    });

    it('updates project to add nameZh later', async () => {
      prisma.project.update.mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'DEMO-005',
        name: 'Office Tower',
        nameZh: '办公大楼',
      });

      await service.updateProject(ctx, projectId, {
        nameZh: '办公大楼',
      });

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: projectId },
        data: expect.objectContaining({
          nameZh: '办公大楼',
        }),
      });
    });
  });

  describe('project type-specific fields', () => {
    function mockCreateTransaction(projectCreate: jest.Mock): void {
      prisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<unknown>) =>
          callback({
            project: { create: projectCreate },
            projectTeam: {
              findFirst: jest.fn().mockResolvedValue(null),
              create: jest.fn(),
              update: jest.fn(),
            },
          }),
      );
    }

    it('persists railwayLengthKm for RAILWAY project', async () => {
      const projectCreate = jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'RWY-001',
        name: 'High-speed rail',
        responsiblePersonId: ctx.userId,
      });
      mockCreateTransaction(projectCreate);

      await service.createProject(ctx, {
        projectCode: 'RWY-001',
        name: 'High-speed rail',
        projectType: 'RAILWAY',
        railwayLengthKm: 120.5,
      });

      expect(projectCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectType: 'RAILWAY',
          railwayLengthKm: 120.5,
        }),
      });
    });

    it('persists roadLengthKm for ROAD project', async () => {
      const projectCreate = jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'RD-001',
        name: 'Highway extension',
        responsiblePersonId: ctx.userId,
      });
      mockCreateTransaction(projectCreate);

      await service.createProject(ctx, {
        projectCode: 'RD-001',
        name: 'Highway extension',
        projectType: 'ROAD',
        roadLengthKm: 45,
      });

      expect(projectCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectType: 'ROAD',
          roadLengthKm: 45,
        }),
      });
    });

    it('persists grossFloorAreaM2 for BUILDING project', async () => {
      const projectCreate = jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'BLD-001',
        name: 'Office tower',
        responsiblePersonId: ctx.userId,
      });
      mockCreateTransaction(projectCreate);

      await service.createProject(ctx, {
        projectCode: 'BLD-001',
        name: 'Office tower',
        projectType: 'BUILDING',
        grossFloorAreaM2: 85000,
      });

      expect(projectCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectType: 'BUILDING',
          grossFloorAreaM2: 85000,
        }),
      });
    });

    it('creates OTHER project with all type-specific fields null', async () => {
      const projectCreate = jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'OTH-001',
        name: 'Misc project',
        responsiblePersonId: ctx.userId,
      });
      mockCreateTransaction(projectCreate);

      await service.createProject(ctx, {
        projectCode: 'OTH-001',
        name: 'Misc project',
        projectType: 'OTHER',
      });

      expect(projectCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectType: 'OTHER',
          railwayLengthKm: undefined,
          urbanRailLengthKm: undefined,
          roadLengthKm: undefined,
          grossFloorAreaM2: undefined,
        }),
      });
    });

    it('allows type-specific field that does not match project type (intentional)', async () => {
      const projectCreate = jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'RD-002',
        name: 'Road with area',
        responsiblePersonId: ctx.userId,
      });
      mockCreateTransaction(projectCreate);

      await service.createProject(ctx, {
        projectCode: 'RD-002',
        name: 'Road with area',
        projectType: 'ROAD',
        grossFloorAreaM2: 1200,
      });

      expect(projectCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectType: 'ROAD',
          grossFloorAreaM2: 1200,
        }),
      });
    });
  });

  describe('setTeam', () => {
    it('validates all userIds are in the company', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(
        async (callback: (tx: unknown) => Promise<void>) => callback({}),
      );

      await expect(
        service.setTeam(ctx, projectId, { userIds: [memberUserId] }),
      ).rejects.toThrow(new NotFoundException('User not found'));

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('throws ConflictException when adding the same userId twice to a project', async () => {
      const duplicateMemberError = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
        },
      );

      prisma.user.findFirst.mockResolvedValue({ id: memberUserId });

      let transactionCount = 0;
      prisma.$transaction.mockImplementation(
        async (callback: (tx: {
          projectTeam: {
            findMany: jest.Mock;
            create: jest.Mock;
            update: jest.Mock;
          };
        }) => Promise<void>) => {
          transactionCount += 1;
          const tx = {
            projectTeam: {
              findMany: jest.fn().mockResolvedValue([]),
              create: jest.fn().mockImplementation(() => {
                if (transactionCount === 1) {
                  return Promise.resolve({
                    id: 'team-member-1',
                    projectId,
                    userId: memberUserId,
                    deletedAt: null,
                  });
                }
                return Promise.reject(duplicateMemberError);
              }),
              update: jest.fn(),
            },
          };
          return callback(tx);
        },
      );

      prisma.projectTeam.findMany.mockResolvedValue([
        {
          id: 'team-member-1',
          projectId,
          userId: memberUserId,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      ]);

      await service.setTeam(ctx, projectId, { userIds: [memberUserId] });

      await expect(
        service.setTeam(ctx, projectId, { userIds: [memberUserId] }),
      ).rejects.toThrow(
        new ConflictException('User is already a member of this project.'),
      );
    });
  });

  describe('getDashboardStats', () => {
    it('returns expanded PM module counts per project', async () => {
      prisma.issue.count
        .mockResolvedValueOnce(1) // OPEN
        .mockResolvedValueOnce(2) // IN_PROGRESS
        .mockResolvedValueOnce(3) // CLOSED
        .mockResolvedValueOnce(0); // overdueIssues
      prisma.rfi.count
        .mockResolvedValueOnce(4) // open
        .mockResolvedValueOnce(1) // answered
        .mockResolvedValueOnce(0) // closed
        .mockResolvedValueOnce(2); // overdue
      prisma.punchItem.count
        .mockResolvedValueOnce(1) // raised
        .mockResolvedValueOnce(2) // assigned
        .mockResolvedValueOnce(1) // corrected
        .mockResolvedValueOnce(1) // verified
        .mockResolvedValueOnce(0) // closed
        .mockResolvedValueOnce(0); // overduePunch
      prisma.task.findMany.mockResolvedValue([
        {
          id: 'task-1',
          progressPct: 60,
          startDate: new Date('2026-01-01'),
          finishDate: new Date('2026-12-31'),
        },
        {
          id: 'task-2',
          progressPct: 40,
          startDate: new Date('2026-01-01'),
          finishDate: new Date('2026-12-31'),
        },
      ] as Task[]);
      prisma.taskDiscipline.findMany.mockResolvedValue([
        {
          taskId: 'task-1',
          designPackages: [
            { packageStatus: 'CLOSED' },
            { packageStatus: 'OPEN' },
          ],
        },
        {
          taskId: 'task-2',
          designPackages: [{ packageStatus: 'OPEN' }],
        },
      ]);

      const stats = await service.getDashboardStats(ctx, projectId);

      expect(projectScopeService.getProjectOrThrow).toHaveBeenCalledWith(
        ctx,
        projectId,
      );
      expect(stats.openRfis).toBe(4);
      expect(stats.overdueRfis).toBe(2);
      expect(stats.openIssues).toBe(1);
      expect(stats.inProgressIssues).toBe(2);
      expect(stats.closedIssues).toBe(3);
      expect(stats.openPunchItems).toBe(5);
      expect(stats.raisedPunch).toBe(1);
      expect(stats.assignedPunch).toBe(2);
      expect(stats.subtasksByStatus.IN_PROGRESS).toBe(0);
      expect(stats.actualProgressPct).toBe(25);
    });
  });

  describe('updateProject transition guard', () => {
    it('rejects invalid project status transitions', async () => {
      prisma.project.findFirst.mockResolvedValue({ status: 'NOT_STARTED' });

      await expect(
        service.updateProject(ctx, projectId, { status: 'COMPLETED' as never }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid project status transition from NOT_STARTED to COMPLETED.',
        ),
      );

      expect(prisma.project.update).not.toHaveBeenCalled();
    });
  });
});
