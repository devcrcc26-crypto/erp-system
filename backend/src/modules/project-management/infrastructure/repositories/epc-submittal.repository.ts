import { Injectable } from '@nestjs/common';
import {
  ExternalReviewTriggerMode,
  ExternalReviewTriggerStatus,
  ExternalReviewTriggerType,
  EdvStatus,
  Prisma,
  Submittal,
  SubmittalItem,
  SubmittalPreparedByRole,
  SubmittalPurpose,
  SubmittalStatus,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PrismaTx } from './epc-workflow.repository';

export interface SubmittalWithItems extends Submittal {
  items: SubmittalItem[];
}

@Injectable()
export class EpcSubmittalRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findSubmittalWithItems(
    tx: PrismaTx,
    projectId: string,
    submittalId: string,
  ): Promise<SubmittalWithItems | null> {
    return tx.submittal.findFirst({
      where: activeOnly({ id: submittalId, projectId }),
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async createSubmittal(
    tx: PrismaTx,
    input: {
      projectId: string;
      submittedBy: string;
      submittalNumber: string;
      category: string;
      title: string;
      contractor?: string;
      supplier?: string;
      specReference?: string;
      submittalPurpose?: SubmittalPurpose;
      preparedByRole?: SubmittalPreparedByRole;
      taskDisciplineId?: string;
      createdBy: string;
    },
  ): Promise<Submittal> {
    return tx.submittal.create({
      data: {
        projectId: input.projectId,
        submittedBy: input.submittedBy,
        submittalNumber: input.submittalNumber,
        category: input.category,
        title: input.title,
        contractor: input.contractor,
        supplier: input.supplier,
        specReference: input.specReference,
        submittalPurpose: input.submittalPurpose,
        preparedByRole: input.preparedByRole,
        taskDisciplineId: input.taskDisciplineId,
        status: SubmittalStatus.DRAFT,
        createdBy: input.createdBy,
        updatedBy: input.createdBy,
      },
    });
  }

  async createSubmittalItem(
    tx: PrismaTx,
    input: {
      companyId: string;
      submittalId: string;
      designPackageId: string;
      sortOrder: number;
      createdBy: string;
    },
  ): Promise<SubmittalItem> {
    return tx.submittalItem.create({
      data: {
        companyId: input.companyId,
        submittalId: input.submittalId,
        designPackageId: input.designPackageId,
        sortOrder: input.sortOrder,
        createdBy: input.createdBy,
      },
    });
  }

  async captureItemSnapshot(
    tx: PrismaTx,
    itemId: string,
    input: {
      snapshotEdvIds: readonly string[];
      snapshotPayload: Prisma.InputJsonValue;
      contentHash: string;
      capturedBy: string;
    },
  ): Promise<SubmittalItem> {
    return tx.submittalItem.update({
      where: { id: itemId },
      data: {
        snapshotCaptured: true,
        snapshotEdvIds: [...input.snapshotEdvIds],
        snapshotPayload: input.snapshotPayload,
        contentHash: input.contentHash,
        capturedAt: new Date(),
        capturedBy: input.capturedBy,
      },
    });
  }

  async issueSubmittal(
    tx: PrismaTx,
    submittalId: string,
    updatedBy: string,
  ): Promise<Submittal> {
    const now = new Date();
    return tx.submittal.update({
      where: { id: submittalId },
      data: {
        status: SubmittalStatus.SUBMITTED,
        issuedAt: now,
        submissionDate: now,
        updatedBy,
      },
    });
  }

  async findPackageEdvStatuses(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<{ projectedStatus: string; edvStatuses: string[] } | null> {
    const pkg = await tx.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      select: { projectedStatus: true },
    });
    if (!pkg) {
      return null;
    }

    const items = await tx.designPackageItem.findMany({
      where: { companyId, designPackageId },
      select: { engineeringDocumentVersionId: true },
    });

    if (items.length === 0) {
      return { projectedStatus: pkg.projectedStatus, edvStatuses: [] };
    }

    const versions = await tx.engineeringDocumentVersion.findMany({
      where: activeOnly({
        companyId,
        id: { in: items.map((i) => i.engineeringDocumentVersionId) },
      }),
      select: { status: true },
    });

    return {
      projectedStatus: pkg.projectedStatus,
      edvStatuses: versions.map((v) => v.status),
    };
  }

  async assertPackagesBelongToProject(
    tx: PrismaTx,
    companyId: string,
    projectId: string,
    designPackageIds: readonly string[],
  ): Promise<void> {
    for (const packageId of designPackageIds) {
      const pkg = await tx.designPackage.findFirst({
        where: activeOnly({ id: packageId, companyId }),
        include: {
          taskDiscipline: { include: { task: { select: { projectId: true } } } },
        },
      });
      if (!pkg || pkg.taskDiscipline.task.projectId !== projectId) {
        throw new Error(`Design package ${packageId} not in project`);
      }
    }
  }

  async createExternalReviewTrigger(
    tx: PrismaTx,
    input: {
      companyId: string;
      projectId: string;
      triggerType: ExternalReviewTriggerType;
      sourceEntityType: string;
      sourceEntityId: string;
      submittalId?: string | null;
      submittalItemIds?: readonly string[];
      linkedDesignPackageId?: string | null;
      triggerMode?: ExternalReviewTriggerMode;
      payload?: Prisma.InputJsonValue;
      createdBy: string;
    },
  ): Promise<string> {
    const row = await tx.externalReviewTrigger.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId,
        triggerType: input.triggerType,
        sourceEntityType: input.sourceEntityType,
        sourceEntityId: input.sourceEntityId,
        submittalId: input.submittalId ?? null,
        submittalItemIds: [...(input.submittalItemIds ?? [])],
        linkedDesignPackageId: input.linkedDesignPackageId ?? null,
        payload: input.payload ?? {},
        status: ExternalReviewTriggerStatus.PENDING,
        triggerMode: input.triggerMode ?? ExternalReviewTriggerMode.REVISION,
        createdBy: input.createdBy,
      },
    });
    return row.id;
  }

  /**
   * Creates a PENDING trigger from an RFI/Issue/Change Request linked to a design package.
   */
  async createLinkedEntityTrigger(
    tx: PrismaTx,
    input: {
      companyId: string;
      projectId: string;
      triggerType: ExternalReviewTriggerType;
      sourceEntityType: string;
      sourceEntityId: string;
      linkedDesignPackageId: string;
      createdBy: string;
    },
  ): Promise<string> {
    return this.createExternalReviewTrigger(tx, {
      companyId: input.companyId,
      projectId: input.projectId,
      triggerType: input.triggerType,
      sourceEntityType: input.sourceEntityType,
      sourceEntityId: input.sourceEntityId,
      linkedDesignPackageId: input.linkedDesignPackageId,
      createdBy: input.createdBy,
    });
  }

  async appendWorkflowIntentEvent(
    tx: PrismaTx,
    input: {
      companyId: string;
      actorId: string;
      entityId: string;
      action: string;
      beforeState: Prisma.InputJsonValue;
      afterState: Prisma.InputJsonValue;
      reason?: string;
      correlationId?: string;
    },
  ): Promise<void> {
    await tx.workflowEventLog.create({
      data: {
        companyId: input.companyId,
        actorId: input.actorId,
        entityType: WorkflowEntityType.Submittal,
        entityId: input.entityId,
        action: input.action,
        phase: WorkflowEventPhase.INTENT,
        beforeState: input.beforeState,
        afterState: input.afterState,
        reason: input.reason,
        correlationId: input.correlationId,
      },
    });
  }

  async findExternalTriggerById(
    companyId: string,
    triggerId: string,
  ): Promise<{
    id: string;
    companyId: string;
    projectId: string;
    triggerType: ExternalReviewTriggerType;
    sourceEntityType: string;
    sourceEntityId: string;
    status: ExternalReviewTriggerStatus;
    triggerMode: ExternalReviewTriggerMode;
    submittalItemIds: string[];
    linkedDesignPackageId: string | null;
  } | null> {
    return this.prisma.externalReviewTrigger.findFirst({
      where: { id: triggerId, companyId },
      select: {
        id: true,
        companyId: true,
        projectId: true,
        triggerType: true,
        sourceEntityType: true,
        sourceEntityId: true,
        status: true,
        triggerMode: true,
        submittalItemIds: true,
        linkedDesignPackageId: true,
      },
    });
  }

  async findSubmittalItemById(
    companyId: string,
    itemId: string,
  ): Promise<{ id: string; snapshotPayload: Prisma.JsonValue } | null> {
    return this.prisma.submittalItem.findFirst({
      where: { id: itemId, companyId },
      select: { id: true, snapshotPayload: true },
    });
  }

  async markTriggerProcessed(
    companyId: string,
    triggerId: string,
    actorId: string,
  ): Promise<void> {
    await this.updateTriggerStatus(
      companyId,
      triggerId,
      actorId,
      ExternalReviewTriggerStatus.PROCESSED,
    );
  }

  /**
   * Updates trigger status after processing attempt.
   */
  async updateTriggerStatus(
    companyId: string,
    triggerId: string,
    actorId: string,
    status: ExternalReviewTriggerStatus,
  ): Promise<void> {
    const previous = await this.prisma.externalReviewTrigger.findFirst({
      where: { id: triggerId, companyId },
      select: { status: true },
    });
    if (!previous) {
      return;
    }

    await this.prisma.externalReviewTrigger.updateMany({
      where: { id: triggerId, companyId },
      data: { status },
    });
    await this.prisma.workflowEventLog.create({
      data: {
        companyId,
        actorId,
        entityType: WorkflowEntityType.Submittal,
        entityId: triggerId,
        action: 'EXTERNAL_TRIGGER_STATUS_UPDATED',
        phase: WorkflowEventPhase.COMMITTED,
        beforeState: { status: previous.status },
        afterState: { status },
      },
    });
  }

  /**
   * Updates trigger mode while still PENDING.
   */
  async updateTriggerMode(
    companyId: string,
    triggerId: string,
    triggerMode: ExternalReviewTriggerMode,
  ): Promise<void> {
    await this.prisma.externalReviewTrigger.updateMany({
      where: {
        id: triggerId,
        companyId,
        status: ExternalReviewTriggerStatus.PENDING,
      },
      data: { triggerMode },
    });
  }

  /**
   * Resolves engineering document IDs from a linked design package.
   */
  async findEngineeringDocumentIdsForPackage(
    companyId: string,
    designPackageId: string,
  ): Promise<string[]> {
    const items = await this.prisma.designPackageItem.findMany({
      where: { companyId, designPackageId },
      select: {
        engineeringDocumentVersion: {
          select: { engineeringDocumentId: true },
        },
      },
    });

    return [
      ...new Set(
        items.map((item) => item.engineeringDocumentVersion.engineeringDocumentId),
      ),
    ];
  }

  /**
   * Returns true when the engineering document already has an active DRAFT EDV.
   */
  async documentHasDraftEdv(
    companyId: string,
    engineeringDocumentId: string,
  ): Promise<boolean> {
    const count = await this.prisma.engineeringDocumentVersion.count({
      where: activeOnly({
        companyId,
        engineeringDocumentId,
        status: EdvStatus.DRAFT,
      }),
    });
    return count > 0;
  }

  /**
   * Loads task discipline id for a design package.
   */
  async findPackageTaskDisciplineId(
    companyId: string,
    designPackageId: string,
  ): Promise<string | null> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      select: { taskDisciplineId: true },
    });
    return pkg?.taskDisciplineId ?? null;
  }

  /**
   * Loads discipline lead user id for a design package.
   */
  async findPackageDisciplineLeadUserId(
    companyId: string,
    designPackageId: string,
  ): Promise<string | null> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      select: {
        taskDiscipline: { select: { disciplineLeadUserId: true } },
      },
    });
    return pkg?.taskDiscipline.disciplineLeadUserId ?? null;
  }
}
