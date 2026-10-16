import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ProjectChangeRequest,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
  DesignPackageProjectedStatus,
  DesignPackageStatus,
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
      count: jest.Mock;
    };
    reviewSession: { findMany: jest.Mock };
    engineeringDocumentVersion: { updateMany: jest.Mock };
    designPackage: { findFirst: jest.Mock; findMany: jest.Mock; update: jest.Mock };
    $transaction: jest.Mock;
  };
  let permissionService: { getUserRoleNames: jest.Mock };
  let notificationService: { send: jest.Mock };
  let service: ProjectChangeRequestService;

  const defaultPackageLookup = {
    id: 'pkg-1',
    packageCode: 'LJZ-GEO-001',
    name: 'Geotech',
    taskDisciplineId: 'discipline-1',
    designerUserId: 'designer-user',
    subtaskIndex: 3,
    taskDiscipline: {
      disciplineIndex: 1,
      task: { overseasTaskNumber: '26-ETO-035' },
    },
  };

  function createService(): ProjectChangeRequestService {
    return new ProjectChangeRequestService(
      prisma as unknown as PrismaService,
      {
        getProjectOrThrow: jest.fn().mockResolvedValue({ id: projectId }),
      } as unknown as ProjectScopeService,
      {} as unknown as EngineeringDocumentFolderService,
      permissionService as unknown as PermissionService,
      {
        closeSessionAsSuperseded: jest.fn(),
      } as unknown as EpcReviewRepository,
      notificationService as never,
    );
  }

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
      createdBy: 'creator-user',
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedBy: ctx.userId,
      deletedAt: null,
      deletedBy: null,
    };
  }

  beforeEach(() => {
    notificationService = {
      send: jest.fn().mockResolvedValue({ inAppId: 'notif-1', emailQueued: false }),
    };

    prisma = {
      projectChangeRequest: {
        findFirst: jest.fn(),
        update: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      reviewSession: { findMany: jest.fn().mockResolvedValue([]) },
      engineeringDocumentVersion: { updateMany: jest.fn() },
      designPackage: {
        findFirst: jest.fn().mockResolvedValue(defaultPackageLookup),
        findMany: jest.fn(),
        update: jest.fn(),
      },
      $transaction: jest.fn(async (work: (tx: typeof prisma) => Promise<unknown>) =>
        work(prisma),
      ),
    };

    permissionService = {
      getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
    };

    service = createService();
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
      expect(prisma.designPackage.update).toHaveBeenCalledWith({
        where: { id: 'pkg-1' },
        data: {
          packageStatus: DesignPackageStatus.OPEN,
          projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
          packageClosedAt: null,
          packageClosedBy: null,
          updatedBy: ctx.userId,
        },
      });
      expect(result.status).toBe(ProjectChangeRequestStatus.APPROVED);
    });

    it('sends revision notification to designer on approve', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.SUBMITTED);
      prisma.projectChangeRequest.update.mockResolvedValue(
        buildChangeRequest(ProjectChangeRequestStatus.APPROVED),
      );

      await service.approveChangeRequest(ctx, projectId, changeRequestId);

      expect(notificationService.send).toHaveBeenCalledWith(
        { companyId: ctx.companyId, userId: ctx.userId },
        expect.objectContaining({
          recipientId: 'designer-user',
          eventType: 'change_request.approved_revision_required',
          subject: 'Revision required - CR-LJZ-GEO-001-001 approved',
          body: expect.stringContaining(
            '/projects/project-1/disciplines/discipline-1/packages/pkg-1',
          ),
        }),
      );
    });

    it('sends approved notification to creator when different from designer', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.SUBMITTED);
      prisma.projectChangeRequest.update.mockResolvedValue(
        buildChangeRequest(ProjectChangeRequestStatus.APPROVED),
      );

      await service.approveChangeRequest(ctx, projectId, changeRequestId);

      expect(notificationService.send).toHaveBeenCalledTimes(2);
      expect(notificationService.send).toHaveBeenCalledWith(
        { companyId: ctx.companyId, userId: ctx.userId },
        expect.objectContaining({
          recipientId: 'creator-user',
          eventType: 'change_request.approved_creator',
          subject: 'CR CR-LJZ-GEO-001-001 approved',
          body: expect.stringContaining('/projects/project-1/change-requests'),
        }),
      );
    });

    it('does not send duplicate when creator = designer', async () => {
      prisma.projectChangeRequest.findFirst.mockResolvedValue({
        ...buildChangeRequest(ProjectChangeRequestStatus.SUBMITTED),
        createdBy: 'designer-user',
      });
      prisma.projectChangeRequest.update.mockResolvedValue(
        buildChangeRequest(ProjectChangeRequestStatus.APPROVED),
      );

      await service.approveChangeRequest(ctx, projectId, changeRequestId);

      expect(notificationService.send).toHaveBeenCalledTimes(1);
      expect(notificationService.send).toHaveBeenCalledWith(
        { companyId: ctx.companyId, userId: ctx.userId },
        expect.objectContaining({
          recipientId: 'designer-user',
          eventType: 'change_request.approved_revision_required',
        }),
      );
    });

    it('does not notify approver about their own action', async () => {
      prisma.projectChangeRequest.findFirst.mockResolvedValue({
        ...buildChangeRequest(ProjectChangeRequestStatus.SUBMITTED),
        createdBy: 'creator-user',
      });
      prisma.designPackage.findFirst.mockResolvedValue({
        ...defaultPackageLookup,
        designerUserId: ctx.userId,
      });
      prisma.projectChangeRequest.update.mockResolvedValue(
        buildChangeRequest(ProjectChangeRequestStatus.APPROVED),
      );

      await service.approveChangeRequest(ctx, projectId, changeRequestId);

      expect(notificationService.send).toHaveBeenCalledTimes(1);
      expect(notificationService.send).toHaveBeenCalledWith(
        { companyId: ctx.companyId, userId: ctx.userId },
        expect.objectContaining({
          recipientId: 'creator-user',
          eventType: 'change_request.approved_creator',
        }),
      );
    });

    it('keeps CR approved when notification send fails', async () => {
      mockChangeRequestWithStatus(ProjectChangeRequestStatus.SUBMITTED);
      prisma.projectChangeRequest.update.mockResolvedValue(
        buildChangeRequest(ProjectChangeRequestStatus.APPROVED),
      );
      notificationService.send.mockRejectedValueOnce(new Error('notify failed'));

      const result = await service.approveChangeRequest(
        ctx,
        projectId,
        changeRequestId,
      );

      expect(result.status).toBe(ProjectChangeRequestStatus.APPROVED);
      expect(prisma.projectChangeRequest.update).toHaveBeenCalled();
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

  describe('previewNextCrNumber', () => {
    it('uses fullCode for CR number preview', async () => {
      prisma.designPackage.findFirst.mockResolvedValue({
        packageCode: 'LJZ-GEO-001',
        subtaskIndex: 3,
        taskDiscipline: {
          disciplineIndex: 1,
          task: { overseasTaskNumber: '26-ETO-035' },
        },
      });
      prisma.projectChangeRequest.count.mockResolvedValue(0);

      const result = await service.previewNextCrNumber(ctx, 'pkg-1');

      expect(result.changeNumber).toBe('CR-26-ETO-035-01-003-001');
    });

    it('increments sequence for second CR on same subtask', async () => {
      prisma.designPackage.findFirst.mockResolvedValue({
        packageCode: 'LJZ-GEO-001',
        subtaskIndex: 3,
        taskDiscipline: {
          disciplineIndex: 1,
          task: { overseasTaskNumber: '26-ETO-035' },
        },
      });
      prisma.projectChangeRequest.count.mockResolvedValue(1);

      const result = await service.previewNextCrNumber(ctx, 'pkg-1');

      expect(result.changeNumber).toBe('CR-26-ETO-035-01-003-002');
    });
  });

  describe('listEligibleSubtasks', () => {
    it('returns fullCode on each subtask option', async () => {
      prisma.designPackage.findMany.mockResolvedValue([
        {
          id: 'pkg-1',
          packageCode: 'LJZ-GEO-001',
          name: 'Geological Survey',
          subtaskIndex: 3,
          taskDiscipline: {
            disciplineIndex: 1,
            task: { overseasTaskNumber: '26-ETO-035' },
          },
        },
      ]);

      const result = await service.listEligibleSubtasks(ctx, projectId);

      expect(result).toEqual([
        {
          id: 'pkg-1',
          packageCode: 'LJZ-GEO-001',
          name: 'Geological Survey',
          fullCode: '26-ETO-035-01-003',
        },
      ]);
      expect(prisma.designPackage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            items: expect.objectContaining({
              some: expect.objectContaining({
                engineeringDocumentVersion: expect.objectContaining({
                  isCurrent: true,
                  status: { not: 'DRAFT' },
                }),
              }),
            }),
          }),
        }),
      );
    });
  });
});
