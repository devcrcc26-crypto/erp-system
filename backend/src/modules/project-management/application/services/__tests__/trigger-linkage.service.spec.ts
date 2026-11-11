import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  ExternalReviewTriggerMode,
  ExternalReviewTriggerStatus,
  ExternalReviewTriggerType,
  IssueStatus,
  ProjectChangeRequestStatus,
  RfiStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../../shared/prisma/prisma.service';
import { DesignPackageRepository } from '../../../infrastructure/repositories/epc-storage.repository';
import { EpcSubmittalRepository } from '../../../infrastructure/repositories/epc-submittal.repository';
import { PmContext } from '../../types/pm-context.type';
import { ConfigureRevisionTriggerDto } from '../../dtos/pm.dtos';
import { DisciplineScopeService } from '../discipline-scope.service';
import { EngineeringDocumentFolderService } from '../engineering-document-folder.service';
import { ExternalReviewTriggerService } from '../external-review-trigger.service';
import { IssuesService } from '../issues.service';
import { ProjectChangeRequestService } from '../project-change-request.service';
import { ProjectScopeService } from '../project-scope.service';
import { RevisionOrchestratorService } from '../revision-orchestrator.service';
import { RfisService } from '../rfis.service';

describe('Trigger linkage (trigger-linkage)', () => {
  const companyId = 'company-1';
  const projectId = 'project-1';
  const packageId = 'package-1';
  const taskDisciplineId = 'discipline-1';
  const leaderUserId = 'user-lead';
  const nonLeaderUserId = 'user-designer';
  const rfiId = 'rfi-1';
  const issueId = 'issue-1';
  const changeRequestId = 'cr-1';
  const triggerId = 'trigger-1';

  const ctx: PmContext = { companyId, userId: leaderUserId };
  const leaderCtx: PmContext = { companyId, userId: leaderUserId };
  const nonLeaderCtx: PmContext = { companyId, userId: nonLeaderUserId };

  describe('entity event trigger creation', () => {
    let epcSubmittalRepository: { createLinkedEntityTrigger: jest.Mock };

    beforeEach(() => {
      epcSubmittalRepository = {
        createLinkedEntityTrigger: jest.fn().mockResolvedValue(triggerId),
      };
    });

    it('1. RFI answered + linkedDesignPackageId → trigger created PENDING', async () => {
      const tx = {
        rfi: {
          findFirst: jest.fn(),
          update: jest.fn(),
        },
        rfiResponse: {
          create: jest.fn().mockResolvedValue({
            id: 'response-1',
            rfiId,
            respondedBy: leaderUserId,
            responseText: 'Answer',
            respondedAt: new Date(),
            createdAt: new Date(),
          }),
        },
      };
      const prisma = {
        ...tx,
        rfi: {
          findFirst: jest.fn().mockResolvedValue({
            id: rfiId,
            projectId,
            status: RfiStatus.UNDER_REVIEW,
            assignedTo: leaderUserId,
            linkedDesignPackageId: packageId,
          }),
          update: jest.fn(),
        },
        rfiResponse: tx.rfiResponse,
        $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
      };

      const service = new RfisService(
        prisma as unknown as PrismaService,
        { getProjectOrThrow: jest.fn() } as unknown as ProjectScopeService,
        {
          hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
        } as unknown as DisciplineScopeService,
        {} as unknown as EngineeringDocumentFolderService,
        epcSubmittalRepository as unknown as EpcSubmittalRepository,
        {
          getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
        } as never,
      );

      await service.addRfiResponse(leaderCtx, projectId, rfiId, {
        responseText: 'Answer',
      });

      expect(epcSubmittalRepository.createLinkedEntityTrigger).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          companyId,
          projectId,
          triggerType: ExternalReviewTriggerType.RFI,
          sourceEntityType: 'RFI',
          sourceEntityId: rfiId,
          linkedDesignPackageId: packageId,
          createdBy: leaderUserId,
        }),
      );
    });

    it('2. RFI answered + no link → no trigger', async () => {
      const tx = {
        rfi: {
          update: jest.fn(),
        },
        rfiResponse: {
          create: jest.fn().mockResolvedValue({
            id: 'response-1',
            rfiId,
            respondedBy: leaderUserId,
            responseText: 'Answer',
            respondedAt: new Date(),
            createdAt: new Date(),
          }),
        },
      };
      const prisma = {
        rfi: {
          findFirst: jest.fn().mockResolvedValue({
            id: rfiId,
            projectId,
            status: RfiStatus.UNDER_REVIEW,
            assignedTo: leaderUserId,
            linkedDesignPackageId: null,
          }),
          update: tx.rfi.update,
        },
        rfiResponse: tx.rfiResponse,
        $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
      };

      const service = new RfisService(
        prisma as unknown as PrismaService,
        { getProjectOrThrow: jest.fn() } as unknown as ProjectScopeService,
        {
          hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
        } as unknown as DisciplineScopeService,
        {} as unknown as EngineeringDocumentFolderService,
        epcSubmittalRepository as unknown as EpcSubmittalRepository,
        {
          getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
        } as never,
      );

      await service.addRfiResponse(leaderCtx, projectId, rfiId, {
        responseText: 'Answer',
      });

      expect(epcSubmittalRepository.createLinkedEntityTrigger).not.toHaveBeenCalled();
    });

    it('3. Issue CLOSED + link → trigger created', async () => {
      const tx = {
        issue: {
          update: jest.fn().mockResolvedValue({
            id: issueId,
            status: IssueStatus.CLOSED,
          }),
        },
      };
      const prisma = {
        issue: {
          findFirst: jest.fn().mockResolvedValue({
            id: issueId,
            projectId,
            status: IssueStatus.IN_PROGRESS,
            raisedBy: leaderCtx.userId,
            assignedTo: 'assignee-1',
            linkedDesignPackageId: packageId,
          }),
          update: tx.issue.update,
        },
        $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
      };

      const service = new IssuesService(
        prisma as unknown as PrismaService,
        { getProjectOrThrow: jest.fn() } as unknown as ProjectScopeService,
        {
          hasDisciplineScopeBypass: jest.fn().mockResolvedValue(true),
        } as unknown as DisciplineScopeService,
        {
          findEntityFolder: jest.fn().mockResolvedValue(null),
        } as unknown as EngineeringDocumentFolderService,
        epcSubmittalRepository as unknown as EpcSubmittalRepository,
        {
          getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
        } as never,
      );

      await service.closeIssue(leaderCtx, projectId, issueId, {
        resolutionNote: 'Verified on site',
      });

      expect(epcSubmittalRepository.createLinkedEntityTrigger).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          triggerType: ExternalReviewTriggerType.ISSUE,
          sourceEntityType: 'ISSUE',
          sourceEntityId: issueId,
          linkedDesignPackageId: packageId,
        }),
      );
    });

    it('4. CR APPROVED + link → trigger created', async () => {
      const tx = {
        projectChangeRequest: {
          update: jest.fn().mockResolvedValue({
            id: changeRequestId,
            status: ProjectChangeRequestStatus.APPROVED,
            changeReason: null,
            attachmentFolderId: null,
            assignedTo: null,
            affectedEdvIds: [],
            affectedEdvSnapshot: [],
            linkedDesignPackageId: packageId,
            createdBy: ctx.userId,
            sourceType: 'MANUAL',
            sourceEntityId: null,
            externalReviewTriggerId: null,
            originEntityType: null,
            originEntityId: null,
            changeNumber: 'CR-001',
            title: 'CR',
            description: null,
            companyId,
            projectId,
            createdAt: new Date(),
            updatedAt: new Date(),
            updatedBy: ctx.userId,
            deletedAt: null,
            deletedBy: null,
          }),
        },
        reviewSession: { findMany: jest.fn().mockResolvedValue([]) },
        engineeringDocumentVersion: { updateMany: jest.fn() },
        designPackage: {
          findFirst: jest.fn().mockResolvedValue({
            id: packageId,
            packageCode: 'PKG',
            name: 'Package',
          }),
          update: jest.fn(),
        },
      };
      const prisma = {
        projectChangeRequest: {
          findFirst: jest.fn().mockResolvedValue({
            id: changeRequestId,
            companyId,
            projectId,
            status: ProjectChangeRequestStatus.SUBMITTED,
            linkedDesignPackageId: packageId,
            assignedTo: ctx.userId,
            affectedEdvIds: [],
            affectedEdvSnapshot: [],
            changeReason: 'CLIENT_REQUEST',
            attachmentFolderId: null,
            createdBy: ctx.userId,
            sourceType: 'MANUAL',
            sourceEntityId: null,
            externalReviewTriggerId: null,
            originEntityType: null,
            originEntityId: null,
            changeNumber: 'CR-001',
            title: 'CR',
            description: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            updatedBy: ctx.userId,
            deletedAt: null,
            deletedBy: null,
          }),
          update: tx.projectChangeRequest.update,
        },
        designPackage: tx.designPackage,
        $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) =>
          work(tx),
        ),
      };

      const service = new ProjectChangeRequestService(
        prisma as unknown as PrismaService,
        { getProjectOrThrow: jest.fn() } as unknown as ProjectScopeService,
        {} as never,
        {
          getUserRoleNames: jest.fn().mockResolvedValue(['System Administrator']),
        } as never,
        { closeSessionAsSuperseded: jest.fn() } as never,
      );

      await service.approveChangeRequest(ctx, projectId, changeRequestId);

      expect(tx.projectChangeRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: changeRequestId },
          data: expect.objectContaining({
            status: ProjectChangeRequestStatus.APPROVED,
          }),
        }),
      );
      expect(tx.designPackage.update).toHaveBeenCalledWith({
        where: { id: packageId },
        data: expect.objectContaining({
          packageStatus: DesignPackageStatus.OPEN,
          projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
        }),
      });
    });
  });

  describe('RevisionOrchestratorService.processExternalReviewTrigger', () => {
    let epcSubmittalRepository: {
      findExternalTriggerById: jest.Mock;
      findEngineeringDocumentIdsForPackage: jest.Mock;
      documentHasDraftEdv: jest.Mock;
      updateTriggerStatus: jest.Mock;
      findPackageTaskDisciplineId: jest.Mock;
    };
    let designPackageRepository: { createRevisionPackageFromTrigger: jest.Mock };
    let orchestrator: RevisionOrchestratorService;
    let triggerRevision: jest.Mock;

    const baseTrigger = {
      id: triggerId,
      companyId,
      projectId,
      triggerType: ExternalReviewTriggerType.RFI,
      sourceEntityType: 'RFI',
      sourceEntityId: rfiId,
      status: ExternalReviewTriggerStatus.PENDING,
      triggerMode: ExternalReviewTriggerMode.REVISION,
      submittalItemIds: [],
      linkedDesignPackageId: packageId,
    };

    beforeEach(() => {
      epcSubmittalRepository = {
        findExternalTriggerById: jest.fn().mockResolvedValue(baseTrigger),
        findEngineeringDocumentIdsForPackage: jest
          .fn()
          .mockResolvedValue(['doc-1', 'doc-2']),
        documentHasDraftEdv: jest.fn().mockResolvedValue(false),
        updateTriggerStatus: jest.fn().mockResolvedValue(undefined),
        findPackageTaskDisciplineId: jest.fn().mockResolvedValue(taskDisciplineId),
      };
      designPackageRepository = {
        createRevisionPackageFromTrigger: jest.fn().mockResolvedValue({
          id: 'new-package-1',
          packageStatus: DesignPackageStatus.OPEN,
        }),
      };
      triggerRevision = jest.fn();

      orchestrator = new RevisionOrchestratorService(
        {} as never,
        epcSubmittalRepository as unknown as EpcSubmittalRepository,
        designPackageRepository as unknown as DesignPackageRepository,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      jest
        .spyOn(orchestrator, 'triggerRevision')
        .mockImplementation(triggerRevision);
    });

    it('5. process REVISION → new DRAFT EDVs from LOCKED sources', async () => {
      triggerRevision
        .mockResolvedValueOnce({ commandType: 'TriggerRevision', newEdvId: 'edv-1' })
        .mockResolvedValueOnce({ commandType: 'TriggerRevision', newEdvId: 'edv-2' });

      const result = await orchestrator.processExternalReviewTrigger(ctx, triggerId);

      expect(triggerRevision).toHaveBeenCalledTimes(2);
      expect(result.triggerStatus).toBe(ExternalReviewTriggerStatus.PROCESSED);
      expect(result.revision?.succeeded).toHaveLength(2);
      expect(epcSubmittalRepository.updateTriggerStatus).toHaveBeenCalledWith(
        companyId,
        triggerId,
        leaderUserId,
        ExternalReviewTriggerStatus.PROCESSED,
      );
    });

    it('6. process NEW_PACKAGE → new empty DesignPackage, no EDVs', async () => {
      epcSubmittalRepository.findExternalTriggerById.mockResolvedValue({
        ...baseTrigger,
        triggerMode: ExternalReviewTriggerMode.NEW_PACKAGE,
      });

      const result = await orchestrator.processExternalReviewTrigger(ctx, triggerId);

      expect(designPackageRepository.createRevisionPackageFromTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId,
          taskDisciplineId,
          sourceEntityType: 'RFI',
          sourceEntityId: rfiId,
        }),
      );
      expect(triggerRevision).not.toHaveBeenCalled();
      expect(result.newPackageId).toBe('new-package-1');
      expect(result.triggerStatus).toBe(ExternalReviewTriggerStatus.PROCESSED);
    });

    it('9. REVISION: document already has DRAFT → skipped, others processed', async () => {
      epcSubmittalRepository.documentHasDraftEdv.mockImplementation(
        (_companyId: string, documentId: string) =>
          Promise.resolve(documentId === 'doc-1'),
      );
      triggerRevision.mockResolvedValue({
        commandType: 'TriggerRevision',
        newEdvId: 'edv-2',
      });

      const result = await orchestrator.processExternalReviewTrigger(ctx, triggerId);

      expect(triggerRevision).toHaveBeenCalledTimes(1);
      expect(result.revision?.skipped).toEqual(['doc-1']);
      expect(result.revision?.succeeded).toHaveLength(1);
      expect(result.triggerStatus).toBe(ExternalReviewTriggerStatus.PROCESSED);
    });

    it('10. REVISION: one document fails → PARTIAL, others still processed', async () => {
      triggerRevision
        .mockResolvedValueOnce({ commandType: 'TriggerRevision', newEdvId: 'edv-1' })
        .mockRejectedValueOnce(new BadRequestException('No LOCKED source'));

      const result = await orchestrator.processExternalReviewTrigger(ctx, triggerId);

      expect(result.triggerStatus).toBe(ExternalReviewTriggerStatus.PARTIAL);
      expect(result.revision?.succeeded).toHaveLength(1);
      expect(result.revision?.failed).toHaveLength(1);
      expect(epcSubmittalRepository.updateTriggerStatus).toHaveBeenCalledWith(
        companyId,
        triggerId,
        leaderUserId,
        ExternalReviewTriggerStatus.PARTIAL,
      );
    });

    it('11. REVISION: all fail → FAILED', async () => {
      triggerRevision.mockRejectedValue(new BadRequestException('No LOCKED source'));

      const result = await orchestrator.processExternalReviewTrigger(ctx, triggerId);

      expect(result.triggerStatus).toBe(ExternalReviewTriggerStatus.FAILED);
      expect(result.revision?.succeeded).toHaveLength(0);
      expect(result.revision?.failed).toHaveLength(2);
    });

    it('12. REVISION: all succeed → PROCESSED', async () => {
      triggerRevision.mockResolvedValue({ commandType: 'TriggerRevision', newEdvId: 'edv-x' });

      const result = await orchestrator.processExternalReviewTrigger(ctx, triggerId);

      expect(result.triggerStatus).toBe(ExternalReviewTriggerStatus.PROCESSED);
      expect(result.revision?.failed).toHaveLength(0);
    });
  });

  describe('ExternalReviewTriggerService.configureTriggerMode', () => {
    let prisma: {
      externalReviewTrigger: { findFirst: jest.Mock };
    };
    let epcSubmittalRepository: {
      findPackageDisciplineLeadUserId: jest.Mock;
      updateTriggerMode: jest.Mock;
    };
    let service: ExternalReviewTriggerService;

    const pendingTrigger = {
      id: triggerId,
      companyId,
      projectId,
      triggerType: ExternalReviewTriggerType.RFI,
      sourceEntityType: 'RFI',
      sourceEntityId: rfiId,
      submittalId: null,
      linkedDesignPackageId: packageId,
      triggerMode: ExternalReviewTriggerMode.REVISION,
      status: ExternalReviewTriggerStatus.PENDING,
      createdAt: new Date('2026-06-26T00:00:00.000Z'),
      payload: {},
    };

    beforeEach(() => {
      prisma = {
        externalReviewTrigger: {
          findFirst: jest
            .fn()
            .mockResolvedValueOnce(pendingTrigger)
            .mockResolvedValueOnce({
              ...pendingTrigger,
              triggerMode: ExternalReviewTriggerMode.NEW_PACKAGE,
            }),
        },
      };
      epcSubmittalRepository = {
        findPackageDisciplineLeadUserId: jest.fn().mockResolvedValue(leaderUserId),
        updateTriggerMode: jest.fn().mockResolvedValue(undefined),
      };
      service = new ExternalReviewTriggerService(
        prisma as unknown as PrismaService,
        epcSubmittalRepository as unknown as EpcSubmittalRepository,
        {} as never,
        { getProjectOrThrow: jest.fn() } as unknown as ProjectScopeService,
      );
    });

    it('7. configure to NEW_PACKAGE non-leader → ForbiddenException', async () => {
      await expect(
        service.configureTriggerMode(
          nonLeaderCtx,
          projectId,
          triggerId,
          { triggerMode: 'NEW_PACKAGE' } as ConfigureRevisionTriggerDto,
        ),
      ).rejects.toThrow(ForbiddenException);
      expect(epcSubmittalRepository.updateTriggerMode).not.toHaveBeenCalled();
    });

    it('8. configure to NEW_PACKAGE leader → triggerMode updated', async () => {
      const result = await service.configureTriggerMode(
        leaderCtx,
        projectId,
        triggerId,
        { triggerMode: 'NEW_PACKAGE' } as ConfigureRevisionTriggerDto,
      );

      expect(epcSubmittalRepository.updateTriggerMode).toHaveBeenCalledWith(
        companyId,
        triggerId,
        ExternalReviewTriggerMode.NEW_PACKAGE,
      );
      expect(result.triggerMode).toBe(ExternalReviewTriggerMode.NEW_PACKAGE);
    });
  });
});
