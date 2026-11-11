import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  EdvStatus as PrismaEdvStatus,
  ReviewSessionStatus,
  ReviewTier,
  WorkflowEntityType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PmContext } from '../types/pm-context.type';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import {
  AddReviewCommentCommand,
  ApproveReviewSessionCommand,
  BatchApproveEdvsCommand,
  BatchReturnEdvsCommand,
  AddSubmittalItemsCommand,
  CreateDesignSubmittalCommand,
  IssueSubmittalCommand,
  LockPackageEdvsCommand,
  ReturnPackageForReworkCommand,
  SubmitPackageForReviewCommand,
  TransitionCommentStatusCommand,
  TransitionEdvStatusCommand,
  TriggerRevisionCommand,
  VerifyReviewCommentCommand,
  RemoveReviewCommentCommand,
  UpdateReviewCommentCommand,
  WorkflowCommand,
  WorkflowCommandType,
  WorkflowResultSnapshot,
} from '../../domain/contracts/workflow-kernel.contract';
import { EpcWorkflowAction } from '../../domain/contracts/enums/epc-workflow-action.enum';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { ConflictGuardService } from './conflict-guard.service';
import { DefinitionOfDoneService } from './definition-of-done.service';
import { EdvTransitionService, PhaseATransitionResult } from './edv-transition.service';
import { PermissionResolverService } from './permission-resolver.service';
import { ReviewWorkflowService } from './review-workflow.service';
import { StatusWriteGateService } from './status-write-gate.service';
import { SubmittalWorkflowService } from './submittal-workflow.service';
import { RevisionOrchestratorService } from './revision-orchestrator.service';
import {
  PhaseBProjectionResult,
  StateProjectionService,
} from './state-projection.service';
import { WorkflowTransactionRunner } from './workflow-transaction-runner.service';

interface ProjectionHints {
  readonly packageId?: string;
  readonly disciplineId?: string;
}

export interface ReassignReviewSessionCommand {
  readonly reviewSessionId: string;
  readonly newAssigneeUserId: string;
  readonly reason: string;
}

const REASSIGNMENT_ADMIN_ROLES = new Set([
  'System Administrator',
  'Project Administrator',
  'Managing Director',
]);

/**
 * WorkflowKernel - Phase A + Phase B with review lifecycle (Wave 4).
 * EDV transitions remain sole lifecycle authority.
 */
@Injectable()
export class WorkflowKernelService {
  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly epcReviewRepository: EpcReviewRepository,
    private readonly edvTransitionService: EdvTransitionService,
    private readonly statusWriteGate: StatusWriteGateService,
    private readonly conflictGuard: ConflictGuardService,
    private readonly definitionOfDone: DefinitionOfDoneService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly stateProjection: StateProjectionService,
    private readonly reviewWorkflow: ReviewWorkflowService,
    private readonly submittalWorkflow: SubmittalWorkflowService,
    private readonly revisionOrchestrator: RevisionOrchestratorService,
    private readonly workflowTransactionRunner: WorkflowTransactionRunner,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Single orchestration entry for workflow mutations.
   */
  async execute(command: WorkflowCommand): Promise<WorkflowResultSnapshot> {
    const correlationId =
      command.correlationId ?? command.idempotencyKey ?? randomUUID();

    if (command.idempotencyKey) {
      const replay = await this.tryReplayIdempotent(
        command.companyId,
        command.idempotencyKey,
        command.type,
      );
      if (replay) {
        return replay;
      }
    }

    switch (command.type) {
      case 'TransitionEdvStatus':
        return this.executeTransitionEdvStatus(command, correlationId);
      case 'BatchApproveEdvs':
        return this.executeBatchApproveEdvs(command, correlationId);
      case 'BatchReturnEdvs':
        return this.reviewWorkflow.batchReturnEdvs(command, correlationId);
      case 'LockPackageEdvs':
        return this.executeLockPackageEdvs(command, correlationId);
      case 'SubmitPackageForReview':
        return this.reviewWorkflow.submitPackageForReview(command, correlationId);
      case 'AddReviewComment':
        return this.reviewWorkflow.addReviewComment(command, correlationId);
      case 'TransitionCommentStatus':
        return this.reviewWorkflow.transitionCommentStatus(command, correlationId);
      case 'VerifyReviewComment':
        return this.reviewWorkflow.verifyReviewComment(command, correlationId);
      case 'RemoveReviewComment':
        return this.reviewWorkflow.removeReviewComment(command, correlationId);
      case 'UpdateReviewComment':
        return this.reviewWorkflow.updateReviewComment(command, correlationId);
      case 'ApproveReviewSession':
        return this.reviewWorkflow.approveReviewSession(command, correlationId);
      case 'ReturnPackageForRework':
        return this.reviewWorkflow.returnPackageForRework(command, correlationId);
      case 'CreateDesignSubmittal':
        return this.submittalWorkflow.createDesignSubmittal(command, correlationId);
      case 'IssueSubmittal':
        return this.submittalWorkflow.issueSubmittal(command, correlationId);
      case 'AddSubmittalItems':
        return this.submittalWorkflow.addSubmittalItems(command, correlationId);
      case 'TriggerRevision':
        return this.revisionOrchestrator.triggerRevision(command, correlationId);
      default: {
        const exhaustive: never = command;
        throw new UnprocessableEntityException(
          `Command ${(exhaustive as WorkflowCommand).type} is not available`,
        );
      }
    }
  }

