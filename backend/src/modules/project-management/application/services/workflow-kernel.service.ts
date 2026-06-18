import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EdvStatus as PrismaEdvStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import {
  BatchApproveEdvsCommand,
  LockPackageEdvsCommand,
  TransitionEdvStatusCommand,
  WorkflowCommand,
  WorkflowCommandType,
  WorkflowResultSnapshot,
} from '../../domain/contracts/workflow-kernel.contract';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { ConflictGuardService } from './conflict-guard.service';
import { PermissionResolverService } from './permission-resolver.service';
import {
  PhaseBProjectionResult,
  StateProjectionService,
} from './state-projection.service';
import { StatusWriteGateService } from './status-write-gate.service';

interface PhaseATransitionResult {
  readonly edvId: string;
  readonly from: EdvStatus;
  readonly to: EdvStatus;
  readonly intentEventId: string;
}

interface ProjectionHints {
  readonly packageId?: string;
  readonly disciplineId?: string;
}

/**
 * WorkflowKernel — Phase A + Phase B (Wave 3).
 * EDV transitions, INTENT events, and structural aggregate projection in one transaction.
 */
@Injectable()
export class WorkflowKernelService {
  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly statusWriteGate: StatusWriteGateService,
    private readonly conflictGuard: ConflictGuardService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly stateProjection: StateProjectionService,
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
      case 'LockPackageEdvs':
        return this.executeLockPackageEdvs(command, correlationId);
      default:
        throw new UnprocessableEntityException(
          `Command ${command.type} is not available in Wave 3`,
        );
    }
  }

  private async executeTransitionEdvStatus(
    command: TransitionEdvStatusCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.epcWorkflowRepository.runPhaseAB(async (tx) => {
      const results = await this.applyEdvTransitionsInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId: await this.resolveProjectId(tx, command),
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

      const ctx = await this.epcWorkflowRepository.findPackageContextByEdvId(
        tx,
        command.companyId,
        command.engineeringDocumentVersionId,
      );

      return this.buildSnapshot(
        'TransitionEdvStatus',
        correlationId,
        results,
        phaseB,
        {
          packageId: ctx?.designPackageId,
          disciplineId: ctx?.taskDisciplineId,
        },
      );
    });
  }

  private async executeBatchApproveEdvs(
    command: BatchApproveEdvsCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.epcWorkflowRepository.runPhaseAB(async (tx) => {
      const pkg = await this.epcWorkflowRepository.findPackageWithItems(
        tx,
        command.companyId,
        command.designPackageId,
      );
      if (!pkg) {
        throw new BadRequestException('Design package not found');
      }

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

      const results = await this.applyEdvTransitionsInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        transitions: plan.map((p) => ({
          engineeringDocumentVersionId: p.edvId,
          targetStatus: p.to,
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
      );
    });
  }

  private async executeLockPackageEdvs(
    command: LockPackageEdvsCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.epcWorkflowRepository.runPhaseAB(async (tx) => {
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

      const results = await this.applyEdvTransitionsInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        transitions: plan.map((p) => ({
          engineeringDocumentVersionId: p.edvId,
          targetStatus: p.to,
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
    });
  }

  private async applyEdvTransitionsInTx(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      correlationId: string;
      projectId: string;
      transitions: readonly {
        engineeringDocumentVersionId: string;
        targetStatus: EdvStatus;
        reason?: string;
      }[];
    },
  ): Promise<PhaseATransitionResult[]> {
    const results: PhaseATransitionResult[] = [];

    for (const transition of input.transitions) {
      const edv = await this.epcWorkflowRepository.findEdvWithDiscipline(
        tx,
        input.companyId,
        transition.engineeringDocumentVersionId,
      );
      if (!edv) {
        throw new BadRequestException(
          `EDV ${transition.engineeringDocumentVersionId} not found`,
        );
      }

      const from = edv.status as EdvStatus;
      const to = transition.targetStatus;

      this.statusWriteGate.assertTransition({ from, to });

      await this.permissionResolver.assertEdvTransitionAllowed({
        companyId: input.companyId,
        userId: input.actorId,
        projectId: input.projectId,
        edv,
        targetStatus: to as PrismaEdvStatus,
      });

      const beforeState: Prisma.InputJsonValue = {
        edvStatus: from,
        revisionLabel: edv.revisionLabel,
      };

      await this.epcWorkflowRepository.updateEdvStatus(
        tx,
        edv.id,
        to as PrismaEdvStatus,
        input.actorId,
      );

      const afterState: Prisma.InputJsonValue = {
        edvStatus: to,
        revisionLabel: edv.revisionLabel,
      };

      const intentEvent = await this.epcWorkflowRepository.appendIntentEvent(tx, {
        companyId: input.companyId,
        actorId: input.actorId,
        entityId: edv.id,
        action: `TRANSITION_${from}_TO_${to}`,
        beforeState,
        afterState,
        reason: transition.reason,
        correlationId: input.correlationId,
      });

      results.push({
        edvId: edv.id,
        from,
        to,
        intentEventId: intentEvent.id,
      });
    }

    await this.epcWorkflowRepository.markPackagesProjectionPending(
      tx,
      input.companyId,
      results.map((r) => r.edvId),
    );

    return results;
  }

  private buildSnapshot(
    commandType: WorkflowCommandType,
    correlationId: string,
    results: readonly PhaseATransitionResult[],
    phaseB: PhaseBProjectionResult,
    hints: ProjectionHints = {},
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
