import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubmittalPreparedByRole, SubmittalPurpose } from '@prisma/client';
import { DesignPackageProjectedStatus } from '../../domain/contracts/enums/design-package-projected-status.enum';
import { EdvStatus } from '../../domain/contracts/enums/edv-status.enum';
import { EpcWorkflowAction } from '../../domain/contracts/enums/epc-workflow-action.enum';
import {
  CreateDesignSubmittalCommand,
  IssueSubmittalCommand,
  AddSubmittalItemsCommand,
  WorkflowResultSnapshot,
} from '../../domain/contracts/workflow-kernel.contract';
import {
  validateSubmittalPackages,
} from '../../domain/submittal-package-validator';
import { validateSubmittalPurposeRole } from '../../domain/submittal-purpose-validator';
import { EpcSubmittalRepository } from '../../infrastructure/repositories/epc-submittal.repository';
import {
  EpcWorkflowRepository,
  PrismaTx,
} from '../../infrastructure/repositories/epc-workflow.repository';
import { WorkflowTransactionRunner } from './workflow-transaction-runner.service';
import { PermissionResolverService } from './permission-resolver.service';
import { SubmittalSnapshotService } from './submittal-snapshot.service';

/**
 * Design-package submittal workflow - snapshot at issue, no EDV mutation.
 */
@Injectable()
export class SubmittalWorkflowService {
  constructor(
    private readonly epcWorkflowRepository: EpcWorkflowRepository,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
    private readonly submittalSnapshot: SubmittalSnapshotService,
    private readonly permissionResolver: PermissionResolverService,
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
   * Creates DRAFT submittal with design package items (no snapshot until issue).
   */
  async createDesignSubmittal(
    command: CreateDesignSubmittalCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId: command.projectId,
        action: EpcWorkflowAction.SUBMITTAL_CREATE,
        taskDisciplineId: await this.resolveAnyDisciplineId(
          tx,
          command.companyId,
          command.designPackageIds[0]!,
        ),
        // First package loads subtask-level FK overrides for Layer 3.
        designPackageId: command.designPackageIds[0],
      });

      await this.epcSubmittalRepository.assertPackagesBelongToProject(
        tx,
        command.companyId,
        command.projectId,
        command.designPackageIds,
      );

      const validationInputs = await this.loadPackageValidationInputs(
        tx,
        command.companyId,
        command.designPackageIds,
      );
      const validation = validateSubmittalPackages(validationInputs);
      if (!validation.eligible) {
        throw new ConflictException(validation.message ?? 'Package not submittal-eligible');
      }

      const packageDisciplineIds = await this.loadPackageDisciplineIds(
        tx,
        command.companyId,
        command.designPackageIds,
      );
      const purposeValidation = validateSubmittalPurposeRole({
        submittalPurpose: command.submittalPurpose as SubmittalPurpose | undefined,
        preparedByRole: command.preparedByRole as SubmittalPreparedByRole | undefined,
        taskDisciplineId: command.taskDisciplineId,
        packageDisciplineIds,
      });
      if (!purposeValidation.valid) {
        throw new BadRequestException(purposeValidation.message);
      }

      const submittal = await this.epcSubmittalRepository.createSubmittal(tx, {
        projectId: command.projectId,
        submittedBy: command.actorId,
        submittalNumber: command.submittalNumber,
        category: command.category,
        title: command.title,
        contractor: command.contractor,
        supplier: command.supplier,
        specReference: command.specReference,
        submittalPurpose: command.submittalPurpose as SubmittalPurpose | undefined,
        preparedByRole: command.preparedByRole as SubmittalPreparedByRole | undefined,
        taskDisciplineId: command.taskDisciplineId,
        createdBy: command.actorId,
      });

      const items = [];
      for (let i = 0; i < command.designPackageIds.length; i++) {
        const item = await this.epcSubmittalRepository.createSubmittalItem(tx, {
          companyId: command.companyId,
          submittalId: submittal.id,
          designPackageId: command.designPackageIds[i]!,
          sortOrder: i,
          createdBy: command.actorId,
        });
        items.push(item);
      }

