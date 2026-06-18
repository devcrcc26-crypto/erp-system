import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DesignPackageProjectedStatus, WorkflowEntityType } from '@prisma/client';
import {
  AddDesignPackageItemDto,
  BatchApproveEdvsDto,
  BatchReturnEdvsDto,
  BatchLockPackagesDto,
  CreateDesignPackageDependencyDto,
  CreateDesignPackageDto,
  LockPackageEdvsDto,
  SubmitPackageForReviewDto,
  ApproveReviewSessionDto,
  ReturnPackageForReworkDto,
  UpdateDesignPackageDto,
} from '../dtos/engineering-document.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapDesignPackage,
  mapDesignPackageDependency,
  mapDesignPackageItem,
  MappedDesignPackage,
  MappedDesignPackageDependency,
  MappedDesignPackageItem,
} from '../../infrastructure/mappers/engineering-document.mapper';
import {
  DesignPackageRepository,
  EngineeringDocumentVersionRepository,
  TaskDisciplineScopeRepository,
} from '../../infrastructure/repositories/epc-storage.repository';
import { WorkflowEventLogService } from './workflow-event-log.service';
import { WorkflowKernelService } from './workflow-kernel.service';
import { DependencyGraphService } from './dependency-graph.service';
import { WorkflowResultSnapshot } from '../../domain/contracts/workflow-kernel.contract';

@Injectable()
export class DesignPackagesService {
  constructor(
    private readonly designPackageRepository: DesignPackageRepository,
    private readonly engineeringDocumentVersionRepository: EngineeringDocumentVersionRepository,
    private readonly taskDisciplineScopeRepository: TaskDisciplineScopeRepository,
    private readonly workflowEventLogService: WorkflowEventLogService,
    private readonly workflowKernel: WorkflowKernelService,
    private readonly dependencyGraphService: DependencyGraphService,
  ) {}

  /**
   * Lists design packages for a task discipline.
   */
  async list(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<MappedDesignPackage[]> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const rows = await this.designPackageRepository.findMany(
      ctx.companyId,
      taskDisciplineId,
    );
    return rows.map(mapDesignPackage);
  }

