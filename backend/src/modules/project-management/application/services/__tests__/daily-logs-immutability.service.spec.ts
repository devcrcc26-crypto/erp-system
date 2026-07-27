import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DailyLogsService } from '../daily-logs.service';
import { PmContext } from '../../types/pm-context.type';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ProjectScopeService } from '../project-scope.service';

describe('DailyLogsService immutability', () => {
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
    dailyLog: { findFirst: jest.Mock; update: jest.Mock };
  };
  let service: DailyLogsService;

  beforeEach(() => {
    prisma = {
      dailyLog: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new DailyLogsService(
      prisma as unknown as PrismaService,
      {} as unknown as ProjectScopeService,
      {
        ensureDailyLogFolder: jest.fn().mockResolvedValue({ id: 'folder-1' }),
      } as unknown as EngineeringDocumentFolderService,
      {
        getUserRoleNames: jest.fn().mockResolvedValue(['Employee']),
        getUserModulePermissions: jest.fn().mockResolvedValue({
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
        }),
      } as unknown as PermissionService,
    );
  });

  it('updates a DRAFT log weather field successfully', async () => {
    const existing = buildDailyLog('DRAFT');
    const updated = { ...existing, weatherCondition: 'OVERCAST' };

    prisma.dailyLog.findFirst.mockResolvedValue(existing);
    prisma.dailyLog.update.mockResolvedValue(updated);

    const result = await service.updateDailyLog(ctx, projectId, dailyLogId, {
      weatherCondition: 'OVERCAST',
    });

    expect(result.weatherCondition).toBe('OVERCAST');
    expect(prisma.dailyLog.update).toHaveBeenCalled();
  });

  it('allows creator to edit a SUBMITTED log', async () => {
    const existing = buildDailyLog('SUBMITTED');
    const updated = { ...existing, weatherCondition: 'FOGGY' };

    prisma.dailyLog.findFirst.mockResolvedValue(existing);
    prisma.dailyLog.update.mockResolvedValue(updated);

    const result = await service.updateDailyLog(ctx, projectId, dailyLogId, {
      weatherCondition: 'FOGGY',
    });

    expect(result.weatherCondition).toBe('FOGGY');
  });

  it('forbids edits on an APPROVED log', async () => {
    prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('APPROVED'));

    await expect(
      service.updateDailyLog(ctx, projectId, dailyLogId, {
        workDescription: 'Revised summary',
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(prisma.dailyLog.update).not.toHaveBeenCalled();
  });

  it('submits a DRAFT log', async () => {
    const existing = buildDailyLog('DRAFT');
    const updated = {
      ...existing,
      status: 'SUBMITTED',
      submittedAt: new Date(),
      submittedBy: ctx.userId,
    };

    prisma.dailyLog.findFirst.mockResolvedValue(existing);
    prisma.dailyLog.update.mockResolvedValue(updated);

    const result = await service.submitDailyLog(ctx, projectId, dailyLogId);
    expect(result.status).toBe('SUBMITTED');
  });

  it('rejects submit when not DRAFT', async () => {
    prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('SUBMITTED'));

    await expect(
      service.submitDailyLog(ctx, projectId, dailyLogId),
    ).rejects.toThrow(BadRequestException);
  });
});
