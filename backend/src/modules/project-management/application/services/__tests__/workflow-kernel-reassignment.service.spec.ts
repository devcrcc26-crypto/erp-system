import {
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ReviewSessionStatus,
  ReviewTier,
  WorkflowEntityType,
} from '@prisma/client';
import { PermissionService } from '../../../../../shared/permissions/permission.service';
import { WorkflowKernelService } from '../workflow-kernel.service';
import { PmContext } from '../../types/pm-context.type';

describe('WorkflowKernelService reassignment', () => {
  const ctx: PmContext = { companyId: 'company-1', userId: 'admin-1' };
  const reviewSessionId = 'session-1';
  const newAssigneeUserId = 'user-2';
  const validReason = 'Reassigning due to leave of absence';

  const activeSession = {
    id: reviewSessionId,
    companyId: ctx.companyId,
    designPackageId: 'package-1',
    taskDisciplineId: 'discipline-1',
    status: ReviewSessionStatus.ACTIVE,
    outcome: 'PENDING',
    currentTier: ReviewTier.REVIEWER,
    assignedToUserId: 'user-1',
    openedAt: new Date('2026-06-01T00:00:00.000Z'),
    closedAt: null,
    closedReason: null,
    slaDeadlineAt: new Date('2026-06-02T00:00:00.000Z'),
    slaEscalatedAt: null,
    createdAt: new Date('2026-06-01T00:00:00.000Z'),
    createdBy: 'user-1',
    updatedAt: new Date('2026-06-01T00:00:00.000Z'),
    updatedBy: 'user-1',
    deletedAt: null,
    deletedBy: null,
    contextSnapshot: null,
    comments: [],
  };

  let permissionService: { getUserRoleNames: jest.Mock };
  let epcReviewRepository: {
    findSessionById: jest.Mock;
    updateReviewSession: jest.Mock;
    appendWorkflowIntentEvent: jest.Mock;
  };
  let workflowTransactionRunner: { runPhaseAB: jest.Mock };
  let tx: { user: { findFirst: jest.Mock } };
  let kernel: WorkflowKernelService;

  beforeEach(() => {
    permissionService = {
      getUserRoleNames: jest.fn(),
    };
    epcReviewRepository = {
      findSessionById: jest.fn(),
      updateReviewSession: jest.fn(),
      appendWorkflowIntentEvent: jest.fn(),
    };
    tx = {
      user: {
        findFirst: jest.fn(),
      },
    };
    workflowTransactionRunner = {
      runPhaseAB: jest.fn(async (work: (client: typeof tx) => Promise<void>) =>
        work(tx),
      ),
    };

    kernel = new WorkflowKernelService(
      {} as never,
      epcReviewRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      workflowTransactionRunner as never,
      permissionService as unknown as PermissionService,
    );
  });

  it('allows System Admin to reassign an ACTIVE session', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['System Administrator']);
    epcReviewRepository.findSessionById.mockResolvedValue(activeSession);
    tx.user.findFirst.mockResolvedValue({ id: newAssigneeUserId });
    epcReviewRepository.updateReviewSession.mockResolvedValue(activeSession);
    epcReviewRepository.appendWorkflowIntentEvent.mockResolvedValue(undefined);

    const result = await kernel.reassignReviewSession(ctx, {
      reviewSessionId,
      newAssigneeUserId,
      reason: validReason,
    });

    expect(result.correlationId).toBeDefined();
    expect(epcReviewRepository.updateReviewSession).toHaveBeenCalledWith(
      tx,
      reviewSessionId,
      expect.objectContaining({
        assignedToUser: { connect: { id: newAssigneeUserId } },
        updatedBy: ctx.userId,
      }),
    );
  });

  it('throws ForbiddenException for a non-admin user', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['Designer']);

    await expect(
      kernel.reassignReviewSession(ctx, {
        reviewSessionId,
        newAssigneeUserId,
        reason: validReason,
      }),
    ).rejects.toThrow(ForbiddenException);

    expect(epcReviewRepository.findSessionById).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when reassigning a CLOSED session', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['Managing Director']);
    epcReviewRepository.findSessionById.mockResolvedValue({
      ...activeSession,
      status: ReviewSessionStatus.CLOSED,
    });

    await expect(
      kernel.reassignReviewSession(ctx, {
        reviewSessionId,
        newAssigneeUserId,
        reason: validReason,
      }),
    ).rejects.toThrow(
      new BadRequestException('Review session must be ACTIVE to reassign'),
    );

    expect(epcReviewRepository.updateReviewSession).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when reason is shorter than 10 characters', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['System Administrator']);

    await expect(
      kernel.reassignReviewSession(ctx, {
        reviewSessionId,
        newAssigneeUserId,
        reason: 'too short',
      }),
    ).rejects.toThrow(
      new BadRequestException(
        'Reassignment reason must be at least 10 characters',
      ),
    );

    expect(workflowTransactionRunner.runPhaseAB).not.toHaveBeenCalled();
  });

  it('writes a WorkflowEventLog INTENT entry on successful reassignment', async () => {
    permissionService.getUserRoleNames.mockResolvedValue(['System Administrator']);
    epcReviewRepository.findSessionById.mockResolvedValue(activeSession);
    tx.user.findFirst.mockResolvedValue({ id: newAssigneeUserId });

    await kernel.reassignReviewSession(ctx, {
      reviewSessionId,
      newAssigneeUserId,
      reason: validReason,
    });

    expect(epcReviewRepository.appendWorkflowIntentEvent).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        companyId: ctx.companyId,
        actorId: ctx.userId,
        entityType: WorkflowEntityType.ReviewSession,
        entityId: reviewSessionId,
        action: 'SESSION_REASSIGNED',
        beforeState: { currentAssigneeUserId: 'user-1' },
        afterState: { currentAssigneeUserId: newAssigneeUserId },
        reason: validReason,
        correlationId: expect.any(String),
      }),
    );
  });
});
