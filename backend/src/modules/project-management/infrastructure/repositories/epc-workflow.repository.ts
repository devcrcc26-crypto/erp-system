import { Injectable } from '@nestjs/common';
import {
  DesignPackage,
  DesignPackageItem,
  EngineeringDocument,
  EngineeringDocumentVersion,
  Prisma,
  ReviewSessionStatus,
  TaskDiscipline,
  WorkflowEventLog,
  WorkflowEventPhase,
  WorkflowEntityType,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

export type PrismaTx = Prisma.TransactionClient;

export interface EdvWithDiscipline extends EngineeringDocumentVersion {
  engineeringDocument: EngineeringDocument & {
    taskDiscipline: TaskDiscipline;
  };
}

@Injectable()
export class EpcWorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Runs Phase A + Phase B inside a single Prisma transaction.
   */
  async runPhaseAB<T>(work: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(work, { timeout: 15000 });
  }

  /** @deprecated Use runPhaseAB - alias for backward compatibility */
  async runPhaseA<T>(work: (tx: PrismaTx) => Promise<T>): Promise<T> {
    return this.runPhaseAB(work);
  }

  async findEdvWithDiscipline(
    tx: PrismaTx,
    companyId: string,
    engineeringDocumentVersionId: string,
  ): Promise<EdvWithDiscipline | null> {
    return tx.engineeringDocumentVersion.findFirst({
      where: activeOnly({ id: engineeringDocumentVersionId, companyId }),
      include: {
        engineeringDocument: {
          include: { taskDiscipline: true },
        },
      },
    });
  }

  async findEdvsWithDiscipline(
    tx: PrismaTx,
    companyId: string,
    engineeringDocumentVersionIds: readonly string[],
  ): Promise<EdvWithDiscipline[]> {
    return tx.engineeringDocumentVersion.findMany({
      where: activeOnly({
        companyId,
        id: { in: [...engineeringDocumentVersionIds] },
      }),
      include: {
        engineeringDocument: {
          include: { taskDiscipline: true },
        },
      },
    });
  }

  async updateEdvStatus(
    tx: PrismaTx,
    edvId: string,
    status: EngineeringDocumentVersion['status'],
    updatedBy: string,
  ): Promise<EngineeringDocumentVersion> {
    return tx.engineeringDocumentVersion.update({
      where: { id: edvId },
      data: { status, updatedBy },
    });
  }

  async appendIntentEvent(
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
  ): Promise<WorkflowEventLog> {
    return tx.workflowEventLog.create({
      data: {
        company: { connect: { id: input.companyId } },
        actor: { connect: { id: input.actorId } },
        entityType: WorkflowEntityType.EngineeringDocumentVersion,
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

  async findIntentByCorrelation(
    companyId: string,
    correlationId: string,
  ): Promise<WorkflowEventLog | null> {
    return this.prisma.workflowEventLog.findFirst({
      where: {
        companyId,
        correlationId,
        phase: WorkflowEventPhase.INTENT,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findIntentEventsByCorrelation(
    companyId: string,
    correlationId: string,
  ): Promise<WorkflowEventLog[]> {
    return this.prisma.workflowEventLog.findMany({
      where: {
        companyId,
        correlationId,
        phase: WorkflowEventPhase.INTENT,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Marks packages dirty for Phase B projection recompute.
   */
  async markPackagesProjectionPending(
    tx: PrismaTx,
    companyId: string,
    engineeringDocumentVersionIds: readonly string[],
  ): Promise<void> {
    const items = await tx.designPackageItem.findMany({
      where: {
        companyId,
        engineeringDocumentVersionId: { in: [...engineeringDocumentVersionIds] },
      },
      select: { designPackageId: true },
    });

    const packageIds = [...new Set(items.map((i) => i.designPackageId))];
    if (packageIds.length === 0) {
      return;
    }

    await tx.designPackage.updateMany({
      where: { companyId, id: { in: packageIds } },
      data: { projectionPending: true },
    });
  }

  async markPackageProjectionPendingById(
    tx: PrismaTx,
    designPackageId: string,
  ): Promise<void> {
    await tx.designPackage.update({
      where: { id: designPackageId },
      data: { projectionPending: true },
    });
  }

  async findDirtyPackages(
    tx: PrismaTx,
    companyId: string,
    packageIds?: readonly string[],
  ): Promise<DesignPackage[]> {
    return tx.designPackage.findMany({
      where: activeOnly({
        companyId,
        projectionPending: true,
        ...(packageIds ? { id: { in: [...packageIds] } } : {}),
      }),
      orderBy: { createdAt: 'asc' },
    });
  }

  async findAllPackages(
    tx: PrismaTx,
    companyId: string,
  ): Promise<DesignPackage[]> {
    return tx.designPackage.findMany({
      where: activeOnly({ companyId }),
      orderBy: { createdAt: 'asc' },
    });
  }

  async hasActiveReviewSessionForPackage(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<boolean> {
    const session = await tx.reviewSession.findFirst({
      where: activeOnly({
        companyId,
        designPackageId,
        status: ReviewSessionStatus.ACTIVE,
      }),
      select: { id: true },
    });
    return session !== null;
  }

  async findPackageEdvStatuses(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<EngineeringDocumentVersion['status'][]> {
    const items = await tx.designPackageItem.findMany({
      where: { companyId, designPackageId },
      select: { engineeringDocumentVersionId: true },
    });

    if (items.length === 0) {
      return [];
    }

    const versions = await tx.engineeringDocumentVersion.findMany({
      where: activeOnly({
        companyId,
        id: { in: items.map((i) => i.engineeringDocumentVersionId) },
      }),
      select: { status: true },
    });

    return versions.map((v) => v.status);
  }

  async updatePackageProjection(
    tx: PrismaTx,
    designPackageId: string,
    projectedStatus: DesignPackage['projectedStatus'],
    updatedBy: string,
    clearDirtyFlag = true,
  ): Promise<DesignPackage> {
    return tx.designPackage.update({
      where: { id: designPackageId },
      data: {
        projectedStatus,
        projectionPending: clearDirtyFlag ? false : undefined,
        updatedBy,
      },
    });
  }

  async findPackagesByDiscipline(
    tx: PrismaTx,
    companyId: string,
    taskDisciplineId: string,
  ): Promise<Pick<DesignPackage, 'id' | 'projectedStatus'>[]> {
    return tx.designPackage.findMany({
      where: activeOnly({ companyId, taskDisciplineId }),
      select: { id: true, projectedStatus: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findDisciplineProjectedStatus(
    tx: PrismaTx,
    companyId: string,
    taskDisciplineId: string,
  ): Promise<TaskDiscipline['projectedStatus'] | null> {
    const row = await tx.taskDiscipline.findFirst({
      where: activeOnly({ id: taskDisciplineId, companyId }),
      select: { projectedStatus: true },
    });
    return row?.projectedStatus ?? null;
  }

  async updateDisciplineProjection(
    tx: PrismaTx,
    taskDisciplineId: string,
    projectedStatus: TaskDiscipline['projectedStatus'],
    updatedBy: string,
  ): Promise<TaskDiscipline> {
    return tx.taskDiscipline.update({
      where: { id: taskDisciplineId },
      data: { projectedStatus, updatedBy },
    });
  }

  async findPackageContextByEdvId(
    tx: PrismaTx,
    companyId: string,
    engineeringDocumentVersionId: string,
  ): Promise<{ designPackageId: string; taskDisciplineId: string } | null> {
    const item = await tx.designPackageItem.findFirst({
      where: { companyId, engineeringDocumentVersionId },
      select: {
        designPackageId: true,
        designPackage: { select: { taskDisciplineId: true } },
      },
    });
    if (!item) {
      return null;
    }
    return {
      designPackageId: item.designPackageId,
      taskDisciplineId: item.designPackage.taskDisciplineId,
    };
  }

  async findPackageWithItems(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<(DesignPackage & { items: DesignPackageItem[] }) | null> {
    return tx.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
  }

  async findProjectTeamRole(
    companyId: string,
    projectId: string,
    userId: string,
  ): Promise<string | undefined> {
    const membership = await this.prisma.projectTeam.findFirst({
      where: activeOnly({ projectId, userId }),
      select: { id: true },
    });
    return membership ? 'OTHER' : undefined;
  }

  async findTaskDisciplineContext(
    companyId: string,
    taskDisciplineId: string,
  ): Promise<TaskDiscipline | null> {
    return this.prisma.taskDiscipline.findFirst({
      where: activeOnly({ id: taskDisciplineId, companyId }),
    });
  }
}
