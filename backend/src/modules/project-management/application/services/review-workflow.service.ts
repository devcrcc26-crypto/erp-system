import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CommentSeverity,
  CommentStatus as PrismaCommentStatus,
  Prisma,
  ReviewSession,
  ReviewSessionOutcome,
  ReviewSessionStatus,
  ReviewTier,
  TaskDisciplineReviewStatus,
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
import {
  getEffectiveApprovalChain,
  type DisciplineApprovalChain,
  type PackageApprovalChainOverrides,
} from '../../domain/approval-chain.util';
import { isExternalInstituteChief } from '../../domain/institute-chief.util';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import {
  EdvWithDiscipline,
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { EngineeringDocumentVersionRepository } from '../../infrastructure/repositories/epc-storage.repository';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  mapReviewSessionAttachment,
  mapReviewSessionAttachments,
  MappedReviewSessionAttachment,
} from '../utils/review-session-attachment.mapper';
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
 * Review lifecycle commands - session, comments, snapshot (Wave 4).
 * EDV status remains sole lifecycle authority via EdvTransitionService.
 */
@Injectable()
export class ReviewWorkflowService {
  private readonly logger = new Logger(ReviewWorkflowService.name);

  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly epcReviewRepository: EpcReviewRepository,
    private readonly engineeringDocumentVersionRepository: EngineeringDocumentVersionRepository,
    private readonly edvTransitionService: EdvTransitionService,
    private readonly conflictGuard: ConflictGuardService,
    private readonly definitionOfDone: DefinitionOfDoneService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly reviewContextSnapshot: ReviewContextSnapshotService,
    private readonly reviewRouting: ReviewRoutingService,
    private readonly reviewSla: ReviewSlaService,
    private readonly stateProjection: StateProjectionService,
    private readonly workflowTransactionRunner: WorkflowTransactionRunner,
    private readonly prisma: PrismaService,
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
    await this.permissionResolver.assertActionAllowed({
      companyId: command.companyId,
      userId: command.actorId,
      projectId: await this.resolveProjectIdFromDiscipline(
        this.prisma,
        command.taskDisciplineId,
        command.companyId,
      ),
      action: EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
      taskDisciplineId: command.taskDisciplineId,
      designPackageId: command.designPackageId,
    });

    return this.runTx(command.companyId, correlationId, async (tx) => {
      await this.syncPackageItemsToCurrentDrafts(
        tx,
        command.companyId,
        command.designPackageId,
      );

      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        command.designPackageId,
      );
      if (!pkg || pkg.taskDisciplineId !== command.taskDisciplineId) {
        throw new NotFoundException('Design package not found');
      }

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

      const returnedSession = await tx.reviewSession.findFirst({
        where: activeOnly({
          companyId: command.companyId,
          designPackageId: command.designPackageId,
          status: ReviewSessionStatus.RETURNED_FOR_REWORK,
        }),
        orderBy: { closedAt: 'desc' },
      });

      if (returnedSession) {
        const previousCommentStatuses =
          await this.epcReviewRepository.listCommentStatusesForSession(
            tx,
            command.companyId,
            returnedSession.id,
          );
        const hasUnacknowledgedComments = previousCommentStatuses.some(
          (status) =>
            status === PrismaCommentStatus.OPEN ||
            status === PrismaCommentStatus.IN_PROGRESS,
        );
        if (hasUnacknowledgedComments) {
          throw new BadRequestException(
            'All review comments must be acknowledged before resubmitting.',
          );
        }

        const projectId = await this.resolveProjectIdFromDiscipline(
          tx,
          command.taskDisciplineId,
          command.companyId,
        );

        return this.reopenReturnedSessionInTx(tx, {
          companyId: command.companyId,
          actorId: command.actorId,
          correlationId,
          projectId,
          designPackageId: command.designPackageId,
          taskDisciplineId: command.taskDisciplineId,
          session: returnedSession,
          action: 'RESUBMIT_PACKAGE_FOR_REVIEW',
        });
      }

      const previousSession = await tx.reviewSession.findFirst({
        where: activeOnly({
          companyId: command.companyId,
          designPackageId: command.designPackageId,
          status: { not: ReviewSessionStatus.ACTIVE },
        }),
        orderBy: { closedAt: 'desc' },
        select: { id: true },
      });
      if (previousSession) {
        const previousCommentStatuses =
          await this.epcReviewRepository.listCommentStatusesForSession(
            tx,
            command.companyId,
            previousSession.id,
          );
        const hasUnacknowledgedComments = previousCommentStatuses.some(
          (status) =>
            status === PrismaCommentStatus.OPEN ||
            status === PrismaCommentStatus.IN_PROGRESS,
        );
        if (hasUnacknowledgedComments) {
          throw new BadRequestException(
            'All review comments must be acknowledged before resubmitting.',
          );
        }
      }

      const edvIds = pkg.items.map((i) => i.engineeringDocumentVersionId);
      let loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
        tx,
        command.companyId,
        edvIds,
      );
      this.conflictGuard.assertBatchEdvsResolved(edvIds, loaded);

      const projectId = await this.resolveProjectIdFromDiscipline(
        tx,
        command.taskDisciplineId,
        command.companyId,
      );