  /**
   * Admin-only reassignment of an active review session assignee.
   */
  async reassignReviewSession(
    ctx: PmContext,
    command: ReassignReviewSessionCommand,
  ): Promise<{ correlationId: string }> {
    if (command.reason.trim().length < 10) {
      throw new BadRequestException(
        'Reassignment reason must be at least 10 characters',
      );
    }

    await this.assertAdminReassignmentAllowed(ctx);

    const correlationId = randomUUID();

    await this.workflowTransactionRunner.runPhaseAB(async (tx) => {
      const session = await this.epcReviewRepository.findSessionById(
        tx,
        ctx.companyId,
        command.reviewSessionId,
      );
      if (!session) {
        throw new NotFoundException('Review session not found');
      }
      if (session.status !== ReviewSessionStatus.ACTIVE) {
        throw new BadRequestException('Review session must be ACTIVE to reassign');
      }

      const assignee = await tx.user.findFirst({
        where: activeOnly({
          id: command.newAssigneeUserId,
          companyId: ctx.companyId,
        }),
        select: { id: true },
      });
      if (!assignee) {
        throw new NotFoundException('User not found');
      }

      const previousAssigneeUserId = session.assignedToUserId;

      await this.epcReviewRepository.updateReviewSession(tx, session.id, {
        assignedToUser: { connect: { id: command.newAssigneeUserId } },
        updatedBy: ctx.userId,
      });

      await this.epcReviewRepository.appendWorkflowIntentEvent(tx, {
        companyId: ctx.companyId,
        actorId: ctx.userId,
        entityType: WorkflowEntityType.ReviewSession,
        entityId: session.id,
        action: 'SESSION_REASSIGNED',
        beforeState: { currentAssigneeUserId: previousAssigneeUserId },
        afterState: { currentAssigneeUserId: command.newAssigneeUserId },
        reason: command.reason,
        correlationId,
      });
    }, { companyId: ctx.companyId, correlationId });

    return { correlationId };
  }

