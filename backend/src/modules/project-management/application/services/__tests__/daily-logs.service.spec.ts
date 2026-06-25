import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
        count: jest.fn(),
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
      getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
    };

    service = new DailyLogsService(
      prisma as unknown as PrismaService,
      projectScopeService as unknown as ProjectScopeService,
      {
        ensureDailyLogFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/daily-logs/2026-01-01' }),
      } as unknown as EngineeringDocumentFolderService,
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
          shift: 'Day',
        }),
      ).rejects.toThrow(
        new ConflictException(
          'A daily log already exists for this project, date, and shift.',
        ),
      );
    });
  });

  describe('updateDailyLog', () => {
    it('blocks data field changes on SUBMITTED logs', async () => {
      prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('SUBMITTED'));

      await expect(
        service.updateDailyLog(ctx, projectId, dailyLogId, {
          workSummary: 'Revised summary',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Daily log data fields cannot be modified after submission. Only status advancement is permitted.',
        ),
      );

      expect(prisma.dailyLog.update).not.toHaveBeenCalled();
    });

    it('allows status SUBMITTED to APPROVED', async () => {
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

    it('blocks DRAFT to APPROVED direct status transition', async () => {
      prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('DRAFT'));

      await expect(
        service.updateDailyLog(ctx, projectId, dailyLogId, {
          status: 'APPROVED',
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid daily log status transition from DRAFT to APPROVED.',
        ),
      );

      expect(prisma.dailyLog.update).not.toHaveBeenCalled();
    });
  });

  describe('addWorkforce', () => {
    it('creates child record linked to the log', async () => {
      prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('DRAFT'));
      prisma.dailyLogWorkforce.create.mockResolvedValue({
        id: 'workforce-1',
        dailyLogId,
        trade: 'Carpentry',
        contractor: 'ABC Contractors',
        workerCount: 12,
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        createdBy: ctx.userId,
      });

      const result = await service.addWorkforce(ctx, projectId, dailyLogId, {
        trade: 'Carpentry',
        contractor: 'ABC Contractors',
        workerCount: 12,
      });

      expect(prisma.dailyLogWorkforce.create).toHaveBeenCalledWith({
        data: {
          dailyLogId,
          trade: 'Carpentry',
          contractor: 'ABC Contractors',
          workerCount: 12,
          createdBy: ctx.userId,
        },
      });
      expect(result.dailyLogId).toBe(dailyLogId);
      expect(result.workerCount).toBe(12);
    });
  });

  describe('addIncident', () => {
    it('creates incident record with correct severity', async () => {
      prisma.dailyLog.findFirst.mockResolvedValue(buildDailyLog('DRAFT'));
      prisma.dailyLogIncident.create.mockResolvedValue({
        id: 'incident-1',
        dailyLogId,
        incidentType: 'Near miss',
        description: 'Unsecured ladder on level 3',
        severity: 'HIGH',
        createdAt: new Date('2026-01-02T00:00:00.000Z'),
        createdBy: ctx.userId,
      });

      const result = await service.addIncident(ctx, projectId, dailyLogId, {
        incidentType: 'Near miss',
        description: 'Unsecured ladder on level 3',
        severity: 'HIGH',
      });

      expect(prisma.dailyLogIncident.create).toHaveBeenCalledWith({
        data: {
          dailyLogId,
          incidentType: 'Near miss',
          description: 'Unsecured ladder on level 3',
          severity: 'HIGH',
          createdBy: ctx.userId,
        },
      });
      expect(result.severity).toBe('HIGH');
    });
  });
});
