import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EdvStatus,
  ExternalReviewTriggerMode,
  ExternalReviewTriggerStatus,
  ExternalReviewTriggerType,
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
import {
  DesignPackageRepository,
  EngineeringDocumentVersionRepository,
} from '../../infrastructure/repositories/epc-storage.repository';
import { EpcSubmittalRepository } from '../../infrastructure/repositories/epc-submittal.repository';
import { DocumentNumberService } from './document-number.service';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { WorkflowTransactionRunner } from './workflow-transaction-runner.service';
import { EdvTransitionService, PhaseATransitionResult } from './edv-transition.service';
import { PermissionResolverService } from './permission-resolver.service';
import { StateProjectionService } from './state-projection.service';
import { PmContext } from '../types/pm-context.type';
import { SubmittalEdvSnapshotRow } from './submittal-snapshot.service';

export interface ProcessExternalReviewTriggerResult {
  triggerId: string;
  triggerStatus: ExternalReviewTriggerStatus;
  triggerMode: ExternalReviewTriggerMode;
  revision?: {
    succeeded: WorkflowResultSnapshot[];
    failed: Array<{ engineeringDocumentId: string; error: string }>;
    skipped: string[];
  };
  newPackageId?: string;
}

/**
 * External revision loop - RFI/Issue/CR triggers new DRAFT EDV from LOCKED source.
 * Never mutates LOCKED EDV status.
 */