  /**
   * Gets a design package by ID.
   */
  async getById(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
  ): Promise<MappedDesignPackage> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const row = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!row || row.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }
    return mapDesignPackage(row);
  }

  /**
   * Creates a design package — projectedStatus stored only (defaults IN_PROGRESS).
   */
  async create(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    dto: CreateDesignPackageDto,
  ): Promise<MappedDesignPackage> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);

    const row = await this.designPackageRepository.create({
      company: { connect: { id: ctx.companyId } },
      taskDiscipline: { connect: { id: taskDisciplineId } },
      name: dto.name,
      projectedStatus:
        dto.projectedStatus ?? DesignPackageProjectedStatus.IN_PROGRESS,
      createdBy: ctx.userId,
      updatedBy: ctx.userId,
    });

    await this.workflowEventLogService.logCrud(
      ctx,
      WorkflowEntityType.DesignPackage,
      row.id,
      'CREATED',
      {},
      { name: row.name, projectedStatus: row.projectedStatus },
    );

    const withItems = await this.designPackageRepository.findById(
      ctx.companyId,
      row.id,
    );
    return mapDesignPackage(withItems!);
  }

  /**
   * Updates design package fields — no projection recompute (Wave 1).
   */
  async update(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: UpdateDesignPackageDto,
  ): Promise<MappedDesignPackage> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const existing = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!existing || existing.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    await this.designPackageRepository.update(packageId, {
      name: dto.name,
      projectedStatus: dto.projectedStatus,
      updatedBy: ctx.userId,
    });

    const refreshed = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    return mapDesignPackage(refreshed!);
  }

  /**
   * Soft-deletes a design package.
   */
  async delete(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
  ): Promise<void> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const existing = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!existing || existing.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }
    await this.designPackageRepository.softDelete(packageId, ctx.userId);
  }

  /**
   * Links an EDV into a design package.
   */
  async addItem(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: AddDesignPackageItemDto,
  ): Promise<MappedDesignPackageItem> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);

    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    const edv = await this.engineeringDocumentVersionRepository.findById(
      ctx.companyId,
      dto.engineeringDocumentVersionId,
    );
    if (!edv) {
      throw new NotFoundException('Engineering document version not found');
    }

    const item = await this.designPackageRepository.addItem({
      company: { connect: { id: ctx.companyId } },
      designPackage: { connect: { id: packageId } },
      engineeringDocumentVersion: {
        connect: { id: dto.engineeringDocumentVersionId },
      },
      sortOrder: dto.sortOrder ?? 0,
      createdBy: ctx.userId,
    });

    return mapDesignPackageItem(item);
  }

  /**
   * Removes an item from a design package.
   */
  async removeItem(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    itemId: string,
  ): Promise<void> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }
    await this.designPackageRepository.removeItem(ctx.companyId, itemId);
  }

  /**
   * Creates a package dependency row (dumb persistence).
   */
  async addDependency(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: CreateDesignPackageDependencyDto,
  ): Promise<MappedDesignPackageDependency> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);

    if (packageId === dto.dependsOnPackageId) {
      throw new BadRequestException('Package cannot depend on itself');
    }

    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    const dependsOn = await this.designPackageRepository.findById(
      ctx.companyId,
      dto.dependsOnPackageId,
    );
    if (!dependsOn) {
      throw new NotFoundException('Depends-on package not found');
    }

    await this.dependencyGraphService.assertNoCycleOnAdd(
      ctx.companyId,
      projectId,
      packageId,
      dto.dependsOnPackageId,
    );

    const row = await this.designPackageRepository.createDependency({
      company: { connect: { id: ctx.companyId } },
      designPackage: { connect: { id: packageId } },
      dependsOnPackage: { connect: { id: dto.dependsOnPackageId } },
      dependencyType: dto.dependencyType,
      createdBy: ctx.userId,
    });

    return mapDesignPackageDependency(row);
  }

  /**
   * Lists dependencies for a design package.
   */
  async listDependencies(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
  ): Promise<MappedDesignPackageDependency[]> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }
    const rows = await this.designPackageRepository.listDependencies(
      ctx.companyId,
      packageId,
    );
    return rows.map(mapDesignPackageDependency);
  }

  /**
   * Deletes a package dependency.
   */
  async removeDependency(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dependencyId: string,
  ): Promise<void> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }
    await this.designPackageRepository.deleteDependency(
      ctx.companyId,
      dependencyId,
    );
  }

  /**
   * Locks all EDVs in a package via WorkflowKernel Phase A.
   */
  async lockPackageEdvs(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: LockPackageEdvsDto,
  ): Promise<WorkflowResultSnapshot> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    return this.workflowKernel.execute({
      type: 'LockPackageEdvs',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      designPackageId: packageId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Batch-approves EDVs in a package via WorkflowKernel Phase A.
   */
  async batchApproveEdvs(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: BatchApproveEdvsDto,
  ): Promise<WorkflowResultSnapshot> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    return this.workflowKernel.execute({
      type: 'BatchApproveEdvs',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      designPackageId: packageId,
      engineeringDocumentVersionIds: dto.engineeringDocumentVersionIds,
      reviewSessionId: dto.reviewSessionId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Submits design package for review — opens session and freezes snapshot.
   */
  async submitForReview(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: SubmitPackageForReviewDto,
  ): Promise<WorkflowResultSnapshot> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    return this.workflowKernel.execute({
      type: 'SubmitPackageForReview',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      designPackageId: packageId,
      taskDisciplineId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Approves review session at current governance tier.
   */
  async approveReviewSession(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    reviewSessionId: string,
    dto: ApproveReviewSessionDto,
  ): Promise<WorkflowResultSnapshot> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    return this.workflowKernel.execute({
      type: 'ApproveReviewSession',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      reviewSessionId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Returns package for rework — closes session and reverts EDVs to DRAFT.
   */
  async returnForRework(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: ReturnPackageForReworkDto,
  ): Promise<WorkflowResultSnapshot> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    return this.workflowKernel.execute({
      type: 'ReturnPackageForRework',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      designPackageId: packageId,
      reviewSessionId: dto.reviewSessionId,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Batch-returns selected EDVs via WorkflowKernel.
   */
  async batchReturnEdvs(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: BatchReturnEdvsDto,
  ): Promise<WorkflowResultSnapshot> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    return this.workflowKernel.execute({
      type: 'BatchReturnEdvs',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      designPackageId: packageId,
      engineeringDocumentVersionIds: dto.engineeringDocumentVersionIds,
      reviewSessionId: dto.reviewSessionId,
      commentTemplate: dto.commentTemplate,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Locks all EDVs in multiple packages — one kernel tx per package.
   */
  async batchLockPackages(
    ctx: PmContext,
    projectId: string,
    dto: BatchLockPackagesDto,
  ): Promise<WorkflowResultSnapshot[]> {
    const results: WorkflowResultSnapshot[] = [];
    for (const packageId of dto.designPackageIds) {
      const pkg = await this.designPackageRepository.findById(
        ctx.companyId,
        packageId,
      );
      if (!pkg) {
        throw new NotFoundException(`Design package ${packageId} not found`);
      }
      await this.assertDisciplineScope(ctx, projectId, pkg.taskDisciplineId);

      const result = await this.workflowKernel.execute({
        type: 'LockPackageEdvs',
        companyId: ctx.companyId,
        actorId: ctx.userId,
        designPackageId: packageId,
        idempotencyKey: dto.idempotencyKey
          ? `${dto.idempotencyKey}:${packageId}`
          : undefined,
      });
      results.push(result);
    }
    return results;
  }

  private async assertDisciplineScope(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<void> {
    const discipline = await this.taskDisciplineScopeRepository.findScoped(
      ctx.companyId,
      taskDisciplineId,
      projectId,
    );
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }
  }
}
