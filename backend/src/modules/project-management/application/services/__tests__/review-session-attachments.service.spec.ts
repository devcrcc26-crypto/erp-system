import { BadRequestException, ForbiddenException } from '@nestjs/common';
import {
  ReviewSessionStatus,
  ReviewTier,
} from '@prisma/client';
import { EpcReviewRepository } from '../../../infrastructure/repositories/epc-review.repository';
import { ConflictGuardService } from '../conflict-guard.service';
import { DefinitionOfDoneService } from '../definition-of-done.service';
import { EdvTransitionService } from '../edv-transition.service';
import { PermissionResolverService } from '../permission-resolver.service';
import { ReviewContextSnapshotService } from '../review-context-snapshot.service';
import { ReviewRoutingService } from '../review-routing.service';
import { ReviewSlaService } from '../review-sla.service';
import { ReviewWorkflowService } from '../review-workflow.service';
import { StateProjectionService } from '../state-projection.service';
import { WorkflowTransactionRunner } from '../workflow-transaction-runner.service';
import { EpcWorkflowRepository } from '../../../infrastructure/repositories/epc-workflow.repository';

describe('review-session-attachments', () => {
  const companyId = 'company-1';
  const designPackageId = 'package-1';
  const reviewSessionId = 'session-1';
  const currentAssigneeId = 'user-tier-2';
  const priorTierActorId = 'user-tier-1';
  const unrelatedUserId = 'user-unrelated';
  const documentId = 'document-1';

  const activeSession = {
    id: reviewSessionId,
    companyId,
    designPackageId,
    taskDisciplineId: 'discipline-1',
    status: ReviewSessionStatus.ACTIVE,
    currentTier: ReviewTier.DISCIPLINE_LEAD,
    assignedToUserId: currentAssigneeId,
  };

  const attachmentRow = {
    id: 'attachment-1',
    companyId,
    reviewSessionId,
    tier: ReviewTier.DISCIPLINE_OWNER,
    attachedByUserId: priorTierActorId,
    documentId,
    attachedAt: new Date('2026-01-01T10:00:00.000Z'),
    purpose: 'markup',
    note: 'Tier 1 comments',
    deletedAt: null,
    deletedBy: null,
    attachedByUser: {
      id: priorTierActorId,
      firstName: 'Tier',
      lastName: 'One',
    },
    document: { id: documentId, name: 'Markup.pdf' },
  };

  const tier2AttachmentRow = {
    ...attachmentRow,
    id: 'attachment-2',
    tier: ReviewTier.DISCIPLINE_LEAD,
    attachedByUserId: currentAssigneeId,
    attachedAt: new Date('2026-01-02T10:00:00.000Z'),
    attachedByUser: {
      id: currentAssigneeId,
      firstName: 'Tier',
      lastName: 'Two',
    },
  };

  let epcReviewRepository: {
    findSessionForCompany: jest.Mock;
    findDocumentForCompany: jest.Mock;
    createSessionAttachment: jest.Mock;
    listSessionAttachments: jest.Mock;
  };
  let service: ReviewWorkflowService;

  beforeEach(() => {
    epcReviewRepository = {
      findSessionForCompany: jest.fn().mockResolvedValue(activeSession),
      findDocumentForCompany: jest.fn().mockResolvedValue({ id: documentId }),
      createSessionAttachment: jest.fn().mockResolvedValue({
        ...attachmentRow,
        tier: ReviewTier.DISCIPLINE_LEAD,
        attachedByUserId: currentAssigneeId,
        attachedByUser: {
          id: currentAssigneeId,
          firstName: 'Tier',
          lastName: 'Two',
        },
      }),
      listSessionAttachments: jest.fn(),
    };

    service = new ReviewWorkflowService(
      {} as unknown as EpcWorkflowRepository,
      epcReviewRepository as unknown as EpcReviewRepository,
      {} as never,
      {} as unknown as EdvTransitionService,
      {} as unknown as ConflictGuardService,
      {} as unknown as DefinitionOfDoneService,
      {} as unknown as PermissionResolverService,
      {} as unknown as ReviewContextSnapshotService,
      {} as unknown as ReviewRoutingService,
      {} as unknown as ReviewSlaService,
      {} as unknown as StateProjectionService,
      {} as unknown as WorkflowTransactionRunner,
      {} as never,
    );
  });

  it('1. current tier actor attaches file → succeeds, tier label correct', async () => {
    const result = await service.addSessionAttachment({
      companyId,
      actorId: currentAssigneeId,
      designPackageId,
      reviewSessionId,
      documentId,
      purpose: 'markup',
    });

    expect(epcReviewRepository.createSessionAttachment).toHaveBeenCalledWith({
      companyId,
      reviewSessionId,
      tier: ReviewTier.DISCIPLINE_LEAD,
      attachedByUserId: currentAssigneeId,
      documentId,
      purpose: 'markup',
      note: undefined,
    });
    expect(result.tier).toBe(ReviewTier.DISCIPLINE_LEAD);
    expect(result.document.name).toBe('Markup.pdf');
  });

  it('2. non-current-tier actor attaches → ForbiddenException', async () => {
    await expect(
      service.addSessionAttachment({
        companyId,
        actorId: priorTierActorId,
        designPackageId,
        reviewSessionId,
        documentId,
      }),
    ).rejects.toThrow(
      new ForbiddenException(
        "Only the current tier's reviewer can attach files during their review.",
      ),
    );

    expect(epcReviewRepository.createSessionAttachment).not.toHaveBeenCalled();
  });

  it('3. user not on session attaches → ForbiddenException', async () => {
    await expect(
      service.addSessionAttachment({
        companyId,
        actorId: unrelatedUserId,
        designPackageId,
        reviewSessionId,
        documentId,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(epcReviewRepository.createSessionAttachment).not.toHaveBeenCalled();
  });

  it('4. attach to APPROVED session → BadRequestException', async () => {
    epcReviewRepository.findSessionForCompany.mockResolvedValue({
      ...activeSession,
      status: ReviewSessionStatus.APPROVED,
      assignedToUserId: currentAssigneeId,
    });

    await expect(
      service.addSessionAttachment({
        companyId,
        actorId: currentAssigneeId,
        designPackageId,
        reviewSessionId,
        documentId,
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Attachments can only be added to an active review session',
      ),
    );
  });

  it('5. attach to RETURNED_FOR_REWORK session → BadRequestException', async () => {
    epcReviewRepository.findSessionForCompany.mockResolvedValue({
      ...activeSession,
      status: ReviewSessionStatus.RETURNED_FOR_REWORK,
      assignedToUserId: currentAssigneeId,
    });

    await expect(
      service.addSessionAttachment({
        companyId,
        actorId: currentAssigneeId,
        designPackageId,
        reviewSessionId,
        documentId,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('6. GET includes attachments from all previous tiers', async () => {
    epcReviewRepository.listSessionAttachments.mockResolvedValue([
      attachmentRow,
      tier2AttachmentRow,
    ]);

    const result = await service.listSessionAttachments({
      companyId,
      designPackageId,
      reviewSessionId,
    });

    expect(result).toHaveLength(2);
    expect(result[0]?.tier).toBe(ReviewTier.DISCIPLINE_OWNER);
    expect(result[1]?.tier).toBe(ReviewTier.DISCIPLINE_LEAD);
  });

  it('7. tier 2 can see tier 1 attachment when session is at tier 2', async () => {
    epcReviewRepository.listSessionAttachments.mockResolvedValue([
      attachmentRow,
      tier2AttachmentRow,
    ]);

    const result = await service.listSessionAttachments({
      companyId,
      designPackageId,
      reviewSessionId,
    });

    expect(result.map((a) => a.tier)).toEqual([
      ReviewTier.DISCIPLINE_OWNER,
      ReviewTier.DISCIPLINE_LEAD,
    ]);
    expect(result[0]?.attachedByUser.name).toBe('Tier One');
  });

  it('8. attachment carries correct tier label', async () => {
    epcReviewRepository.createSessionAttachment.mockResolvedValue(attachmentRow);

    epcReviewRepository.findSessionForCompany.mockResolvedValue({
      ...activeSession,
      currentTier: ReviewTier.DISCIPLINE_OWNER,
      assignedToUserId: priorTierActorId,
    });

    const result = await service.addSessionAttachment({
      companyId,
      actorId: priorTierActorId,
      designPackageId,
      reviewSessionId,
      documentId,
    });

    expect(result.tier).toBe(ReviewTier.DISCIPLINE_OWNER);
    expect(epcReviewRepository.createSessionAttachment).toHaveBeenCalledWith(
      expect.objectContaining({ tier: ReviewTier.DISCIPLINE_OWNER }),
    );
  });
});
