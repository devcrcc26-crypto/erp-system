import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  CommentSeverity,
  CommentStatus as PrismaCommentStatus,
  Prisma,
  ReviewSessionOutcome,
  ReviewSessionStatus,
  ReviewTier,
  WorkflowEntityType,
} from '@prisma/client';
import { CommentSeverity as DomainCommentSeverity } from '../../domain/contracts/enums/comment-severity.enum';
import { CommentStatus } from '../../domain/contracts/enums/comment-status.enum';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { EpcWorkflowAction } from '../../domain/contracts/enums/epc-workflow-action.enum';
import { REVIEW_TIER_ORDER } from '../../domain/contracts/enums/review-tier.enum';
import {
  AddReviewCommentCommand,
  ApproveReviewSessionCommand,
  ReturnPackageForReworkCommand,
  BatchReturnEdvsCommand,
  RemoveReviewCommentCommand,
  UpdateReviewCommentCommand,
  SubmitPackageForReviewCommand,
  TransitionCommentStatusCommand,
  VerifyReviewCommentCommand,
  WorkflowResultSnapshot,
} from '../../domain/contracts/workflow-kernel.contract';
import {
  canTransitionCommentStatus,
  CommentActorRole,
  transitionCommentStatus,
} from '../../domain/comment-state-machine';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { WorkflowTransactionRunner } from './workflow-transaction-runner.service';
import { ConflictGuardService } from './conflict-guard.service';
import { DefinitionOfDoneService } from './definition-of-done.service';
import { EdvTransitionService, PhaseATransitionResult } from './edv-transition.service';
import { PermissionResolverService } from './permission-resolver.service';
import { ReviewContextSnapshotService } from './review-context-snapshot.service';
import { ReviewRoutingService } from './review-routing.service';
import { ReviewSlaService } from './review-sla.service';
import {
  PhaseBProjectionResult,
  StateProjectionService,
} from './state-projection.service';

/**
 * Review lifecycle commands — session, comments, snapshot (Wave 4).
 * EDV status remains sole lifecycle authority via EdvTransitionService.
 */