@Injectable()
export class RevisionOrchestratorService {
  private readonly logger = new Logger(RevisionOrchestratorService.name);

  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
    private readonly designPackageRepository: DesignPackageRepository,
    private readonly edvTransitionService: EdvTransitionService,
    private readonly permissionResolver: PermissionResolverService,
    private readonly stateProjection: StateProjectionService,
    private readonly workflowTransactionRunner: WorkflowTransactionRunner,
    private readonly documentNumberService: DocumentNumberService,
    private readonly engineeringDocumentVersionRepository: EngineeringDocumentVersionRepository,
  ) {}

  /**
   * Creates new DRAFT revision from latest LOCKED EDV (kernel command handler).
   */
  async triggerRevision(
    command: TriggerRevisionCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    let priorEdvIds: string[] = [];

    const result = await this.workflowTransactionRunner.runPhaseAB<WorkflowResultSnapshot>(
      async (tx) => {
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

      const transitionResults: PhaseATransitionResult[] =
        await this.edvTransitionService.applyInTx(tx, {
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

      priorEdvIds = existingVersions.map((v) => v.id);

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

      await tx.engineeringDocumentVersion.updateMany({
        where: {
          engineeringDocumentId: newEdv.engineeringDocumentId,
          id: { not: newEdv.id },
          deletedAt: null,
        },
        data: { isCurrent: false },
      });
      await tx.engineeringDocumentVersion.update({
        where: { id: newEdv.id },
        data: { isCurrent: true },
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
    },
    { companyId: command.companyId, correlationId },
    );

    if (result.newEdvId) {
      await this.engineeringDocumentVersionRepository.retargetPackageItemsToNewEdv(
        command.companyId,
        priorEdvIds,
        result.newEdvId,
      );
    }

    return result;
  }

  /**
   * Processes a PENDING external review trigger.
   */
  async processExternalReviewTrigger(
    ctx: PmContext,
    triggerId: string,
    correlationId?: string,
  ): Promise<ProcessExternalReviewTriggerResult> {
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

    if (trigger.triggerMode === ExternalReviewTriggerMode.NEW_PACKAGE) {
      return this.processNewPackageTrigger(ctx, trigger, correlationId ?? triggerId);
    }

    return this.processRevisionTrigger(ctx, trigger, correlationId ?? triggerId);
  }

  private async processNewPackageTrigger(
    ctx: PmContext,
    trigger: {
      id: string;
      companyId: string;
      triggerType: ExternalReviewTriggerType;
      sourceEntityType: string;
      sourceEntityId: string;
      linkedDesignPackageId: string | null;
    },
    correlationId: string,
  ): Promise<ProcessExternalReviewTriggerResult> {
    if (!trigger.linkedDesignPackageId) {
      throw new BadRequestException(
        'NEW_PACKAGE mode requires a linked design package',
      );
    }

    const taskDisciplineId =
      await this.epcSubmittalRepository.findPackageTaskDisciplineId(
        ctx.companyId,
        trigger.linkedDesignPackageId,
      );
    if (!taskDisciplineId) {
      throw new NotFoundException('Linked design package not found');
    }

    const sourceEntityType = this.mapTriggerTypeToPackageSourceEntityType(
      trigger.triggerType,
    );
    const packageCode = await this.documentNumberService.getNextNumber(
      ctx,
      'SUBTASK',
    );
    const newPackage = await this.designPackageRepository.createRevisionPackageFromTrigger({
      companyId: ctx.companyId,
      taskDisciplineId,
      packageCode,
      name: `Revision Package - ${trigger.triggerType} ${trigger.sourceEntityId}`,
      sourceEntityType,
      sourceEntityId: trigger.sourceEntityId,
      createdBy: ctx.userId,
    });

    await this.epcSubmittalRepository.updateTriggerStatus(
      ctx.companyId,
      trigger.id,
      ctx.userId,
      ExternalReviewTriggerStatus.PROCESSED,
    );

    return {
      triggerId: trigger.id,
      triggerStatus: ExternalReviewTriggerStatus.PROCESSED,
      triggerMode: ExternalReviewTriggerMode.NEW_PACKAGE,
      newPackageId: newPackage.id,
    };
  }

  private async processRevisionTrigger(
    ctx: PmContext,
    trigger: {
      id: string;
      companyId: string;
      triggerType: ExternalReviewTriggerType;
      sourceEntityId: string;
      submittalItemIds: string[];
      linkedDesignPackageId: string | null;
    },
    correlationId: string,
  ): Promise<ProcessExternalReviewTriggerResult> {
    const documentIds = await this.resolveDocumentIdsFromTrigger(trigger);
    const succeeded: WorkflowResultSnapshot[] = [];
    const failed: Array<{ engineeringDocumentId: string; error: string }> = [];
    const skipped: string[] = [];

    for (const engineeringDocumentId of documentIds) {
      const hasDraft = await this.epcSubmittalRepository.documentHasDraftEdv(
        ctx.companyId,
        engineeringDocumentId,
      );
      if (hasDraft) {
        skipped.push(engineeringDocumentId);
        continue;
      }

      try {
        const result = await this.triggerRevision(
          {
            type: 'TriggerRevision',
            companyId: ctx.companyId,
            actorId: ctx.userId,
            engineeringDocumentId,
            triggerSource: this.mapTriggerTypeToRevisionSource(trigger.triggerType),
            triggerEntityId: trigger.sourceEntityId,
            correlationId,
          },
          correlationId,
        );
        succeeded.push(result);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Revision trigger failed';
        this.logger.warn(
          `Revision trigger failed for document ${engineeringDocumentId}: ${message}`,
        );
        failed.push({ engineeringDocumentId, error: message });
      }
    }

    const triggerStatus = this.resolveRevisionTriggerStatus(
      succeeded.length,
      failed.length,
      skipped.length,
      documentIds.length,
    );

    if (triggerStatus !== ExternalReviewTriggerStatus.PENDING) {
      await this.epcSubmittalRepository.updateTriggerStatus(
        ctx.companyId,
        trigger.id,
        ctx.userId,
        triggerStatus,
      );
    }

    return {
      triggerId: trigger.id,
      triggerStatus,
      triggerMode: ExternalReviewTriggerMode.REVISION,
      revision: { succeeded, failed, skipped },
    };
  }

  private resolveRevisionTriggerStatus(
    succeededCount: number,
    failedCount: number,
    skippedCount: number,
    totalCount: number,
  ): ExternalReviewTriggerStatus {
    if (failedCount === 0 && succeededCount + skippedCount === totalCount) {
      return ExternalReviewTriggerStatus.PROCESSED;
    }
    if (failedCount > 0 && succeededCount > 0) {
      return ExternalReviewTriggerStatus.PARTIAL;
    }
    if (failedCount > 0 && succeededCount === 0) {
      return ExternalReviewTriggerStatus.FAILED;
    }
    return ExternalReviewTriggerStatus.PROCESSED;
  }

  private mapTriggerTypeToRevisionSource(
    triggerType: ExternalReviewTriggerType,
  ): TriggerRevisionCommand['triggerSource'] {
    switch (triggerType) {
      case ExternalReviewTriggerType.RFI:
        return 'RFI';
      case ExternalReviewTriggerType.ISSUE:
        return 'ISSUE';
      case ExternalReviewTriggerType.CHANGE_REQUEST:
        return 'CHANGE_REQUEST';
      default:
        return 'SUBMITTAL_REVIEW';
    }
  }

  private mapTriggerTypeToPackageSourceEntityType(
    triggerType: ExternalReviewTriggerType,
  ): string {
    switch (triggerType) {
      case ExternalReviewTriggerType.RFI:
        return 'RFI';
      case ExternalReviewTriggerType.ISSUE:
        return 'ISSUE';
      case ExternalReviewTriggerType.CHANGE_REQUEST:
        return 'CHANGE_REQUEST';
      default:
        return triggerType;
    }
  }

  private async resolveDocumentIdsFromTrigger(trigger: {
    submittalItemIds: string[];
    linkedDesignPackageId: string | null;
    companyId: string;
  }): Promise<string[]> {
    if (trigger.linkedDesignPackageId) {
      const linkedDocumentIds =
        await this.epcSubmittalRepository.findEngineeringDocumentIdsForPackage(
          trigger.companyId,
          trigger.linkedDesignPackageId,
        );
      if (linkedDocumentIds.length > 0) {
        return linkedDocumentIds;
      }
    }

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
        'Trigger has no engineering documents to revise',
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
