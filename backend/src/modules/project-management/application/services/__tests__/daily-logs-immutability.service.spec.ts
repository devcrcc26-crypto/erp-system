import { BadRequestException } from '@nestjs/common';
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
  };

  function buildDailyLog(status: string) {
    return {
      id: dailyLogId,
      projectId,
      siteEngineerId: ctx.userId,
      logDate: new Date('2026-01-01'),
      shift: 'Day',
      weatherCondition: 'Clear',
      temperatureC: null,
      rainfallMm: null,
      workSummary: 'Initial summary',
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
        ensureDailyLogFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1' }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  it('updates a DRAFT log weather field successfully', async () => {
    const existing = buildDailyLog('DRAFT');
    const updated = { ...existing, weatherCondition: 'Rainy' };

    prisma.dailyLog.findFirst.mockResolvedValue(existing);
    prisma.dailyLog.update.mockResolvedValue(updated);

    const result = await service.updateDailyLog(ctx, projectId, dailyLogId, {
      weatherCondition: 'Rainy',
    });

    expect(prisma.dailyLog.update).toHaveBeenCalled();
    expect(result.weatherCondition).toBe('Rainy');
  });

  it('throws BadRequestException when updating weather on a SUBMITTED log', async () => {
    prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('SUBMITTED'));

    await expect(
      service.updateDailyLog(ctx, projectId, dailyLogId, {
        weatherCondition: 'Rainy',
      }),
    ).rejects.toThrow(
      new BadRequestException('Daily log cannot be edited after submission.'),
    );

    expect(prisma.dailyLog.update).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when updating work summary on an APPROVED log', async () => {
    prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('APPROVED'));

    await expect(
      service.updateDailyLog(ctx, projectId, dailyLogId, {
        workSummary: 'Revised summary',
      }),
    ).rejects.toThrow(
      new BadRequestException('Daily log cannot be edited after submission.'),
    );

    expect(prisma.dailyLog.update).not.toHaveBeenCalled();
  });

  it('advances a DRAFT log status to SUBMITTED successfully', async () => {
    const existing = buildDailyLog('DRAFT');
    const updated = { ...existing, status: 'SUBMITTED' };

    prisma.dailyLog.findFirst.mockResolvedValue(existing);
    prisma.dailyLog.update.mockResolvedValue(updated);

    const result = await service.updateDailyLog(ctx, projectId, dailyLogId, {
      status: 'SUBMITTED',
    });

    expect(prisma.dailyLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'SUBMITTED',
          updatedBy: ctx.userId,
        }),
      }),
    );
    expect(result.status).toBe('SUBMITTED');
  });

  it('advances a SUBMITTED log status to APPROVED successfully', async () => {
    const existing = buildDailyLog('SUBMITTED');
    const updated = { ...existing, status: 'APPROVED' };

    prisma.dailyLog.findFirst.mockResolvedValue(existing);
    prisma.dailyLog.update.mockResolvedValue(updated);

    const result = await service.updateDailyLog(ctx, projectId, dailyLogId, {
      status: 'APPROVED',
    });

    expect(prisma.dailyLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'APPROVED',
          updatedBy: ctx.userId,
        }),
      }),
    );
    expect(result.status).toBe('APPROVED');
  });
});
