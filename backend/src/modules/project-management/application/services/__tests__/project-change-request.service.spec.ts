import { ConflictException } from '@nestjs/common';
import {
  ProjectChangeRequest,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { ProjectChangeRequestService } from '../project-change-request.service';
import { DocumentNumberService } from '../document-number.service';
import { ProjectScopeService } from '../project-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('ProjectChangeRequestService status transitions', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const changeRequestId = 'change-request-1';

  let prisma: {
    projectChangeRequest: { findFirst: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let service: ProjectChangeRequestService;

  function buildChangeRequest(status: string): ProjectChangeRequest {
    return {
      id: changeRequestId,
      companyId: ctx.companyId,
      projectId,
      changeNumber: 'CR-00001',
      title: 'Additional foundation work',
      description: 'Original scope note',
      status: status as ProjectChangeRequestStatus,
      sourceType: ProjectChangeRequestSource.MANUAL,
      sourceEntityId: null,
      externalReviewTriggerId: null,
      linkedDesignPackageId: null,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      createdBy: ctx.userId,
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
    };
  }

  beforeEach(() => {
    prisma = {
      projectChangeRequest: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (work: (tx: typeof prisma) => Promise<unknown>) =>
        work(prisma),
      ),
    };

    service = new ProjectChangeRequestService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
      } as unknown as ProjectScopeService,
      {
        nextChangeRequestNumber: jest.fn(),
      } as unknown as DocumentNumberService,
      { createLinkedEntityTrigger: jest.fn() } as never,
    );
  });

  function mockChangeRequestWithStatus(status: string): void {
    prisma.projectChangeRequest.findFirst.mockResolvedValue(
      buildChangeRequest(status),
    );
  }

  describe('approveChangeRequest', () => {
    it('throws ConflictException when status is APPROVED', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.APPROVED);

      await expect(
        service.approveChangeRequest(ctx, projectId, changeRequestId),
      ).rejects.toThrow(
        new ConflictException('Change request is already approved.'),
      );

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when status is REJECTED', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.REJECTED);

      await expect(
        service.approveChangeRequest(ctx, projectId, changeRequestId),
      ).rejects.toThrow(
        new ConflictException(
          'A rejected change request cannot be approved. Create a new one.',
        ),
      );

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when status is CLOSED', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.CLOSED);

      await expect(
        service.approveChangeRequest(ctx, projectId, changeRequestId),
      ).rejects.toThrow(
        new ConflictException('A closed change request cannot be approved.'),
      );

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when status is CANCELLED', async () => {
      mockChangeRequestWithStatus('CANCELLED');

      await expect(
        service.approveChangeRequest(ctx, projectId, changeRequestId),
      ).rejects.toThrow(
        new ConflictException('A cancelled change request cannot be approved.'),
      );

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('approves a SUBMITTED change request', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.SUBMITTED);
      prisma.projectChangeRequest.update.mockResolvedValue(
        buildChangeRequest(ProjectChangeRequestStatus.APPROVED),
      );

      const result = await service.approveChangeRequest(
        ctx,
        projectId,
        changeRequestId,
      );

      expect(prisma.projectChangeRequest.update).toHaveBeenCalledWith({
        where: { id: changeRequestId },
        data: {
          status: ProjectChangeRequestStatus.APPROVED,
          updatedBy: ctx.userId,
        },
      });
      expect(result.status).toBe(ProjectChangeRequestStatus.APPROVED);
    });
  });

  describe('rejectChangeRequest', () => {
    it('throws ConflictException when status is APPROVED', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.APPROVED);

      await expect(
        service.rejectChangeRequest(ctx, projectId, changeRequestId, {
          reason: 'Out of scope',
        }),
      ).rejects.toThrow(
        new ConflictException(
          'An approved change request cannot be rejected.',
        ),
      );

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when status is REJECTED', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.REJECTED);

      await expect(
        service.rejectChangeRequest(ctx, projectId, changeRequestId, {
          reason: 'Out of scope',
        }),
      ).rejects.toThrow(
        new ConflictException('Change request is already rejected.'),
      );

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('throws ConflictException when status is CANCELLED', async () => {
      mockChangeRequestWithStatus('CANCELLED');

      await expect(
        service.rejectChangeRequest(ctx, projectId, changeRequestId, {
          reason: 'Out of scope',
        }),
      ).rejects.toThrow(
        new ConflictException('Cannot reject a cancelled change request.'),
      );

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('rejects a SUBMITTED change request', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.SUBMITTED);
      prisma.projectChangeRequest.update.mockResolvedValue(
        buildChangeRequest(ProjectChangeRequestStatus.REJECTED),
      );

      const result = await service.rejectChangeRequest(
        ctx,
        projectId,
        changeRequestId,
        { reason: 'Out of scope' },
      );

      expect(prisma.projectChangeRequest.update).toHaveBeenCalledWith({
        where: { id: changeRequestId },
        data: {
          status: ProjectChangeRequestStatus.REJECTED,
          description:
            'Original scope note\n\nRejection reason: Out of scope',
          updatedBy: ctx.userId,
        },
      });
      expect(result.status).toBe(ProjectChangeRequestStatus.REJECTED);
    });
  });
});