      loaded = await this.repairOrphanedInReviewEdvs(
        tx,
        command,
        correlationId,
        projectId,
        loaded,
      );

      this.conflictGuard.assertPackageSubmitEdvStates(
        loaded.map((e) => e.status as EdvStatus),
      );

      const firstRequiredTier = pkg.requiredTiers[0] as ReviewTier | undefined;
      if (!firstRequiredTier) {
        throw new BadRequestException(
          'Design package has no required tiers. Set requiredTiers before submitting.',
        );
      }

      const discipline = pkg.taskDisciplineId
        ? await this.epcReviewRepository.findPackageWithDiscipline(
            tx,
            command.companyId,
            command.designPackageId,
          )
        : null;
      const taskDiscipline = discipline?.taskDiscipline;
      const effectiveChain = discipline
        ? getEffectiveApprovalChain(discipline, taskDiscipline!)
        : null;
      const assignedToUserId =
        effectiveChain && firstRequiredTier
          ? this.reviewSla.resolveAssigneeForTier(firstRequiredTier, effectiveChain)
          : null;
      const openedAt = new Date();
      const slaDeadlineAt = this.reviewSla.computeDeadline(openedAt, firstRequiredTier);

      const session = await this.epcReviewRepository.createReviewSession(tx, {
        companyId: command.companyId,
        designPackageId: command.designPackageId,
        taskDisciplineId: command.taskDisciplineId,
        assignedToUserId,
        currentTier: firstRequiredTier,
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

      await this.upsertTaskDisciplineReviewInTx(tx, {
        companyId: command.companyId,
        taskDisciplineId: command.taskDisciplineId,
        tier: firstRequiredTier,
        status: TaskDisciplineReviewStatus.IN_REVIEW,
        actorId: command.actorId,
      });

      const results = await this.edvTransitionService.applyInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        designPackageId: command.designPackageId,
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
        { packageIds: [command.designPackageId] },
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

      const body = command.body?.trim();
      if (!body && !command.commentDocumentVersionId) {
        throw new BadRequestException(
          'Review comment requires text or an attached file',
        );
      }

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
        designPackageId: session.designPackageId,
      });

      const routing = this.reviewRouting.route({
        severity: command.severity as DomainCommentSeverity,
        currentTier: session.currentTier,
      });