      await this.epcSubmittalRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityId: submittal.id,
        action: 'CREATE_DESIGN_SUBMITTAL',
        beforeState: {},
        afterState: {
          submittalId: submittal.id,
          designPackageIds: command.designPackageIds,
          itemCount: items.length,
        },
        correlationId,
      });

      return {
        commandType: 'CreateDesignSubmittal',
        correlationId,
        affectedEdvIds: [],
        edvStatuses: {},
        submittalId: submittal.id,
        intentEventIds: [],
      };
    });
  }

  /**
   * Issues submittal - freezes immutable snapshots per package item.
   */
  async issueSubmittal(
    command: IssueSubmittalCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const projectId = await this.resolveProjectIdForSubmittal(
        tx,
        command.companyId,
        command.submittalId,
      );

      const submittal = await this.epcSubmittalRepository.findSubmittalWithItems(
        tx,
        projectId,
        command.submittalId,
      );
      if (!submittal) {
        throw new NotFoundException('Submittal not found');
      }
      if (submittal.items.length === 0) {
        throw new BadRequestException('Submittal has no design package items');
      }
      if (submittal.issuedAt) {
        throw new ConflictException('Submittal already issued');
      }

      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId,
        action: EpcWorkflowAction.SUBMITTAL_ISSUE,
        taskDisciplineId: await this.resolveAnyDisciplineId(
          tx,
          command.companyId,
          submittal.items[0]!.designPackageId,
        ),
        // First package loads subtask-level FK overrides for Layer 3.
        designPackageId: submittal.items[0]!.designPackageId,
      });

      const validationInputs = await this.loadPackageValidationInputs(
        tx,
        command.companyId,
        submittal.items.map((i) => i.designPackageId),
      );
      const validation = validateSubmittalPackages(validationInputs);
      if (!validation.eligible) {
        throw new ConflictException(
          validation.message ?? 'Package no longer submittal-eligible at issue time',
        );
      }

      const affectedEdvIds: string[] = [];

      for (const item of submittal.items) {
        if (item.snapshotCaptured) {
          continue;
        }
        const snapshot = await this.submittalSnapshot.buildPackageSnapshot(
          tx,
          command.companyId,
          item.designPackageId,
        );
        await this.epcSubmittalRepository.captureItemSnapshot(tx, item.id, {
          snapshotEdvIds: snapshot.snapshotEdvIds,
          snapshotPayload: snapshot.snapshotPayload as unknown as Prisma.InputJsonValue,
          contentHash: snapshot.contentHash,
          capturedBy: command.actorId,
        });
        affectedEdvIds.push(...snapshot.snapshotEdvIds);
      }

      await this.epcSubmittalRepository.issueSubmittal(
        tx,
        command.submittalId,
        command.actorId,
      );

      await this.epcSubmittalRepository.appendWorkflowIntentEvent(tx, {
        companyId: command.companyId,
        actorId: command.actorId,
        entityId: command.submittalId,
        action: 'ISSUE_SUBMITTAL',
        beforeState: { status: submittal.status },
        afterState: {
          status: 'SUBMITTED',
          snapshotEdvIds: affectedEdvIds,
        },
        correlationId,
      });

      return {
        commandType: 'IssueSubmittal',
        correlationId,
        affectedEdvIds,
        edvStatuses: {},
        submittalId: command.submittalId,
        intentEventIds: [],
      };
    });
  }

  /**
   * Adds design package items to an existing DRAFT submittal.
   */
  async addSubmittalItems(
    command: AddSubmittalItemsCommand,
    correlationId: string,
  ): Promise<WorkflowResultSnapshot> {
    return this.runTx(command.companyId, correlationId, async (tx) => {
      const submittal = await this.epcSubmittalRepository.findSubmittalWithItems(
        tx,
        command.projectId,
        command.submittalId,
      );
      if (!submittal) {
        throw new NotFoundException('Submittal not found');
      }
      if (submittal.issuedAt) {
        throw new ConflictException('Cannot add items to issued submittal');
      }

      await this.permissionResolver.assertActionAllowed({
        companyId: command.companyId,
        userId: command.actorId,
        projectId: command.projectId,
        action: EpcWorkflowAction.SUBMITTAL_CREATE,
        taskDisciplineId: await this.resolveAnyDisciplineId(
          tx,
          command.companyId,
          command.designPackageIds[0]!,
        ),
        // First package loads subtask-level FK overrides for Layer 3.
        designPackageId: command.designPackageIds[0],
      });

      await this.epcSubmittalRepository.assertPackagesBelongToProject(
        tx,
        command.companyId,
        command.projectId,
        command.designPackageIds,
      );

      const validationInputs = await this.loadPackageValidationInputs(
        tx,
        command.companyId,
        command.designPackageIds,
      );
      const validation = validateSubmittalPackages(validationInputs);
      if (!validation.eligible) {
        throw new ConflictException(validation.message ?? 'Package not submittal-eligible');
      }

      const existingIds = new Set(submittal.items.map((i) => i.designPackageId));
      let sortOrder = submittal.items.length;
      for (const designPackageId of command.designPackageIds) {
        if (existingIds.has(designPackageId)) {
          continue;
        }
        await this.epcSubmittalRepository.createSubmittalItem(tx, {
          companyId: command.companyId,
          submittalId: command.submittalId,
          designPackageId,
          sortOrder: sortOrder++,
          createdBy: command.actorId,
        });
      }

      return {
        commandType: 'AddSubmittalItems',
        correlationId,
        affectedEdvIds: [],
        edvStatuses: {},
        submittalId: command.submittalId,
        intentEventIds: [],
      };
    });
  }

  private async loadPackageValidationInputs(
    tx: PrismaTx,
    companyId: string,
    designPackageIds: readonly string[],
  ) {
    const inputs = [];
    for (const designPackageId of designPackageIds) {
      const loaded = await this.epcSubmittalRepository.findPackageEdvStatuses(
        tx,
        companyId,
        designPackageId,
      );
      if (!loaded) {
        throw new NotFoundException(`Design package ${designPackageId} not found`);
      }
      inputs.push({
        designPackageId,
        projectedStatus: loaded.projectedStatus as DesignPackageProjectedStatus,
        edvStatuses: loaded.edvStatuses.map((s) => s as EdvStatus),
      });
    }
    return inputs;
  }

  private async loadPackageDisciplineIds(
    tx: PrismaTx,
    companyId: string,
    designPackageIds: readonly string[],
  ): Promise<string[]> {
    const rows = await tx.designPackage.findMany({
      where: {
        id: { in: [...designPackageIds] },
        companyId,
        deletedAt: null,
      },
      select: { taskDisciplineId: true },
    });
    return rows.map((row) => row.taskDisciplineId);
  }

  private async resolveAnyDisciplineId(
    tx: PrismaTx,
    companyId: string,
    designPackageId: string,
  ): Promise<string> {
    const pkg = await tx.designPackage.findFirst({
      where: { id: designPackageId, companyId, deletedAt: null },
      select: { taskDisciplineId: true },
    });
    if (!pkg) {
      throw new NotFoundException('Design package not found');
    }
    return pkg.taskDisciplineId;
  }

  private async resolveProjectIdForSubmittal(
    tx: PrismaTx,
    companyId: string,
    submittalId: string,
  ): Promise<string> {
    const row = await tx.submittal.findFirst({
      where: { id: submittalId, deletedAt: null },
      select: { projectId: true, project: { select: { companyId: true } } },
    });
    if (!row || row.project.companyId !== companyId) {
      throw new NotFoundException('Submittal not found');
    }
    return row.projectId;
  }
}
