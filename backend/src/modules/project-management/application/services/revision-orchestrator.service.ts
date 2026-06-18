import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EdvStatus,
  ExternalReviewTriggerStatus,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import { EdvStatus as DomainEdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { EpcWorkflowAction } from '../../domain/contracts/enums/epc-workflow-action.enum';
import {
  TriggerRevisionCommand,
  WorkflowResultSnapshot,
} from '../../domain/contracts/workflow-kernel.contract';
import { validateNewRevisionUpload } from '../../domain/edv-state-machine';
import { EpcSubmittalRepository } from '../../infrastructure/repositories/epc-submittal.repository';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { EdvTransitionService } from './edv-transition.service';
import { PermissionResolverService } from './permission-resolver.service';
import { StateProjectionService } from './state-projection.service';
import { PmContext } from '../types/pm-context.type';
import { SubmittalEdvSnapshotRow } from './submittal-snapshot.service';

/**
 * External revision loop — RFI/CR triggers new DRAFT EDV from LOCKED source.
 * Never mutates LOCKED EDV status.
 */
@Injectable()
export class RevisionOrchestratorService {
  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
    private readonly edvTransitionService: EdvTransitionService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly stateProjection: StateProjectionService,
  ) {}

  /**
   * Creates new DRAFT revision from latest LOCKED EDV (kernel command handler).
   */
  async triggerRevision(
    command: TriggerRevisionCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.epcWorkflowRepository.runPhaseAB(async (tx) => {
      const document = await tx.engineeringDocument.findFirst({
        where: {
          id: command.engineeringDocumentId,
          companyId: command.companyId,
          deletedAt: null,
        },
        select: {
          id: true,
          taskDisciplineId: true,
          taskDiscipline: { select: { taskId: true } },
        },
      });
      if (!document) {
        throw new NotFoundException('Engineering document not found');
      }

      const projectId = await this.resolveProjectId(
        tx,
        document.taskDiscipline.taskId,
        command.companyId,
      );

      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId,
        action: EpcWorkflowAction.REVISION_TRIGGER,
        taskDisciplineId: document.taskDisciplineId,
      });

      const existingVersions = await tx.engineeringDocumentVersion.findMany({
        where: {
          companyId: command.companyId,
          engineeringDocumentId: command.engineeringDocumentId,
          deletedAt: null,
        },
        orderBy: { createdAt: 'asc' },
      });

      const lockstep = validateNewRevisionUpload({
        existingEdvStatuses: existingVersions.map(
          (v) => v.status as DomainEdvStatus,
        ),
      });
      if (!lockstep.allowed) {
        throw new ConflictException(lockstep.message ?? 'Revision not allowed');
      }

      const lockedSource = existingVersions.find(
        (v) => v.status === EdvStatus.LOCKED,
      );
      if (!lockedSource) {
        throw new BadRequestException(
          'External revision requires a LOCKED source EDV',
        );
      }

      const supersedeTargets = existingVersions.filter(
        (v) =>
          v.status !== EdvStatus.LOCKED &&
          v.status !== EdvStatus.SUPERSEDED,
      );

      const transitionResults = await this.edvTransitionService.applyInTx(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        correlationId,
        projectId,
        transitions: [
          ...supersedeTargets.map((v) => ({
            engineeringDocumentVersionId: v.id,
            targetStatus: DomainEdvStatus.SUPERSEDED,
            reason: `Superseded by external revision (${command.triggerSource})`,
          })),
        ],
      });

      const revisionLabel = String(existingVersions.length);
      const newEdv = await tx.engineeringDocumentVersion.create({
        data: {
          companyId: command.companyId,
          engineeringDocumentId: command.engineeringDocumentId,
          documentVersionId: lockedSource.documentVersionId,
          revisionLabel,
          status: EdvStatus.DRAFT,
          createdBy: command.actorId,
          updatedBy: command.actorId,
        },
      });

      await tx.workflowEventLog.create({
        data: {
          companyId: command.companyId,
          actorId: command.actorId,
          entityType: WorkflowEntityType.EngineeringDocumentVersion,
          entityId: newEdv.id,
          action: 'TRIGGER_REVISION',
          phase: WorkflowEventPhase.INTENT,
          beforeState: {
            sourceEdvId: lockedSource.id,
            sourceRevisionLabel: lockedSource.revisionLabel,
          },
          afterState: {
            edvStatus: newEdv.status,
            revisionLabel: newEdv.revisionLabel,
            triggerSource: command.triggerSource,
            triggerEntityId: command.triggerEntityId,
          },
          reason: `External revision from ${command.triggerSource}`,
          correlationId,
        },
      });

      const phaseB = await this.stateProjection.recomputeDirtyInTx(
        tx,
        command.companyId,
        command.actorId,
      );

      const edvStatuses: Record<string, DomainEdvStatus> = {
        [newEdv.id]: DomainEdvStatus.DRAFT,
      };
      for (const r of transitionResults) {
        edvStatuses[r.edvId] = r.to;
      }

      return {
        commandType: 'TriggerRevision',
        correlationId,
        affectedEdvIds: [newEdv.id, ...transitionResults.map((r) => r.edvId)],
        edvStatuses,
        intentEventIds: transitionResults.map((r) => r.intentEventId),
        newEdvId: newEdv.id,
      };
    });
  }

  /**
   * Processes a PENDING external review trigger — one new EDV per affected document.
   */
  async processExternalReviewTrigger(
    ctx: PmContext,
    triggerId: string,
    correlationId?: string,
  ): Promise<WorkflowResultSnapshot[]> {
    const trigger = await this.epcSubmittalRepository.findExternalTriggerById(
      ctx.companyId,
      triggerId,
    );
    if (!trigger) {
      throw new NotFoundException('External review trigger not found');
    }
    if (trigger.status !== ExternalReviewTriggerStatus.PENDING) {
      throw new ConflictException('Trigger is not PENDING');
    }

    const documentIds = await this.resolveDocumentIdsFromTrigger(trigger);
    const results: WorkflowResultSnapshot[] = [];

    for (const engineeringDocumentId of documentIds) {
      const result = await this.triggerRevision(
        {
          type: 'TriggerRevision',
          companyId: ctx.companyId,
          actorId: ctx.userId,
          engineeringDocumentId,
          triggerSource:
            trigger.triggerType === 'RFI'
              ? 'RFI'
              : trigger.triggerType === 'CHANGE_REQUEST'
                ? 'CHANGE_REQUEST'
                : 'SUBMITTAL_REVIEW',
          triggerEntityId: trigger.sourceEntityId,
          correlationId,
        },
        correlationId ?? triggerId,
      );
      results.push(result);
    }

    await this.epcSubmittalRepository.markTriggerProcessed(
      ctx.companyId,
      triggerId,
      ctx.userId,
    );

    return results;
  }

  private async resolveDocumentIdsFromTrigger(trigger: {
    submittalItemIds: string[];
    companyId: string;
  }): Promise<string[]> {
    const documentIds = new Set<string>();

    for (const itemId of trigger.submittalItemIds) {
      const item = await this.epcSubmittalRepository.findSubmittalItemById(
        trigger.companyId,
        itemId,
      );
      if (!item?.snapshotPayload) {
        continue;
      }
      const rows = item.snapshotPayload as unknown as SubmittalEdvSnapshotRow[];
      for (const row of rows) {
        documentIds.add(row.engineeringDocumentId);
      }
    }

    if (documentIds.size === 0) {
      throw new BadRequestException(
        'Trigger has no engineering documents in submittal snapshots',
      );
    }

    return [...documentIds];
  }

  private async resolveProjectId(
    tx: PrismaTx,
    taskId: string,
    companyId: string,
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
      throw new BadRequestException('Task not found');
    }
    return task.projectId;
  }
}