@Injectable()
export class ReviewWorkflowService {
  private readonly logger = new Logger(ReviewWorkflowService.name);

  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly epcReviewRepository: EpcReviewRepository,
    private readonly edvTransitionService: EdvTransitionService,
    private readonly conflictGuard: ConflictGuardService,
    private readonly definitionOfDone: DefinitionOfDoneService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly reviewContextSnapshot: ReviewContextSnapshotService,
    private readonly reviewRouting: ReviewRoutingService,
    private readonly reviewSla: ReviewSlaService,
    private readonly stateProjection: StateProjectionService,
    private readonly workflowTransactionRunner: WorkflowTransactionRunner,
  ) {}

  private runTx<T>(
    companyId: string,
    correlationId: string,
    work: (tx: PrismaTx) => Promise<T>,
  ): Promise<T> {
    return this.workflowTransactionRunner.runPhaseAB(work, {
      companyId,
      correlationId,
    });
  }

  /**
   * Opens ReviewSession, freezes context snapshot, transitions EDVs to IN_REVIEW.
   */
  async submitPackageForReview(
    command: SubmitPackageForReviewCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        command.designPackageId,
      );
      if (!pkg || pkg.taskDisciplineId !== command.taskDisciplineId) {
        throw new NotFoundException('Design package not found');
      }

      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId: await this.resolveProjectIdFromDiscipline(
          tx,
          pkg.taskDisciplineId,
          command.companyId,
        ),
        action: EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
        taskDisciplineId: command.taskDisciplineId,
      });

      await this.conflictGuard.assertNoActiveSessionOnPackage(
        tx,
        command.companyId,
        command.designPackageId,
      );
      await this.conflictGuard.assertSubmitDependenciesSatisfied(
        tx,
        command.companyId,
        command.designPackageId,
      );

      const edvIds = pkg.items.map((i) => i.engineeringDocumentVersionId);
      const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
        tx,
        command.companyId,
        edvIds,
      );
      this.conflictGuard.assertBatchEdvsResolved(edvIds, loaded);
      this.conflictGuard.assertPackageSubmitEdvStates(
        loaded.map((e) => e.status as EdvStatus),
      );

      const discipline = pkg.taskDisciplineId
        ? await this.epcReviewRepository.findPackageWithDiscipline(
            tx,
            command.companyId,
            command.designPackageId,
          )
        : null;
      const taskDiscipline = discipline?.taskDiscipline;
      const assignedToUserId = taskDiscipline
        ? this.reviewSla.resolveAssigneeForTier(
            ReviewTier.REVIEWER,
            taskDiscipline,
          )
        : null;
      const openedAt = new Date();
      const slaDeadlineAt = this.reviewSla.computeDeadline(
        openedAt,
        ReviewTier.REVIEWER,
      );

      const session = await this.epcReviewRepository.createReviewSession(tx, {
        companyId: command.companyId,
        designPackageId: command.designPackageId,
        taskDisciplineId: command.taskDisciplineId,
        assignedToUserId,
        currentTier: ReviewTier.REVIEWER,
        slaDeadlineAt,
        createdBy: command.actorId,
      });

      const frozen = await this.reviewContextSnapshot.buildFrozenContext(
        tx,
        command.companyId,
        command.designPackageId,
      );
      await this.epcReviewRepository.createContextSnapshot(tx, {
        companyId: command.companyId,
        reviewSessionId: session.id,
        referencedVersionIds: frozen.referencedVersionIds,
        contentHash: frozen.contentHash,
        capturedBy: command.actorId,
      });

      await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityType: WorkflowEntityType.ReviewSession,
        entityId: session.id,
        action: 'SUBMIT_PACKAGE_FOR_REVIEW',
        beforeState: {},
        afterState: {
          status: session.status,
          snapshotHash: frozen.contentHash,
          referencedVersionIds: frozen.referencedVersionIds,
        },
        correlationId,
      });

      const projectId = await this.resolveProjectIdFromDiscipline(
        tx,
        command.taskDisciplineId,
        command.companyId,
      );

      const results = await this.edvTransitionService.applyInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        transitions: loaded.map((edv) => ({
          engineeringDocumentVersionId: edv.id,
          targetStatus: EdvStatus.IN_REVIEW,
          reason: `SubmitPackageForReview session=${session.id}`,
        })),
      });

      await this.epcReviewRepository.markPackageSubmitted(
        tx,
        command.designPackageId,
        command.actorId,
      );

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
      );

      return this.buildReviewSnapshot(
        'SubmitPackageForReview',
        correlationId,
        results,
        phaseB,
        session.id,
        command.designPackageId,
        command.taskDisciplineId,
      );
    });
  }

  /**
   * Adds a review comment on an EDV within an active session.
   */
  async addReviewComment(
    command: AddReviewCommentCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const session = await this.epcReviewRepository.findSessionById(
        tx,
        command.companyId,
        command.reviewSessionId,
      );
      if (!session || session.status !== ReviewSessionStatus.ACTIVE) {
        throw new BadRequestException('Active review session not found');
      }

      const edv = await this.epcWorkflowRepository.findEdvWithDiscipline(
        tx,
        command.companyId,
        command.engineeringDocumentVersionId,
      );
      if (!edv) {
        throw new NotFoundException('EDV not found');
      }

      this.conflictGuard.assertEdvAllowsComments(edv.status as EdvStatus);

      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId: await this.resolveProjectIdFromDiscipline(
          tx,
          session.taskDisciplineId,
          command.companyId,
        ),
        action: EpcWorkflowAction.REVIEW_COMMENT_ASSIGN,
        taskDisciplineId: session.taskDisciplineId,
      });

      const routing = this.reviewRouting.route({
        severity: command.severity as DomainCommentSeverity,
        currentTier: session.currentTier,
      });

      const comment = await this.epcReviewRepository.createReviewComment(tx, {
        companyId: command.companyId,
        reviewSessionId: command.reviewSessionId,
        engineeringDocumentVersionId: command.engineeringDocumentVersionId,
        body: command.body,
        severity: command.severity as CommentSeverity,
        assignedToUserId: command.assignedToUserId,
        createdBy: command.actorId,
      });

      await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityType: WorkflowEntityType.ReviewComment,
        entityId: comment.id,
        action: 'ADD_REVIEW_COMMENT',
        beforeState: {},
        afterState: {
          status: comment.status,
          severity: comment.severity,
          assignedToUserId: comment.assignedToUserId,
          routing: {
            escalate: routing.escalate,
            nextTier: routing.nextTier,
            requiresLeadApproval: routing.requiresLeadApproval,
          },
        } as Prisma.InputJsonValue,
        correlationId,
      });

      return {
        commandType: 'AddReviewComment',
        correlationId,
        affectedEdvIds: [command.engineeringDocumentVersionId],
        edvStatuses: { [command.engineeringDocumentVersionId]: edv.status as EdvStatus },
        reviewSessionId: session.id,
        intentEventIds: [],
      };
    });
  }

  /**
   * Transitions comment status via pure comment state machine.
   */
  async transitionCommentStatus(
    command: TransitionCommentStatusCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const comment = await this.epcReviewRepository.findCommentById(
        tx,
        command.companyId,
        command.reviewCommentId,
      );
      if (!comment || comment.reviewSession.status !== ReviewSessionStatus.ACTIVE) {
        throw new NotFoundException('Review comment not found');
      }

      const discipline = await this.epcReviewRepository.findPackageWithDiscipline(
        tx,
        command.companyId,
        comment.reviewSession.designPackageId,
      );
      const actor = this.resolveCommentActor(
        command.actorId,
        comment,
        discipline?.taskDiscipline,
      );

      const from = comment.status as CommentStatus;
      const to = command.targetStatus;
      const isAssignee = comment.assignedToUserId === command.actorId;
      const designerTargets = new Set<CommentStatus>([
        CommentStatus.ACKNOWLEDGED,
        CommentStatus.IN_PROGRESS,
        CommentStatus.RESOLVED,
      ]);
      if (designerTargets.has(to) && !isAssignee && actor !== 'reviewer') {
        throw new ForbiddenException(
          'Only the assigned designer can progress this comment',
        );
      }

      const check = canTransitionCommentStatus(from, to, actor);
      if (!check.allowed) {
        throw new BadRequestException(check.message ?? 'Invalid comment transition');
      }

      const timestamps = this.buildCommentTimestamps(from, to);
      const resolutionNote =
        to === CommentStatus.RESOLVED && command.resolutionNote?.trim()
          ? command.resolutionNote.trim()
          : undefined;

      await this.epcReviewRepository.updateReviewComment(
        tx,
        comment.id,
        {
          status: to as PrismaCommentStatus,
          updatedBy: command.actorId,
          ...(resolutionNote !== undefined ? { resolutionNote } : {}),
          ...timestamps,
        },
      );

      await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityType: WorkflowEntityType.ReviewComment,
        entityId: comment.id,
        action: `COMMENT_${from}_TO_${to}`,
        beforeState: { status: from },
        afterState: {
          status: to,
          ...(resolutionNote ? { resolutionNote } : {}),
        },
        correlationId,
      });

      return {
        commandType: 'TransitionCommentStatus',
        correlationId,
        affectedEdvIds: [comment.engineeringDocumentVersionId],
        edvStatuses: {},
        reviewSessionId: comment.reviewSessionId,
        intentEventIds: [],
      };
    });
  }

  /**
   * Reviewer verifies a RESOLVED comment (RESOLVED → VERIFIED).
   */
  async verifyReviewComment(
    command: VerifyReviewCommentCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.transitionCommentStatus(
      {
        type: 'TransitionCommentStatus',
        companyId: command.companyId,
        actorId: command.actorId,
        reviewCommentId: command.reviewCommentId,
        targetStatus: CommentStatus.VERIFIED,
        correlationId,
        idempotencyKey: command.idempotencyKey,
      },
      correlationId,
    );
  }

  /**
   * Soft-deletes an OPEN comment authored by the current user.
   */
  async removeReviewComment(
    command: RemoveReviewCommentCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const comment = await this.epcReviewRepository.findCommentById(
        tx,
        command.companyId,
        command.reviewCommentId,
      );
      if (!comment || comment.reviewSession.status !== ReviewSessionStatus.ACTIVE) {
        throw new NotFoundException('Review comment not found');
      }

      if (comment.createdBy !== command.actorId) {
        throw new ForbiddenException('Only the comment author can remove this comment');
      }

      if (comment.status !== PrismaCommentStatus.OPEN) {
        throw new BadRequestException('Only open comments can be removed');
      }

      await this.epcReviewRepository.softDeleteReviewComment(
        tx,
        comment.id,
        command.actorId,
      );

      await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityType: WorkflowEntityType.ReviewComment,
        entityId: comment.id,
        action: 'REMOVE_REVIEW_COMMENT',
        beforeState: {
          status: comment.status,
          body: comment.body,
        },
        afterState: { deleted: true },
        correlationId,
      });

      return {
        commandType: 'RemoveReviewComment',
        correlationId,
        affectedEdvIds: [comment.engineeringDocumentVersionId],
        edvStatuses: {},
        reviewSessionId: comment.reviewSessionId,
        intentEventIds: [],
      };
    });
  }

  /**
   * Updates an OPEN comment authored by the current user.
   */
  async updateReviewComment(
    command: UpdateReviewCommentCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const comment = await this.epcReviewRepository.findCommentById(
        tx,
        command.companyId,
        command.reviewCommentId,
      );
      if (!comment || comment.reviewSession.status !== ReviewSessionStatus.ACTIVE) {
        throw new NotFoundException('Review comment not found');
      }

      if (comment.createdBy !== command.actorId) {
        throw new ForbiddenException('Only the comment author can edit this comment');
      }

      if (comment.status !== PrismaCommentStatus.OPEN) {
        throw new BadRequestException('Only open comments can be edited');
      }

      const edv = await this.epcWorkflowRepository.findEdvWithDiscipline(
        tx,
        command.companyId,
        command.engineeringDocumentVersionId,
      );
      if (!edv) {
        throw new NotFoundException('EDV not found');
      }

      this.conflictGuard.assertEdvAllowsComments(edv.status as EdvStatus);

      const beforeState = {
        body: comment.body,
        severity: comment.severity,
        assignedToUserId: comment.assignedToUserId,
        engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
      };

      const updated = await this.epcReviewRepository.updateReviewComment(
        tx,
        comment.id,
        {
          body: command.body,
          severity: command.severity as CommentSeverity,
          engineeringDocumentVersion: {
            connect: { id: command.engineeringDocumentVersionId },
          },
          assignedToUser: {
            connect: { id: command.assignedToUserId },
          },
          updatedBy: command.actorId,
        },
      );

      await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityType: WorkflowEntityType.ReviewComment,
        entityId: comment.id,
        action: 'UPDATE_REVIEW_COMMENT',
        beforeState,
        afterState: {
          body: updated.body,
          severity: updated.severity,
          assignedToUserId: updated.assignedToUserId,
          engineeringDocumentVersionId: updated.engineeringDocumentVersionId,
        },
        correlationId,
      });

      return {
        commandType: 'UpdateReviewComment',
        correlationId,
        affectedEdvIds: [
          comment.engineeringDocumentVersionId,
          command.engineeringDocumentVersionId,
        ],
        edvStatuses: {
          [command.engineeringDocumentVersionId]: edv.status as EdvStatus,
        },
        reviewSessionId: comment.reviewSessionId,
        intentEventIds: [],
      };
    });
  }

  /**
   * Approves review session at current tier or advances tier chain.
   */
  async approveReviewSession(
    command: ApproveReviewSessionCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const session = await this.epcReviewRepository.findSessionById(
        tx,
        command.companyId,
        command.reviewSessionId,
      );
      if (!session || session.status !== ReviewSessionStatus.ACTIVE) {
        throw new NotFoundException('Active review session not found');
      }

      const commentStatuses = await this.epcReviewRepository.listCommentStatusesForSession(
        tx,
        command.companyId,
        session.id,
      );
      this.definitionOfDone.assertPackageApprovalAllowed(
        commentStatuses as CommentStatus[],
      );
      this.definitionOfDone.assertSessionCloseAllowed(
        commentStatuses as CommentStatus[],
      );

      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId: await this.resolveProjectIdFromDiscipline(
          tx,
          session.taskDisciplineId,
          command.companyId,
        ),
        action: EpcWorkflowAction.REVIEW_SESSION_APPROVE,
        taskDisciplineId: session.taskDisciplineId,
        currentAssigneeUserId: session.assignedToUserId ?? undefined,
      });

      await this.closeVerifiedCommentsInTx(tx, session.id, command);

      const tierIndex = REVIEW_TIER_ORDER.indexOf(session.currentTier as never);
      const isFinalTier = tierIndex >= REVIEW_TIER_ORDER.length - 1;

      if (!isFinalTier) {
        await this.advanceActiveSessionTierInTx(tx, {
          companyId: command.companyId,
          actorId: command.actorId,
          sessionId: session.id,
          correlationId,
          triggerAction: 'ADVANCE_REVIEW_TIER',
        });

        return {
          commandType: 'ApproveReviewSession',
          correlationId,
          affectedEdvIds: [],
          edvStatuses: {},
          reviewSessionId: session.id,
          intentEventIds: [],
        };
      }

      await this.epcReviewRepository.updateReviewSession(tx, session.id, {
        status: ReviewSessionStatus.APPROVED,
        outcome: ReviewSessionOutcome.APPROVED,
        closedAt: new Date(),
        updatedBy: command.actorId,
      });

      await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityType: WorkflowEntityType.ReviewSession,
        entityId: session.id,
        action: 'APPROVE_REVIEW_SESSION',
        beforeState: { status: session.status },
        afterState: { status: ReviewSessionStatus.APPROVED },
        correlationId,
      });

      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        session.designPackageId,
      );
      if (!pkg) {
        throw new NotFoundException('Design package not found');
      }

      const edvIds = pkg.items.map((item) => item.engineeringDocumentVersionId);
      const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
        tx,
        command.companyId,
        edvIds,
      );
      this.conflictGuard.assertBatchEdvsResolved(edvIds, loaded);

      const approvalPlan = this.conflictGuard.assertBatchTransitionPlan(
        loaded,
        EdvStatus.APPROVED,
        [EdvStatus.IN_REVIEW],
      );

      const projectId = await this.resolveProjectIdFromDiscipline(
        tx,
        session.taskDisciplineId,
        command.companyId,
      );

      const edvResults =
        approvalPlan.length > 0
          ? await this.edvTransitionService.applyInTx(tx, {
              companyId: command.companyId,
              actorId: command.actorId,
              correlationId,
              projectId,
              currentAssigneeUserId: session.assignedToUserId ?? undefined,
              permissionActionOverride: EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
              transitions: approvalPlan.map((plan) => ({
                engineeringDocumentVersionId: plan.edvId,
                targetStatus: EdvStatus.APPROVED,
                reason: `ApproveReviewSession final tier session=${session.id}`,
              })),
            })
          : [];

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
      );

      return this.buildReviewSnapshot(
        'ApproveReviewSession',
        correlationId,
        edvResults,
        phaseB,
        session.id,
        session.designPackageId,
        session.taskDisciplineId,
      );
    });
  }

  /**
   * Returns package for rework — closes session and reverts EDVs to DRAFT.
   */
  async returnPackageForRework(
    command: ReturnPackageForReworkCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const session = await this.epcReviewRepository.findSessionById(
        tx,
        command.companyId,
        command.reviewSessionId,
      );
      if (!session || session.designPackageId !== command.designPackageId) {
        throw new NotFoundException('Review session not found');
      }
      if (session.status !== ReviewSessionStatus.ACTIVE) {
        throw new BadRequestException('Review session is not ACTIVE');
      }

      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        command.designPackageId,
      );
      if (!pkg) {
        throw new NotFoundException('Design package not found');
      }

      await this.epcReviewRepository.updateReviewSession(tx, session.id, {
        status: ReviewSessionStatus.RETURNED_FOR_REWORK,
        outcome: ReviewSessionOutcome.RETURNED,
        closedAt: new Date(),
        closedReason: command.reason,
        updatedBy: command.actorId,
      });

      const projectId = await this.resolveProjectIdFromDiscipline(
        tx,
        session.taskDisciplineId,
        command.companyId,
      );

      const edvIds = pkg.items.map((i) => i.engineeringDocumentVersionId);
      const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
        tx,
        command.companyId,
        edvIds,
      );

      const results = await this.edvTransitionService.applyInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        transitions: loaded
          .filter((e) => (e.status as EdvStatus) === EdvStatus.IN_REVIEW)
          .map((edv) => ({
            engineeringDocumentVersionId: edv.id,
            targetStatus: EdvStatus.DRAFT,
            reason: command.reason,
          })),
      });

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
      );

      return this.buildReviewSnapshot(
        'ReturnPackageForRework',
        correlationId,
        results,
        phaseB,
        session.id,
        command.designPackageId,
        session.taskDisciplineId,
      );
    });
  }

  /**
   * Batch-returns selected EDVs to DRAFT with templated review comments.
   */
  async batchReturnEdvs(
    command: BatchReturnEdvsCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const session = await this.epcReviewRepository.findSessionById(
        tx,
        command.companyId,
        command.reviewSessionId,
      );
      if (!session) {
        throw new NotFoundException('Review session not found');
      }
      this.conflictGuard.assertReviewSessionActiveForPackage(
        session.status,
        session.designPackageId,
        command.designPackageId,
      );

      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        command.designPackageId,
      );
      if (!pkg) {
        throw new NotFoundException('Design package not found');
      }

      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId: await this.resolveProjectIdFromDiscipline(
          tx,
          session.taskDisciplineId,
          command.companyId,
        ),
        action: EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN,
        taskDisciplineId: session.taskDisciplineId,
      });

      const requestedIds = command.engineeringDocumentVersionIds;
      const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
        tx,
        command.companyId,
        requestedIds,
      );
      this.conflictGuard.assertBatchEdvsResolved(requestedIds, loaded);

      const plan = this.conflictGuard.assertBatchTransitionPlan(
        loaded,
        EdvStatus.DRAFT,
        [EdvStatus.IN_REVIEW],
      );

      const discipline = await this.epcReviewRepository.findPackageWithDiscipline(
        tx,
        command.companyId,
        command.designPackageId,
      );
      const assigneeId =
        discipline?.taskDiscipline.designerUserId ?? command.actorId;

      for (const edv of loaded) {
        await this.epcReviewRepository.createReviewComment(tx, {
          companyId: command.companyId,
          reviewSessionId: command.reviewSessionId,
          engineeringDocumentVersionId: edv.id,
          body: command.commentTemplate,
          severity: CommentSeverity.MODERATE,
          assignedToUserId: assigneeId,
          createdBy: command.actorId,
        });
      }

      const projectId = await this.resolveProjectIdFromDiscipline(
        tx,
        session.taskDisciplineId,
        command.companyId,
      );

      const results = await this.edvTransitionService.applyInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        transitions: plan.map((p) => ({
          engineeringDocumentVersionId: p.edvId,
          targetStatus: EdvStatus.DRAFT,
          reason: command.commentTemplate,
        })),
      });

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
      );

      return this.buildReviewSnapshot(
        'BatchReturnEdvs',
        correlationId,
        results,
        phaseB,
        session.id,
        command.designPackageId,
        session.taskDisciplineId,
      );
    });
  }

  /**
   * When every package EDV is APPROVED, escalates the session so the next tier assignee sees the inbox.
   */
  async maybeAdvanceSessionAfterPackageEdvsApproved(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      designPackageId: string;
      reviewSessionId: string;
      correlationId: string;
    },
  ): Promise<void> {
    const pkg = await this.epcWorkflowRepository.findPackageWithItems(
      tx,
      input.companyId,
      input.designPackageId,
    );
    if (!pkg || pkg.items.length === 0) {
      return;
    }

    const edvIds = pkg.items.map((item) => item.engineeringDocumentVersionId);
    const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
      tx,
      input.companyId,
      edvIds,
    );
    this.conflictGuard.assertBatchEdvsResolved(edvIds, loaded);

    const allApproved = loaded.every((edv) => edv.status === EdvStatus.APPROVED);
    if (!allApproved) {
      return;
    }

    await this.advanceActiveSessionTierInTx(tx, {
      companyId: input.companyId,
      actorId: input.actorId,
      sessionId: input.reviewSessionId,
      correlationId: input.correlationId,
      triggerAction: 'ADVANCE_REVIEW_TIER_AFTER_EDV_APPROVAL',
    });
  }

  /**
   * Repairs active sessions whose package EDVs are fully approved but tier was never escalated.
   */
  async reconcileStuckSessionEscalations(
    companyId: string,
    actorId: string,
  ): Promise<void> {
    const correlationId = randomUUID();
    await this.workflowTransactionRunner.runPhaseABOnly(async (tx) => {
      const sessions = await tx.reviewSession.findMany({
        where: {
          companyId,
          deletedAt: null,
          status: ReviewSessionStatus.ACTIVE,
        },
        select: { id: true, designPackageId: true },
      });

      for (const session of sessions) {
        try {
          await this.maybeAdvanceSessionAfterPackageEdvsApproved(tx, {
            companyId,
            actorId,
            designPackageId: session.designPackageId,
            reviewSessionId: session.id,
            correlationId,
          });
        } catch (error: unknown) {
          const message = error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `Skipped stuck session escalation for ${session.id}: ${message}`,
          );
        }
      }
    });
  }

  /**
   * Escalates an active review session to the next governance tier and reassigns inbox ownership.
   */
  private async advanceActiveSessionTierInTx(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      sessionId: string;
      correlationId: string;
      triggerAction: string;
    },
  ): Promise<void> {
    const session = await this.epcReviewRepository.findSessionById(
      tx,
      input.companyId,
      input.sessionId,
    );
    if (!session || session.status !== ReviewSessionStatus.ACTIVE) {
      return;
    }

    const tierIndex = REVIEW_TIER_ORDER.indexOf(session.currentTier as never);
    const isFinalTier = tierIndex >= REVIEW_TIER_ORDER.length - 1;
    if (isFinalTier) {
      return;
    }

    const nextTier = REVIEW_TIER_ORDER[tierIndex + 1] as ReviewTier;
    const discipline = await this.epcReviewRepository.findPackageWithDiscipline(
      tx,
      input.companyId,
      session.designPackageId,
    );
    const assignee = discipline
      ? this.reviewSla.resolveAssigneeForTier(nextTier, discipline.taskDiscipline)
      : null;

    if (!assignee) {
      throw new BadRequestException(
        `Cannot advance review to ${nextTier.replace(/_/g, ' ').toLowerCase()}: assign the role on the discipline first`,
      );
    }

    const slaDeadlineAt = this.reviewSla.computeDeadline(new Date(), nextTier);

    await this.epcReviewRepository.updateReviewSession(tx, session.id, {
      currentTier: nextTier,
      assignedToUser: { connect: { id: assignee } },
      slaDeadlineAt,
      slaEscalatedAt: null,
      updatedBy: input.actorId,
    });

    await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
      companyId: input.companyId,
      actorId: input.actorId,
      entityType: WorkflowEntityType.ReviewSession,
      entityId: session.id,
      action: input.triggerAction,
      beforeState: {
        currentTier: session.currentTier,
        assignedToUserId: session.assignedToUserId,
      },
      afterState: {
        currentTier: nextTier,
        assignedToUserId: assignee,
      },
      correlationId: input.correlationId,
    });
  }

  private async closeVerifiedCommentsInTx(
    tx: PrismaTx,
    reviewSessionId: string,
    command: ApproveReviewSessionCommand,
  ): Promise<void> {
    const session = await this.epcReviewRepository.findSessionById(
      tx,
      command.companyId,
      reviewSessionId,
    );
    if (!session) {
      return;
    }

    for (const comment of session.comments) {
      if (comment.status !== PrismaCommentStatus.VERIFIED) {
        continue;
      }
      const to = CommentStatus.CLOSED;
      transitionCommentStatus(
        comment.status as CommentStatus,
        to,
        'system',
      );
      await this.epcReviewRepository.updateReviewComment(tx, comment.id, {
        status: PrismaCommentStatus.CLOSED,
        closedAt: new Date(),
        updatedBy: command.actorId,
      });
    }
  }

  private resolveCommentActor(
    userId: string,
    comment: { assignedToUserId: string; createdBy: string },
    discipline?: {
      designerUserId: string | null;
      reviewerUserId: string | null;
      disciplineLeadUserId: string | null;
      chiefUserId: string | null;
    },
  ): CommentActorRole {
    if (
      comment.assignedToUserId === userId ||
      discipline?.designerUserId === userId
    ) {
      return 'designer';
    }
    if (
      discipline?.reviewerUserId === userId ||
      discipline?.disciplineLeadUserId === userId ||
      discipline?.chiefUserId === userId ||
      comment.createdBy === userId
    ) {
      return 'reviewer';
    }
    throw new ForbiddenException(
      'You are not permitted to act on this review comment',
    );
  }

  private buildCommentTimestamps(
    from: CommentStatus,
    to: CommentStatus,
  ): Prisma.ReviewCommentUpdateInput {
    const now = new Date();
    const data: Prisma.ReviewCommentUpdateInput = {};
    if (to === CommentStatus.RESOLVED) {
      data.resolvedAt = now;
    }
    if (to === CommentStatus.VERIFIED) {
      data.verifiedAt = now;
    }
    if (to === CommentStatus.CLOSED) {
      data.closedAt = now;
    }
    void from;
    return data;
  }

  private buildReviewSnapshot(
    commandType: WorkflowResultSnapshot['commandType'],
    correlationId: string,
    results: readonly PhaseATransitionResult[],
    phaseB: PhaseBProjectionResult,
    reviewSessionId: string,
    packageId: string,
    disciplineId: string,
  ): WorkflowResultSnapshot {
    const edvStatuses: Record<string, EdvStatus> = {};
    for (const r of results) {
      edvStatuses[r.edvId] = r.to;
    }

    return {
      commandType,
      correlationId,
      affectedEdvIds: results.map((r) => r.edvId),
      edvStatuses,
      intentEventIds: results.map((r) => r.intentEventId),
      reviewSessionId,
      packageProjectedStatus: phaseB.packageStatuses[packageId],
      disciplineProjectedStatus: phaseB.disciplineStatuses[disciplineId],
    };
  }

  private async resolveProjectIdFromDiscipline(
    tx: PrismaTx,
    taskDisciplineId: string,
    companyId: string,
  ): Promise<string> {
    const discipline = await tx.taskDiscipline.findFirst({
      where: { id: taskDisciplineId, companyId, deletedAt: null },
      select: { taskId: true },
    });
    if (!discipline) {
      throw new BadRequestException('Task discipline not found');
    }
    const task = await tx.task.findFirst({
      where: {
        id: discipline.taskId,
        deletedAt: null,
        project: { companyId, deletedAt: null },
      },
      select: { projectId: true },
    });
    if (!task) {
      throw new BadRequestException('Task not found for discipline');
    }
    return task.projectId;
  }
}
