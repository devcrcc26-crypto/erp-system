import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DailyLogsService } from '../daily-logs.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ProjectScopeService } from '../project-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('DailyLogsService', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const dailyLogId = 'daily-log-1';

  const detailInclude = {
    workforce: [],
    equipment: [],
    visitors: [],
    incidents: [],
    materials: [],
  };

  function buildDailyLog(status: string) {
    return {
      id: dailyLogId,
      companyId: ctx.companyId,
      projectId,
      siteEngineerId: ctx.userId,
      logNumber: 'DL-PRJ-001',
      logDate: new Date('2026-01-01'),
      shift: 'DAY',
      weatherCondition: 'SUNNY',
      temperatureC: null,
      rainfallMm: null,
      rainfallLevel: null,
      humidity: null,
      workDescription: 'Initial summary',
      workforceCount: null,
      contractorName: null,
      issues: null,
      delays: null,
      supervisorId: null,
      supervisedAt: null,
      submittedAt: null,
      submittedBy: null,
      approvedAt: null,
      approvedBy: null,
      status,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
      ...detailInclude,
    };
  }

  let prisma: {
    dailyLog: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    dailyLogWorkforce: { create: jest.Mock };
    dailyLogIncident: { create: jest.Mock };
  };
  let projectScopeService: { getProjectOrThrow: jest.Mock };
  let service: DailyLogsService;

  beforeEach(() => {
    prisma = {
      dailyLog: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
      },
      dailyLogWorkforce: {
        create: jest.fn(),
      },
      dailyLogIncident: {
        create: jest.fn(),
      },
    };

    projectScopeService = {
      getProjectOrThrow: jest.fn().mockResolvedValue({
        id: projectId,
        companyId: ctx.companyId,
        projectCode: 'PRJ',
      }),
    };

    service = new DailyLogsService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        ensureDailyLogFolder: jest
          .fn()
          .mockResolvedValue({
            id: 'folder-1',
            path: '/projects/demo/daily-logs/2026-01-01',
          }),
      } as unknown as EngineeringDocumentFolderService,
      {
        getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
        getUserModulePermissions: jest.fn().mockResolvedValue({
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
        }),
      } as unknown as PermissionService,
    );
  });

  describe('createDailyLog', () => {
    it('rejects duplicate (projectId, logDate, shift) with ConflictException', async () => {
      const error = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        {
          code: 'P2002',
          clientVersion: '6.19.3',
        },
      );
      prisma.dailyLog.create.mockRejectedValue(error);

      await expect(
        service.createDailyLog(ctx, projectId, {
          logDate: '2026-01-01',
          shift: 'DAY',
          weatherCondition: 'SUNNY',
          workDescription: 'Work done',
        }),
      ).rejects.toThrow(
        new ConflictException(
          'A daily log already exists for this project, date, and shift.',
        ),
      );
    });
  });

  describe('updateDailyLog', () => {
    it('forbids data field changes on APPROVED logs', async () => {
      prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('APPROVED'));

      await expect(
        service.updateDailyLog(ctx, projectId, dailyLogId, {
          workDescription: 'Revised summary',
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(prisma.dailyLog.update).not.toHaveBeenCalled();
    });
  });

  describe('approveDailyLog', () => {
    it('approves a SUBMITTED log when caller is supervisor', async () => {
      const existing = {
        ...buildDailyLog('SUBMITTED'),
        supervisorId: ctx.userId,
      };
      const updated = {
        ...existing,
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: ctx.userId,
      };
      prisma.dailyLog.findFirst.mockResolvedValue(existing);
      prisma.dailyLog.update.mockResolvedValue(updated);

      const result = await service.approveDailyLog(ctx, projectId, dailyLogId);
      expect(result.status).toBe('APPROVED');
    });
  });
});
