import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DailyLogsService } from '../daily-logs.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ProjectScopeService } from '../project-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('DailyLogsService uniqueness', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';

  let prisma: { dailyLog: { create: jest.Mock } };
  let service: DailyLogsService;

  beforeEach(() => {
    prisma = {
      dailyLog: { create: jest.fn() },
    };

    service = new DailyLogsService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
      } as unknown as ProjectScopeService,
      {
        ensureDailyLogFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1' }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  it('creates a log for a new date successfully', async () => {
    prisma.dailyLog.create.mockResolvedValue({
      id: 'log-1',
      projectId,
      siteEngineerId: ctx.userId,
      logDate: new Date('2026-01-01'),
      shift: 'Day',
      weatherCondition: null,
      temperatureC: null,
      rainfallMm: null,
      workSummary: null,
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
    });

    const result = await service.createDailyLog(ctx, projectId, {
      logDate: '2026-01-01',
      shift: 'Day',
    });

    expect(result.id).toBe('log-1');
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
        shift: 'Day',
      }),
    ).rejects.toThrow(ConflictException);
  });
});