  private async assertAdminReassignmentAllowed(ctx: PmContext): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (!roleNames.some((name) => REASSIGNMENT_ADMIN_ROLES.has(name))) {
      throw new ForbiddenException(
        'Only System Administrator or Managing Director can reassign review sessions',
      );
    }
  }

  private async executeTransitionEdvStatus(
    command: TransitionEdvStatusCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowTransactionRunner.runPhaseAB(async (tx) => {
      const packageCtx = await this.epcWorkflowRepository.findPackageContextByEdvId(
        tx,
        command.companyId,
        command.engineeringDocumentVersionId,
      );

      const existingEdv = await this.epcWorkflowRepository.findEdvWithDiscipline(
        tx,
        command.companyId,
        command.engineeringDocumentVersionId,
      );
      if (
        existingEdv?.status === PrismaEdvStatus.LOCKED &&
        command.targetStatus === EdvStatus.APPROVED &&
        packageCtx?.designPackageId
      ) {
        const pkg = await this.epcWorkflowRepository.findPackageWithItems(
          tx,
          command.companyId,
          packageCtx.designPackageId,
        );
        if (pkg?.packageStatus === 'CLOSED') {
          throw new BadRequestException(
            'Reopen the subtask before unlocking engineering document versions',
          );
        }
      }

      const results = await this.edvTransitionService.applyInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId: await this.resolveProjectId(tx, command),
        designPackageId: packageCtx?.designPackageId,
        transitions: [
          {
            engineeringDocumentVersionId: command.engineeringDocumentVersionId,
            targetStatus: command.targetStatus,
            reason: command.reason,
          },
        ],
      });

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
      );

      return this.buildSnapshot(
        'TransitionEdvStatus',
        correlationId,
        results,
        phaseB,
        {
          packageId: packageCtx?.designPackageId,
          disciplineId: packageCtx?.taskDisciplineId,
        },
      );
    }, { companyId: command.companyId, correlationId });
  }

  private async executeBatchApproveEdvs(
    command: BatchApproveEdvsCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowTransactionRunner.runPhaseAB(async (tx) => {
      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        command.designPackageId,
      );
      if (!pkg) {
        throw new BadRequestException('Design package not found');
      }

      const session = await this.epcReviewRepository.findSessionById(
        tx,
        command.companyId,
        command.reviewSessionId,
      );
      if (!session) {
        throw new BadRequestException('Review session not found');
      }
      this.conflictGuard.assertReviewSessionActiveForPackage(
        session.status,
        session.designPackageId,
        command.designPackageId,
      );

      if (session.currentTier !== ReviewTier.DEPT_CHIEF) {
        throw new ConflictException(
          'EDV batch approval is only allowed at the department chief tier. Use Approve & escalate to advance governance.',
        );
      }

      const commentStatuses =
        await this.epcReviewRepository.listCommentStatusesForPackageEdvs(
          tx,
          command.companyId,
          command.designPackageId,
          command.reviewSessionId,
        );
      this.conflictGuard.assertCommentsClearForApproval(
        commentStatuses as never,
      );
      this.definitionOfDone.assertPackageApprovalAllowed(
        commentStatuses as never,
      );

      const requestedIds = command.engineeringDocumentVersionIds;
      const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
        tx,
        command.companyId,
        requestedIds,
      );

      this.conflictGuard.assertBatchEdvsResolved(requestedIds, loaded);

      const plan = this.conflictGuard.assertBatchTransitionPlan(
        loaded,
        EdvStatus.APPROVED,
        [EdvStatus.IN_REVIEW],
      );

      const projectId = await this.resolveProjectIdFromDiscipline(
        loaded[0]!.engineeringDocument.taskDiscipline.taskId,
        command.companyId,
        tx,
      );

      const results = await this.edvTransitionService.applyInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        currentAssigneeUserId: session.assignedToUserId ?? undefined,
        permissionActionOverride: EpcWorkflowAction.REVIEW_SESSION_BATCH_APPROVE,
        designPackageId: command.designPackageId,
        transitions: plan.map((p) => ({
          engineeringDocumentVersionId: p.edvId,
          targetStatus: p.to as EdvStatus,
          reason: `BatchApproveEdvs package=${command.designPackageId}`,
        })),
      });

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
      );

      return this.buildSnapshot(
        'BatchApproveEdvs',
        correlationId,
        results,
        phaseB,
        {
          packageId: command.designPackageId,
          disciplineId: pkg.taskDisciplineId,
        },
        session.id,
      );
    }, { companyId: command.companyId, correlationId });
  }

  private async executeLockPackageEdvs(
    command: LockPackageEdvsCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.workflowTransactionRunner.runPhaseAB(async (tx) => {
      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        command.designPackageId,
      );
      if (!pkg) {
        throw new BadRequestException('Design package not found');
      }

      const edvIds = pkg.items.map((i) => i.engineeringDocumentVersionId);
      const loaded = await this.epcWorkflowRepository.findEdvsWithDiscipline(
        tx,
        command.companyId,
        edvIds,
      );

      this.conflictGuard.assertBatchEdvsResolved(edvIds, loaded);
      this.conflictGuard.assertPackageLockEligible(
        loaded.map((e) => e.status as EdvStatus),
        command.designPackageId,
      );

      const plan = this.conflictGuard.assertBatchTransitionPlan(
        loaded,
        EdvStatus.LOCKED,
        [EdvStatus.APPROVED],
      );

      const projectId = await this.resolveProjectIdFromDiscipline(
        loaded[0]!.engineeringDocument.taskDiscipline.taskId,
        command.companyId,
        tx,
      );

      const results = await this.edvTransitionService.applyInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        designPackageId: command.designPackageId,
        transitions: plan.map((p) => ({
          engineeringDocumentVersionId: p.edvId,
          targetStatus: p.to as EdvStatus,
          reason: `LockPackageEdvs package=${command.designPackageId}`,
        })),
      });

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
      );

      return this.buildSnapshot(
        'LockPackageEdvs',
        correlationId,
        results,
        phaseB,
        {
          packageId: command.designPackageId,
          disciplineId: pkg.taskDisciplineId,
        },
      );
    }, { companyId: command.companyId, correlationId });
  }

  private buildSnapshot(
    commandType: WorkflowCommandType,
    correlationId: string,
    results: readonly PhaseATransitionResult[],
    phaseB: PhaseBProjectionResult,
    hints: ProjectionHints = {},
    reviewSessionId?: string,
  ): WorkflowResultSnapshot {
    const edvStatuses: Record<string, EdvStatus> = {};
    for (const r of results) {
      edvStatuses[r.edvId] = r.to;
    }

    const packageProjectedStatus = hints.packageId
      ? phaseB.packageStatuses[hints.packageId]
      : undefined;
    const disciplineProjectedStatus = hints.disciplineId
      ? phaseB.disciplineStatuses[hints.disciplineId]
      : undefined;

    return {
      commandType,
      correlationId,
      affectedEdvIds: results.map((r) => r.edvId),
      edvStatuses,
      intentEventIds: results.map((r) => r.intentEventId),
      ...(reviewSessionId !== undefined && { reviewSessionId }),
      ...(packageProjectedStatus !== undefined && { packageProjectedStatus }),
      ...(disciplineProjectedStatus !== undefined && {
        disciplineProjectedStatus,
      }),
    };
  }

  private async tryReplayIdempotent(
    companyId: string,
    idempotencyKey: string,
    commandType: WorkflowCommandType,
  ): Promise<WorkflowResultSnapshot | null> {
    const events =
      await this.epcWorkflowRepository.findIntentEventsByCorrelation(
        companyId,
        idempotencyKey,
      );
    if (events.length === 0) {
      return null;
    }

    const edvStatuses: Record<string, EdvStatus> = {};
    for (const event of events) {
      const after = event.afterState as { edvStatus?: EdvStatus };
      if (after.edvStatus) {
        edvStatuses[event.entityId] = after.edvStatus;
      }
    }

    return {
      commandType,
      correlationId: idempotencyKey,
      affectedEdvIds: events.map((e) => e.entityId),
      edvStatuses,
      intentEventIds: events.map((e) => e.id),
    };
  }

  private async resolveProjectId(
    tx: PrismaTx,
    command: TransitionEdvStatusCommand,
  ): Promise<string> {
    const edv = await this.epcWorkflowRepository.findEdvWithDiscipline(
      tx,
      command.companyId,
      command.engineeringDocumentVersionId,
    );
    if (!edv) {
      throw new BadRequestException('EDV not found');
    }
    return this.resolveProjectIdFromDiscipline(
      edv.engineeringDocument.taskDiscipline.taskId,
      command.companyId,
      tx,
    );
  }

  private async resolveProjectIdFromDiscipline(
    taskId: string,
    companyId: string,
    tx: PrismaTx,
  ): Promise<string> {
    const task = await tx.task.findFirst({
      where: {
        id: taskId,
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