      const comment = await this.epcReviewRepository.createReviewComment(tx, {
        companyId: command.companyId,
        reviewSessionId: command.reviewSessionId,
        engineeringDocumentVersionId: command.engineeringDocumentVersionId,
        body: body,
        commentDocumentVersionId: command.commentDocumentVersionId,
        severity: command.severity as CommentSeverity,
        reviewTier: session.currentTier,
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
      if (!comment) {
        throw new NotFoundException('Review comment not found');
      }

      const from = comment.status as CommentStatus;
      const to = command.targetStatus;
      const isAssignee = comment.assignedToUserId === command.actorId;
      if (
        !this.canTransitionCommentInSession(
          comment.reviewSession.status,
          to,
          isAssignee,
        )
      ) {
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
        discipline,
        to,
      );
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

      if (to === CommentStatus.RESOLVED && !command.resolutionNote?.trim()) {
        throw new BadRequestException(
          'Resolution note is required. Please describe what was changed before resolving.',
        );
      }

      const timestamps = this.buildCommentTimestamps(from, to);
      const resolutionNote =
        to === CommentStatus.RESOLVED && command.resolutionNote?.trim()
          ? command.resolutionNote.trim()
          : undefined;

      let responseDocVersionId = command.responseDocumentVersionId;
      if (to === CommentStatus.RESOLVED && !responseDocVersionId) {
        const commentedEdv =
          await tx.engineeringDocumentVersion.findFirst({
            where: activeOnly({
              id: comment.engineeringDocumentVersionId,
              companyId: command.companyId,
            }),
            select: { engineeringDocumentId: true, createdAt: true },
          });
        if (commentedEdv) {
          const latestEdv =
            await tx.engineeringDocumentVersion.findFirst({
              where: activeOnly({
                companyId: command.companyId,
                engineeringDocumentId: commentedEdv.engineeringDocumentId,
                createdAt: { gt: commentedEdv.createdAt },
              }),
              orderBy: { createdAt: 'desc' },
              select: { documentVersionId: true },
            });
          if (latestEdv) {
            responseDocVersionId = latestEdv.documentVersionId;
          }
        }
      }

      await this.epcReviewRepository.updateReviewComment(
        tx,
        comment.id,
        {
          status: to as PrismaCommentStatus,
          updatedBy: command.actorId,
          ...(resolutionNote !== undefined ? { resolutionNote } : {}),
          ...(to === CommentStatus.RESOLVED && responseDocVersionId
            ? { responseDocumentVersionId: responseDocVersionId }
            : {}),
          ...timestamps,
        },
      );

      if (
        to === CommentStatus.RESOLVED &&
        command.additionalResponseDocumentVersionIds?.length
      ) {
        await this.epcReviewRepository.createReviewCommentFiles(tx, {
          reviewCommentId: comment.id,
          documentVersionIds: command.additionalResponseDocumentVersionIds,
          createdBy: command.actorId,
          isResponseFile: true,
        });
      }

      if (to === CommentStatus.VERIFIED && comment.responseDocumentVersionId) {
        const responseEdv = await tx.engineeringDocumentVersion.findFirst({
          where: {
            companyId: command.companyId,
            documentVersionId: comment.responseDocumentVersionId,
            deletedAt: null,
          },
          select: {
            id: true,
            engineeringDocumentId: true,
          },
        });

        if (responseEdv) {
          await tx.engineeringDocumentVersion.updateMany({
            where: {
              companyId: command.companyId,
              engineeringDocumentId: responseEdv.engineeringDocumentId,
              id: { not: responseEdv.id },
              deletedAt: null,
            },
            data: { isCurrent: false },
          });
          await tx.engineeringDocumentVersion.update({
            where: { id: responseEdv.id },
            data: { isCurrent: true },
          });

          await this.engineeringDocumentVersionRepository.retargetPackageItemsToNewEdv(
            comment.companyId,
            [comment.engineeringDocumentVersionId],
            responseEdv.id,
          );
        }
      }

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

      if (
        (to === CommentStatus.RESOLVED || to === CommentStatus.VERIFIED) &&
        comment.reviewSession.status === ReviewSessionStatus.RETURNED_FOR_REWORK
      ) {
        const statuses =
          await this.epcReviewRepository.listCommentStatusesForSession(
            tx,
            command.companyId,
            comment.reviewSessionId,
          );
        const allResolved = statuses.every(
          (status) =>
            status === PrismaCommentStatus.RESOLVED ||
            status === PrismaCommentStatus.VERIFIED ||
            status === PrismaCommentStatus.CLOSED,
        );
        if (allResolved) {
          await this.syncPackageItemsToCurrentDrafts(
            tx,
            command.companyId,
            comment.reviewSession.designPackageId,
          );
          const projectId = await this.resolveProjectIdFromDiscipline(
            tx,
            comment.reviewSession.taskDisciplineId,
            command.companyId,
          );
          return this.reopenReturnedSessionInTx(tx, {
            companyId: command.companyId,
            actorId: command.actorId,
            correlationId,
            projectId,
            designPackageId: comment.reviewSession.designPackageId,
            taskDisciplineId: comment.reviewSession.taskDisciplineId,
            session: comment.reviewSession,
            action: 'RESUBMIT_AFTER_COMMENT_RESOLUTION',
          });
        }
      }

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
      if (!comment) {
        throw new NotFoundException('Review comment not found');
      }
      if (comment.reviewSession.status !== ReviewSessionStatus.ACTIVE) {
        throw new ConflictException(
          'Comments can only be removed while the review session is active',
        );
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
      if (!comment) {
        throw new NotFoundException('Review comment not found');
      }
      if (comment.reviewSession.status !== ReviewSessionStatus.ACTIVE) {
        throw new ConflictException(
          'Comments can only be edited while the review session is active',
        );
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

      const body = command.body?.trim();
      if (!body && !command.commentDocumentVersionId) {
        throw new BadRequestException(
          'Review comment requires text or an attached file',
        );
      }

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
          body: body || null,
          ...(command.commentDocumentVersionId
            ? {
                commentDocumentVersion: {
                  connect: { id: command.commentDocumentVersionId },
                },
              }
            : {}),
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

      const approveDiscipline = await this.epcReviewRepository.findPackageWithDiscipline(
        tx,
        command.companyId,
        session.designPackageId,
      );
      this.assertActorMatchesReviewTier(
        command.actorId,
        session.currentTier,
        approveDiscipline,
        { approvedOnBehalfOfName: command.approvedOnBehalfOfName },
      );

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
        designPackageId: session.designPackageId,
        currentAssigneeUserId: session.assignedToUserId ?? undefined,
      });

      await this.closeVerifiedCommentsInTx(tx, session.id, command);

      const currentIndex = REVIEW_TIER_ORDER.indexOf(session.currentTier as never);
      const packageRequiredTiers = approveDiscipline?.requiredTiers ?? [];
      const nextTier = (REVIEW_TIER_ORDER
        .slice(currentIndex + 1)
        .find((tier) => packageRequiredTiers.includes(tier as ReviewTier)) ?? null) as ReviewTier | null;
      const remainingRequired = packageRequiredTiers.filter(
        (t) => REVIEW_TIER_ORDER.indexOf(t as never) > currentIndex,
      );
      const isFinalTier = remainingRequired.length === 0;

      if (!isFinalTier) {
        await this.revertPrematureEdvApprovalsInTx(tx, {
          companyId: command.companyId,
          actorId: command.actorId,
          correlationId,
          designPackageId: session.designPackageId,
          projectId: await this.resolveProjectIdFromDiscipline(
            tx,
            session.taskDisciplineId,
            command.companyId,
          ),
        });

        await this.upsertTaskDisciplineReviewInTx(tx, {
          companyId: command.companyId,
          taskDisciplineId: session.taskDisciplineId,
          tier: session.currentTier,
          status: TaskDisciplineReviewStatus.APPROVED,
          actorId: command.actorId,
        });

        await this.advanceActiveSessionTierInTx(tx, {
          companyId: command.companyId,
          actorId: command.actorId,
          sessionId: session.id,
          correlationId,
          triggerAction: 'ADVANCE_REVIEW_TIER',
          nextTier: nextTier!,
        });

        await this.upsertTaskDisciplineReviewInTx(tx, {
          companyId: command.companyId,
          taskDisciplineId: session.taskDisciplineId,
          tier: nextTier!,
          status: TaskDisciplineReviewStatus.IN_REVIEW,
          actorId: command.actorId,
        });

        await this.epcWorkflowRepository.markPackageProjectionPendingById(
          tx,
          session.designPackageId,
        );

        const phaseB = await this.stateProjection.recomputeDirtyInTx(
          tx,
          command.companyId,
          command.actorId,
          { packageIds: [session.designPackageId] },
        );

        return {
          commandType: 'ApproveReviewSession',
          correlationId,
          affectedEdvIds: [],
          edvStatuses: {},
          reviewSessionId: session.id,
          intentEventIds: [],
          packageProjectedStatus:
            phaseB.packageStatuses[session.designPackageId],
          disciplineProjectedStatus:
            phaseB.disciplineStatuses[session.taskDisciplineId],
        };
      }

      await this.upsertTaskDisciplineReviewInTx(tx, {
        companyId: command.companyId,
        taskDisciplineId: session.taskDisciplineId,
        tier: session.currentTier,
        status: TaskDisciplineReviewStatus.APPROVED,
        actorId: command.actorId,
      });

      await this.epcReviewRepository.updateReviewSession(tx, session.id, {
        status: ReviewSessionStatus.APPROVED,
        outcome: ReviewSessionOutcome.APPROVED,
        closedAt: new Date(),
        instituteChiefApprovedOnBehalfOfName:
          session.currentTier === ReviewTier.INSTITUTE_CHIEF
            ? command.approvedOnBehalfOfName ?? null
            : null,
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
              designPackageId: session.designPackageId,
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
        { packageIds: [session.designPackageId] },
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
   * Returns package for rework - closes session and reverts EDVs to DRAFT.
   */
  async returnPackageForRework(
    command: ReturnPackageForReworkCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    if (command.comments.length === 0) {
      throw new BadRequestException(
        'At least one comment is required to return a package for rework',
      );
    }

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

      const returnDiscipline = await this.epcReviewRepository.findPackageWithDiscipline(
        tx,
        command.companyId,
        command.designPackageId,
      );
      this.assertActorMatchesReviewTier(
        command.actorId,
        session.currentTier,
        returnDiscipline,
      );

      const projectId = await this.resolveProjectIdFromDiscipline(
        tx,
        session.taskDisciplineId,
        command.companyId,
      );

      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId,
        action: EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN,
        taskDisciplineId: session.taskDisciplineId,
        designPackageId: command.designPackageId,
        currentAssigneeUserId: session.assignedToUserId ?? undefined,
      });

      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        command.designPackageId,
      );
      if (!pkg) {
        throw new NotFoundException('Design package not found');
      }

      for (const commentInput of command.comments) {
        const comment = await this.epcReviewRepository.createReviewComment(tx, {
          companyId: command.companyId,
          reviewSessionId: command.reviewSessionId,
          engineeringDocumentVersionId: commentInput.engineeringDocumentVersionId,
          body: commentInput.body,
          commentDocumentVersionId: commentInput.commentDocumentVersionId,
          severity: commentInput.severity as CommentSeverity,
          reviewTier: session.currentTier,
          assignedToUserId: commentInput.assignedToUserId,
          createdBy: command.actorId,
        });

        if (commentInput.commentFileIds?.length) {
          await this.epcReviewRepository.createReviewCommentFiles(tx, {
            reviewCommentId: comment.id,
            documentVersionIds: commentInput.commentFileIds,
            createdBy: command.actorId,
          });
        }

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
          } as Prisma.InputJsonValue,
          correlationId,
        });
      }

      const closedReason =
        command.comments[0]?.body?.trim() ||
        `Returned with ${command.comments.length} comments`;

      await this.upsertTaskDisciplineReviewInTx(tx, {
        companyId: command.companyId,
        taskDisciplineId: session.taskDisciplineId,
        tier: session.currentTier,
        status: TaskDisciplineReviewStatus.RETURNED,
        actorId: command.actorId,
      });

      await this.epcReviewRepository.updateReviewSession(tx, session.id, {
        status: ReviewSessionStatus.RETURNED_FOR_REWORK,
        outcome: ReviewSessionOutcome.RETURNED,
        closedAt: new Date(),
        closedReason,
        updatedBy: command.actorId,
      });

      await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityType: WorkflowEntityType.ReviewSession,
        entityId: session.id,
        action: 'RETURN_FOR_REWORK',
        beforeState: { status: session.status },
        afterState: {
          status: ReviewSessionStatus.RETURNED_FOR_REWORK,
          designPackageId: command.designPackageId,
          triggerAction: 'RETURN_FOR_REWORK',
        },
        correlationId,
      });

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
        designPackageId: command.designPackageId,
        currentAssigneeUserId: session.assignedToUserId ?? undefined,
        // IN_REVIEW → DRAFT would otherwise map to revision.trigger (designer-only).
        permissionActionOverride: EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN,
        transitions: loaded
          .filter((e) => (e.status as EdvStatus) === EdvStatus.IN_REVIEW)
          .map((edv) => ({
            engineeringDocumentVersionId: edv.id,
            targetStatus: EdvStatus.DRAFT,
            reason: closedReason,
          })),
      });

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
        { packageIds: [command.designPackageId] },
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
        designPackageId: command.designPackageId,
        currentAssigneeUserId: session.assignedToUserId ?? undefined,
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
          reviewTier: session.currentTier,
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
        designPackageId: command.designPackageId,
        // IN_REVIEW → DRAFT would otherwise map to revision.trigger (designer-only).
        permissionActionOverride: EpcWorkflowAction.REVIEW_SESSION_BATCH_RETURN,
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
        { packageIds: [command.designPackageId] },
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
   * Escalates an active review session to the next governance tier and reassigns inbox ownership.
   */
  /**
   * Reverts EDVs prematurely batch-approved before the final governance tier.
   */
  private async revertPrematureEdvApprovalsInTx(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      correlationId: string;
      designPackageId: string;
      projectId: string;
    },
  ): Promise<void> {
    const pkg = await this.epcWorkflowRepository.findPackageWithItems(
      tx,
      input.companyId,
      input.designPackageId,
    );
    if (!pkg) {
      return;
    }

    const edvIds = pkg.items.map((item) => item.engineeringDocumentVersionId);
    const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
      tx,
      input.companyId,
      edvIds,
    );

    const premature = loaded.filter(
      (edv) => (edv.status as EdvStatus) === EdvStatus.APPROVED,
    );
    if (premature.length === 0) {
      return;
    }

    await this.edvTransitionService.applyInTx(tx, {
      companyId: input.companyId,
      actorId: input.actorId,
      correlationId: input.correlationId,
      projectId: input.projectId,
      designPackageId: input.designPackageId,
      transitions: premature.map((edv) => ({
        engineeringDocumentVersionId: edv.id,
        targetStatus: EdvStatus.IN_REVIEW,
        reason: 'Reverted premature EDV approval during governance escalation',
      })),
    });
  }

  /**
   * Reverts IN_REVIEW EDVs with no active review session (e.g. after session data loss).
   */
  private async repairOrphanedInReviewEdvs(
    tx: PrismaTx,
    command: SubmitPackageForReviewCommand,
    correlationId: string,
    projectId: string,
    loaded: readonly EdvWithDiscipline[],
  ): Promise<EdvWithDiscipline[]> {
    const orphans = loaded.filter(
      (edv) => (edv.status as EdvStatus) === EdvStatus.IN_REVIEW,
    );
    if (orphans.length === 0) {
      return [...loaded];
    }

    for (const edv of orphans) {
      const activeSession = await this.epcReviewRepository.findActiveSessionForEdv(
        tx,
        command.companyId,
        edv.id,
      );
      if (activeSession) {
        throw new ConflictException(
          `EDV ${edv.id} is already in an active review session on another package`,
        );
      }
    }

    await this.edvTransitionService.applyInTx(tx, {
      companyId: command.companyId,
      actorId: command.actorId,
      correlationId,
      projectId,
      designPackageId: command.designPackageId,
      transitions: orphans.map((edv) => ({
        engineeringDocumentVersionId: edv.id,
        targetStatus: EdvStatus.DRAFT,
        reason: 'Orphaned IN_REVIEW state repaired before package submit',
      })),
    });

    return this.epcWorkflowRepository.findEdvsWithDiscipline(
      tx,
      command.companyId,
      loaded.map((edv) => edv.id),
    );
  }

  private async upsertTaskDisciplineReviewInTx(
    tx: PrismaTx,
    input: {
      companyId: string;
      taskDisciplineId: string;
      tier: ReviewTier;
      status: TaskDisciplineReviewStatus;
      actorId: string;
    },
  ): Promise<void> {
    if (!input.taskDisciplineId) {
      this.logger.warn(
        'Skipping TaskDisciplineReview write - taskDisciplineId unavailable',
      );
      return;
    }

    const isTerminal =
      input.status === TaskDisciplineReviewStatus.APPROVED ||
      input.status === TaskDisciplineReviewStatus.RETURNED;

    await tx.taskDisciplineReview.upsert({
      where: {
        taskDisciplineId_reviewTier: {
          taskDisciplineId: input.taskDisciplineId,
          reviewTier: input.tier,
        },
      },
      create: {
        companyId: input.companyId,
        taskDisciplineId: input.taskDisciplineId,
        reviewTier: input.tier,
        status: input.status,
        reviewedAt: isTerminal ? new Date() : null,
        reviewedBy: isTerminal ? input.actorId : null,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
      update: {
        status: input.status,
        reviewedAt: isTerminal ? new Date() : undefined,
        reviewedBy: isTerminal ? input.actorId : undefined,
        updatedBy: input.actorId,
      },
    });
  }

  private async advanceActiveSessionTierInTx(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      sessionId: string;
      correlationId: string;
      triggerAction: string;
      nextTier: ReviewTier;
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

    const nextTier = input.nextTier;
    const discipline = await this.epcReviewRepository.findPackageWithDiscipline(
      tx,
      input.companyId,
      session.designPackageId,
    );
    const effectiveChain = discipline
      ? getEffectiveApprovalChain(discipline, discipline.taskDiscipline)
      : null;
    const assignee = this.resolveAssigneeForTierAdvance(
      nextTier,
      discipline,
      effectiveChain,
    );

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

  /**
   * Ensures the actor holds the discipline role matching the session's current tier.
   */
  private assertActorMatchesReviewTier(
    actorId: string,
    currentTier: ReviewTier,
    packageWithDiscipline?: (PackageApprovalChainOverrides & {
      taskDiscipline: {
        ownerUserId: string | null;
        reviewerUserId: string | null;
        disciplineLeadUserId: string | null;
        chiefUserId: string | null;
        instituteChiefUserId?: string | null;
        designerUserId?: string | null;
        supportingDesignerUserId?: string | null;
      };
    }) | null,
    // Only passed by approveReviewSession - enables the DEPT_CHIEF to approve
    // the INSTITUTE_CHIEF tier on behalf of an external Institute Chief with
    // no system account. Omitted entirely elsewhere (e.g. returnPackageForRework)
    // so this bypass never applies to other actions.
    proxyApproval?: { approvedOnBehalfOfName?: string },
  ): void {
    if (!packageWithDiscipline) {
      throw new ForbiddenException('Actor role does not match current review tier.');
    }

    const effectiveChain = getEffectiveApprovalChain(
      packageWithDiscipline,
      {
        ownerUserId: packageWithDiscipline.taskDiscipline.ownerUserId,
        reviewerUserId: packageWithDiscipline.taskDiscipline.reviewerUserId,
        disciplineLeadUserId:
          packageWithDiscipline.taskDiscipline.disciplineLeadUserId,
        chiefUserId: packageWithDiscipline.taskDiscipline.chiefUserId,
        instituteChiefUserId:
          packageWithDiscipline.taskDiscipline.instituteChiefUserId ?? null,
        designerUserId:
          packageWithDiscipline.taskDiscipline.designerUserId ?? null,
        supportingDesignerUserId:
          packageWithDiscipline.taskDiscipline.supportingDesignerUserId ?? null,
      },
    );

    if (
      proxyApproval !== undefined &&
      currentTier === ReviewTier.INSTITUTE_CHIEF &&
      packageWithDiscipline &&
      isExternalInstituteChief(packageWithDiscipline) &&
      actorId === effectiveChain.chiefUserId
    ) {
      if (!proxyApproval.approvedOnBehalfOfName?.trim()) {
        throw new BadRequestException(
          'Approving on behalf of the Institute Chief requires their name.',
        );
      }
      return;
    }

    if (
      proxyApproval?.approvedOnBehalfOfName?.trim() &&
      packageWithDiscipline &&
      !isExternalInstituteChief(packageWithDiscipline)
    ) {
      throw new BadRequestException(
        'Institute Chief on-behalf approval is only allowed for an external Institute Chief with no system account.',
      );
    }

    const actorTiers = REVIEW_TIER_ORDER.filter(
      (tier) =>
        this.reviewSla.resolveAssigneeForTier(tier, effectiveChain) === actorId,
    );

    if (!actorTiers.includes(currentTier as (typeof REVIEW_TIER_ORDER)[number])) {
      throw new ForbiddenException('Actor role does not match current review tier.');
    }
  }

  private resolveAssigneeForTierAdvance(
    nextTier: ReviewTier,
    discipline: (PackageApprovalChainOverrides & {
      instituteChiefName?: string | null;
    }) | null,
    effectiveChain: {
      ownerUserId: string | null;
      reviewerUserId: string | null;
      disciplineLeadUserId: string | null;
      chiefUserId: string | null;
      instituteChiefUserId?: string | null;
    } | null,
  ): string | null {
    if (!effectiveChain) {
      return null;
    }

    const assignee = this.reviewSla.resolveAssigneeForTier(nextTier, effectiveChain);
    if (assignee) {
      return assignee;
    }

    if (
      nextTier === ReviewTier.INSTITUTE_CHIEF &&
      discipline &&
      isExternalInstituteChief(discipline)
    ) {
      return effectiveChain.chiefUserId;
    }

    return null;
  }

  /**
   * Designers may progress comments after return-for-rework; reviewers may verify.
   */
  private canTransitionCommentInSession(
    sessionStatus: ReviewSessionStatus,
    targetStatus: CommentStatus,
    isAssignee: boolean,
  ): boolean {
    if (sessionStatus === ReviewSessionStatus.ACTIVE) {
      return true;
    }

    if (sessionStatus === ReviewSessionStatus.RETURNED_FOR_REWORK) {
      const designerTargets = new Set<CommentStatus>([
        CommentStatus.ACKNOWLEDGED,
        CommentStatus.IN_PROGRESS,
        CommentStatus.RESOLVED,
      ]);
      if (isAssignee && designerTargets.has(targetStatus)) {
        return true;
      }
      // Reviewer verifies revised comments without requiring a new ACTIVE session.
      return targetStatus === CommentStatus.VERIFIED;
    }

    return false;
  }

  /**
   * After rework, move package items off SUPERSEDED EDVs onto the current draft.
   */
  private async syncPackageItemsToCurrentDrafts(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<void> {
    const items = await tx.designPackageItem.findMany({
      where: { companyId, designPackageId },
      include: {
        engineeringDocumentVersion: {
          select: {
            id: true,
            status: true,
            engineeringDocumentId: true,
          },
        },
      },
    });

    for (const item of items) {
      const edv = item.engineeringDocumentVersion;
      if (
        edv.status === EdvStatus.DRAFT ||
        edv.status === EdvStatus.IN_REVIEW
      ) {
        continue;
      }

      const currentDraft = await tx.engineeringDocumentVersion.findFirst({
        where: activeOnly({
          companyId,
          engineeringDocumentId: edv.engineeringDocumentId,
          status: EdvStatus.DRAFT,
        }),
        orderBy: [{ isCurrent: 'desc' }, { createdAt: 'desc' }],
        select: { id: true },
      });
      if (!currentDraft || currentDraft.id === item.engineeringDocumentVersionId) {
        continue;
      }

      const conflict = await tx.designPackageItem.findFirst({
        where: {
          companyId,
          designPackageId,
          engineeringDocumentVersionId: currentDraft.id,
          NOT: { id: item.id },
        },
        select: { id: true },
      });
      if (conflict) {
        await tx.designPackageItem.delete({ where: { id: item.id } });
        continue;
      }

      await tx.designPackageItem.update({
        where: { id: item.id },
        data: { engineeringDocumentVersionId: currentDraft.id },
      });
    }
  }

  /**
   * Reopens a RETURNED_FOR_REWORK session so revised work reappears in the
   * returning reviewer's inbox with existing comments intact.
   */
  private async reopenReturnedSessionInTx(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      correlationId: string;
      projectId: string;
      designPackageId: string;
      taskDisciplineId: string;
      session: ReviewSession;
      action: string;
    },
  ): Promise<WorkflowResultSnapshot> {
    if (input.session.status !== ReviewSessionStatus.RETURNED_FOR_REWORK) {
      throw new BadRequestException('Only returned sessions can be reopened');
    }

    await this.syncPackageItemsToCurrentDrafts(
      tx,
      input.companyId,
      input.designPackageId,
    );

    const pkg = await this.epcWorkflowRepository.findPackageWithItems(
      tx,
      input.companyId,
      input.designPackageId,
    );
    if (!pkg) {
      throw new NotFoundException('Design package not found');
    }

    const edvIds = pkg.items.map((i) => i.engineeringDocumentVersionId);
    const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
      tx,
      input.companyId,
      edvIds,
    );
    this.conflictGuard.assertBatchEdvsResolved(edvIds, loaded);

    for (const edv of loaded) {
      const status = edv.status as EdvStatus;
      if (status !== EdvStatus.DRAFT && status !== EdvStatus.IN_REVIEW) {
        throw new ConflictException(
          `Package EDV ${edv.id} must be DRAFT before resubmitting; found ${status}. Upload a new revision first.`,
        );
      }
    }

    const discipline = await this.epcReviewRepository.findPackageWithDiscipline(
      tx,
      input.companyId,
      input.designPackageId,
    );
    const taskDiscipline = discipline?.taskDiscipline;
    const effectiveChain =
      discipline && taskDiscipline
        ? getEffectiveApprovalChain(discipline, taskDiscipline)
        : null;
    const reopenTier = input.session.currentTier;
    // Prefer the reviewer who held the session when it was returned.
    const assignedToUserId =
      input.session.assignedToUserId ??
      (effectiveChain
        ? this.reviewSla.resolveAssigneeForTier(reopenTier, effectiveChain)
        : null);
    if (!assignedToUserId) {
      throw new BadRequestException(
        'Cannot reopen review session: no assignee for the returning tier',
      );
    }
    const openedAt = new Date();
    const slaDeadlineAt = this.reviewSla.computeDeadline(openedAt, reopenTier);

    await this.epcReviewRepository.updateReviewSession(tx, input.session.id, {
      status: ReviewSessionStatus.ACTIVE,
      outcome: ReviewSessionOutcome.PENDING,
      closedAt: null,
      closedReason: null,
      openedAt,
      slaDeadlineAt,
      slaEscalatedAt: null,
      assignedToUser: { connect: { id: assignedToUserId } },
      updatedBy: input.actorId,
    });

    const frozen = await this.reviewContextSnapshot.buildFrozenContext(
      tx,
      input.companyId,
      input.designPackageId,
    );
    await this.epcReviewRepository.upsertContextSnapshot(tx, {
      companyId: input.companyId,
      reviewSessionId: input.session.id,
      referencedVersionIds: frozen.referencedVersionIds,
      contentHash: frozen.contentHash,
      capturedBy: input.actorId,
    });

    await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
      companyId: input.companyId,
      actorId: input.actorId,
      entityType: WorkflowEntityType.ReviewSession,
      entityId: input.session.id,
      action: input.action,
      beforeState: {
        status: ReviewSessionStatus.RETURNED_FOR_REWORK,
      },
      afterState: {
        status: ReviewSessionStatus.ACTIVE,
        currentTier: reopenTier,
        assignedToUserId,
        snapshotHash: frozen.contentHash,
      },
      correlationId: input.correlationId,
    });

    await this.upsertTaskDisciplineReviewInTx(tx, {
      companyId: input.companyId,
      taskDisciplineId: input.taskDisciplineId,
      tier: reopenTier,
      status: TaskDisciplineReviewStatus.IN_REVIEW,
      actorId: input.actorId,
    });

    const results = await this.edvTransitionService.applyInTx(tx, {
      companyId: input.companyId,
      actorId: input.actorId,
      correlationId: input.correlationId,
      projectId: input.projectId,
      designPackageId: input.designPackageId,
      permissionActionOverride: EpcWorkflowAction.DESIGN_PACKAGE_SUBMIT,
      transitions: loaded
        .filter((edv) => (edv.status as EdvStatus) === EdvStatus.DRAFT)
        .map((edv) => ({
          engineeringDocumentVersionId: edv.id,
          targetStatus: EdvStatus.IN_REVIEW,
          reason: `${input.action} session=${input.session.id}`,
        })),
    });

    await this.epcReviewRepository.markPackageSubmitted(
      tx,
      input.designPackageId,
      input.actorId,
    );

    const phaseB = await this.stateProjection.recomputeDirtyInTx(
      tx,
      input.companyId,
      input.actorId,
      { packageIds: [input.designPackageId] },
    );

    return this.buildReviewSnapshot(
      'SubmitPackageForReview',
      input.correlationId,
      results,
      phaseB,
      input.session.id,
      input.designPackageId,
      input.taskDisciplineId,
    );
  }

  /**
   * Resolves whether the actor should apply designer or reviewer comment transitions.
   * Assignee stays the designer (directed-to); authors/governance tiers verify as reviewers
   * via createdBy / approval-chain match - not via assignee flip.
   */
  private resolveCommentActor(
    userId: string,
    comment: { assignedToUserId: string; createdBy: string },
    packageWithDiscipline?: (PackageApprovalChainOverrides & {
      taskDiscipline: DisciplineApprovalChain;
    }) | null,
    targetStatus?: CommentStatus,
  ): CommentActorRole {
    const effectiveChain = packageWithDiscipline
      ? getEffectiveApprovalChain(
          packageWithDiscipline,
          packageWithDiscipline.taskDiscipline,
        )
      : null;

    const isReviewChain =
      comment.createdBy === userId ||
      effectiveChain?.ownerUserId === userId ||
      effectiveChain?.reviewerUserId === userId ||
      effectiveChain?.disciplineLeadUserId === userId ||
      effectiveChain?.chiefUserId === userId ||
      effectiveChain?.instituteChiefUserId === userId;

    // Prefer reviewer identity for verify, and whenever the actor is the author
    // or a governance-tier holder.
    if (
      isReviewChain &&
      (targetStatus === CommentStatus.VERIFIED || comment.createdBy === userId)
    ) {
      return 'reviewer';
    }

    if (
      comment.assignedToUserId === userId ||
      effectiveChain?.designerUserId === userId ||
      effectiveChain?.supportingDesignerUserId === userId
    ) {
      return 'designer';
    }

    if (isReviewChain) {
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

  /**
   * Attaches a document to the active review session at the current tier.
   */
  async addSessionAttachment(input: {
    companyId: string;
    actorId: string;
    designPackageId: string;
    reviewSessionId: string;
    documentId: string;
    purpose?: string;
    note?: string;
  }): Promise<MappedReviewSessionAttachment> {
    const session = await this.epcReviewRepository.findSessionForCompany(
      input.companyId,
      input.reviewSessionId,
    );
    if (!session || session.designPackageId !== input.designPackageId) {
      throw new NotFoundException('Review session not found');
    }
    if (session.status !== ReviewSessionStatus.ACTIVE) {
      throw new BadRequestException(
        'Attachments can only be added to an active review session',
      );
    }
    if (session.assignedToUserId !== input.actorId) {
      throw new ForbiddenException(
        "Only the current tier's reviewer can attach files during their review.",
      );
    }

    const document = await this.epcReviewRepository.findDocumentForCompany(
      input.companyId,
      input.documentId,
    );
    if (!document) {
      throw new NotFoundException('Document not found');
    }

    const row = await this.epcReviewRepository.createSessionAttachment({
      companyId: input.companyId,
      reviewSessionId: input.reviewSessionId,
      tier: session.currentTier,
      attachedByUserId: input.actorId,
      documentId: input.documentId,
      purpose: input.purpose,
      note: input.note,
    });

    return mapReviewSessionAttachment(row);
  }

  /**
   * Lists all tier attachments for a review session.
   */
  async listSessionAttachments(input: {
    companyId: string;
    designPackageId: string;
    reviewSessionId: string;
  }): Promise<MappedReviewSessionAttachment[]> {
    const session = await this.epcReviewRepository.findSessionForCompany(
      input.companyId,
      input.reviewSessionId,
    );
    if (!session || session.designPackageId !== input.designPackageId) {
      throw new NotFoundException('Review session not found');
    }

    const rows = await this.epcReviewRepository.listSessionAttachments(
      input.companyId,
      input.reviewSessionId,
    );
    return mapReviewSessionAttachments(rows);
  }
}
