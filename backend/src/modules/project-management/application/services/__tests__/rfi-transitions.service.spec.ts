import { BadRequestException } from '@nestjs/common';
import { Rfi, RfiStatus } from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DisciplineScopeService } from '../discipline-scope.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { RfisService } from '../rfis.service';
import { PmContext } from '../../types/pm-context.type';
import { ProjectScopeService } from '../project-scope.service';

describe('RfisService status transitions', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const rfiId = 'rfi-1';

  function buildRfi(status: string): Rfi {
    return {
      id: rfiId,
      projectId,
      taskDisciplineId: null,
      raisedBy: ctx.userId,
      assignedTo: null,
      rfiNumber: 'RFI-001',
      title: 'Clarification on footing depth',
      description: null,
      discipline: null,
      priority: null,
      status: status as RfiStatus,
      dateRaised: new Date('2026-01-01'),
      dueDate: null,
      dateAnswered: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
    } as unknown as Rfi;
  }

  let prisma: {
    rfi: { findFirst: jest.Mock; update: jest.Mock };
  };
  let service: RfisService;

  beforeEach(() => {
    prisma = {
      rfi: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    service = new RfisService(
      prisma as unknown as PrismaService,
      {} as unknown as ProjectScopeService,
      {} as never,
      {
        hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
      } as unknown as DisciplineScopeService,
      {
        ensureRfiFolder: jest
          .fn()
          .mockResolvedValue({ id: 'folder-1', path: '/projects/demo/rfis/RFI-001' }),
      } as unknown as EngineeringDocumentFolderService,
    );
  });

  function mockRfiWithStatus(status: string): void {
    prisma.rfi.findFirst.mockImplementation((args: { select?: { status?: boolean } }) => {
      if (args?.select?.status) {
        return Promise.resolve({ status });
      }
      return Promise.resolve(buildRfi(status));
    });
  }

  describe('updateRfi', () => {
    it('allows DRAFT → SUBMITTED', async () => {
      mockRfiWithStatus('DRAFT');
      prisma.rfi.update.mockResolvedValue(buildRfi('SUBMITTED'));

      const result = await service.updateRfi(ctx, projectId, rfiId, {
        status: RfiStatus.SUBMITTED,
      });

      expect(prisma.rfi.update).toHaveBeenCalled();
      expect(result.status).toBe('SUBMITTED');
    });

    it('throws BadRequestException for DRAFT → CLOSED', async () => {
      mockRfiWithStatus('DRAFT');

      await expect(
        service.updateRfi(ctx, projectId, rfiId, {
          status: RfiStatus.CLOSED,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid RFI status transition from DRAFT to CLOSED.',
        ),
      );

      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it('allows ANSWERED → CLOSED', async () => {
      mockRfiWithStatus('ANSWERED');
      prisma.rfi.update.mockResolvedValue(buildRfi('CLOSED'));

      const result = await service.updateRfi(ctx, projectId, rfiId, {
        status: RfiStatus.CLOSED,
      });

      expect(prisma.rfi.update).toHaveBeenCalled();
      expect(result.status).toBe('CLOSED');
    });

    it('throws BadRequestException for CLOSED → UNDER_REVIEW', async () => {
      mockRfiWithStatus('CLOSED');

      await expect(
        service.updateRfi(ctx, projectId, rfiId, {
          status: RfiStatus.UNDER_REVIEW,
        }),
      ).rejects.toThrow(
        new BadRequestException(
          'Invalid RFI status transition from CLOSED to UNDER_REVIEW.',
        ),
      );

      expect(prisma.rfi.update).not.toHaveBeenCalled();
    });

    it('skips transition check when status is not in DTO', async () => {
      prisma.rfi.findFirst.mockResolvedValue(buildRfi('DRAFT'));
      prisma.rfi.update.mockResolvedValue({
        ...buildRfi('DRAFT'),
        title: 'Updated title',
      });

      const result = await service.updateRfi(ctx, projectId, rfiId, {
        title: 'Updated title',
      });

      expect(prisma.rfi.findFirst).toHaveBeenCalledTimes(1);
      expect(prisma.rfi.update).toHaveBeenCalled();
      expect(result.title).toBe('Updated title');
    });
  });
});
