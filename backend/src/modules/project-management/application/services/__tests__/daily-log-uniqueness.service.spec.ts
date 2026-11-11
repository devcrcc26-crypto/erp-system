import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DailyLogsService } from '../daily-logs.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ProjectScopeService } from '../project-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('DailyLogsService uniqueness', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';

  let prisma: { dailyLog: { create: jest.Mock; count: jest.Mock } };
  let service: DailyLogsService;

  beforeEach(() => {
    prisma = {
      dailyLog: { create: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    };

    service = new DailyLogsService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({
          id: projectId,
          companyId: ctx.companyId,
          projectCode: 'PRJ',
        }),
      } as unknown as ProjectScopeService,
      {
        ensureDailyLogFolder: jest.fn().mockResolvedValue({ id: 'folder-1' }),
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

  it('creates a daily log when no duplicate exists', async () => {
    prisma.dailyLog.create.mockResolvedValue({
      id: 'log-1',
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
      workDescription: 'Work done',
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
      status: 'DRAFT',
      createdAt: new Date(),
      createdBy: ctx.userId,
      updatedAt: new Date(),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
      workforce: [],
      equipment: [],
      visitors: [],
      incidents: [],
      materials: [],
    });

    const result = await service.createDailyLog(ctx, projectId, {
      logDate: '2026-01-01',
      shift: 'DAY',
      weatherCondition: 'SUNNY',
      workDescription: 'Work done',
    });

    expect(result.id).toBe('log-1');
    expect(result.logNumber).toBe('DL-PRJ-001');
  });

  it('throws ConflictException for duplicate project/date/shift', async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Unique constraint', {
      code: 'P2002',
      clientVersion: '5.0.0',
    });
    prisma.dailyLog.create.mockRejectedValue(error);

    await expect(
      service.createDailyLog(ctx, projectId, {
        logDate: '2026-01-01',
        shift: 'DAY',
        weatherCondition: 'SUNNY',
        workDescription: 'Work done',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
