import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ProjectChangeRequest,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
} from '@prisma/client';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { EpcReviewRepository } from '../../../infrastructure/repositories/epc-review.repository';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ProjectChangeRequestService } from '../project-change-request.service';
import { ProjectScopeService } from '../project-scope.service';
import { PmContext } from '../../types/pm-context.type';

describe('ProjectChangeRequestService status transitions', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'user-1' };
  const projectId = 'project-1';
  const changeRequestId = 'change-request-1';

  let prisma: {
    projectChangeRequest: {
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    reviewSession: { findMany: jest.Mock };
    engineeringDocumentVersion: { updateMany: jest.Mock };
    designPackage: { findFirst: jest.Mock };
    $transaction: jest.Mock;
  };
  let permissionService: { getUserRoleNames: jest.Mock };
  let service: ProjectChangeRequestService;

  function buildChangeRequest(status: string): ProjectChangeRequest {
    return {
      id: changeRequestId,
      companyId: ctx.companyId,
      projectId,
      changeNumber: 'CR-LJZ-GEO-001-001',
      title: 'Additional foundation work',
      description: 'Original scope note',
      status: status as ProjectChangeRequestStatus,
      sourceType: ProjectChangeRequestSource.MANUAL,
      sourceEntityId: null,
      originEntityType: null,
      originEntityId: null,
      externalReviewTriggerId: null,
      linkedDesignPackageId: 'pkg-1',
      changeReason: 'CLIENT_REQUEST',
      attachmentFolderId: null,
      assignedTo: ctx.userId,
      affectedEdvIds: [],
      affectedEdvSnapshot: [],
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
      reviewSession: { findMany: jest.fn().mockResolvedValue([]) },
      engineeringDocumentVersion: { updateMany: jest.fn() },
      designPackage: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'pkg-1',
          packageCode: 'LJZ-GEO-001',
          name: 'Geotech',
        }),
      },
      $transaction: jest.fn(async (work: (tx: typeof prisma) => Promise<unknown>) =>
        work(prisma),
      ),
    };

    permissionService = {
      getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
    };

    service = new ProjectChangeRequestService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
      } as unknown as ProjectScopeService,
      {} as unknown as EngineeringDocumentFolderService,
      permissionService as unknown as PermissionService,
      {
        closeSessionAsSuperseded: jest.fn(),
      } as unknown as EpcReviewRepository,
    );
  });

  function mockChangeRequestWithStatus(status: string): void {
    prisma.projectChangeRequest.findFirst.mockResolvedValue(
      buildChangeRequest(status),
    );
  }

  describe('approveChangeRequest', () => {
    it('throws BadRequestException when status is APPROVED', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.APPROVED);

      await expect(
        service.approveChangeRequest(ctx, projectId, changeRequestId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when status is REJECTED', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.REJECTED);

      await expect(
        service.approveChangeRequest(ctx, projectId, changeRequestId),
      ).rejects.toThrow(BadRequestException);

      expect(prisma.projectChangeRequest.update).not.toHaveBeenCalled();
    });

    it('throws ForbiddenException when caller is not assignee', async () => {
      prisma.projectChangeRequest.findFirst.mockResolvedValue({
        ...buildChangeRequest(ProjectChangeRequestStatus.SUBMITTED),
        assignedTo: 'other-user',
      });
      permissionService.getUserRoleNames.mockResolvedValue(['Employee']);

      await expect(
        service.approveChangeRequest(ctx, projectId, changeRequestId),
      ).rejects.toThrow(ForbiddenException);
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
          assignedTo: null,
          updatedBy: ctx.userId,
        },
      });
      expect(result.status).toBe(ProjectChangeRequestStatus.REJECTED);
    });
  });
});
