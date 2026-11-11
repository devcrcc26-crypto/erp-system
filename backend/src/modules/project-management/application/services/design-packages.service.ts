import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  EdvStatus,
  ReviewSession,
  ReviewSessionStatus,
  ReviewTier,
  SiteRepType,
  WorkflowEntityType,
} from '@prisma/client';
import { PermissionService } from '../../../../shared/permissions/permission.service';
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
import { ReviewSessionListQueryDto, AddReviewSessionAttachmentDto } from '../dtos/pm.dtos';
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
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { WorkflowEventLogService } from './workflow-event-log.service';
import { WorkflowKernelService } from './workflow-kernel.service';
import { DocumentNumberService } from './document-number.service';
import { DependencyGraphService } from './dependency-graph.service';
import { WorkflowResultSnapshot } from '../../domain/contracts/workflow-kernel.contract';
import { computeRequiredTiers } from '../../domain/required-tiers.util';
import {
  EffectiveApprovalChain,
  getEffectiveApprovalChain,
} from '../../domain/approval-chain.util';
import { ReviewWorkflowService } from './review-workflow.service';
import { TaskAccessScopeService } from './task-access-scope.service';
import { TaskAssignmentNotificationService } from './task-assignment-notification.service';
import {
  collectSubtaskRoleAssignments,
  diffNewSubtaskRoleAssignments,
} from '../utils/subtask-role-notification.util';
import { formatLocalizedName } from '../../../../shared/utils/bilingual-name.util';
import { MappedReviewSessionAttachment } from '../utils/review-session-attachment.mapper';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';

export interface MappedReviewSessionListItem {
  id: string;
  designPackageId: string;
  designPackageName: string;
  taskDisciplineId: string;
  status: string;
  currentTier: string;
  assigneeName: string | null;
  slaDeadlineAt: string | null;
  slaOverdue: boolean;
  openedAt: string;
}

@Injectable()
export class DesignPackagesService {
  private readonly logger = new Logger(DesignPackagesService.name);

  constructor(
    private readonly designPackageRepository: DesignPackageRepository,
    private readonly engineeringDocumentVersionRepository: EngineeringDocumentVersionRepository,
    private readonly taskDisciplineScopeRepository: TaskDisciplineScopeRepository,
    private readonly workflowEventLogService: WorkflowEventLogService,
    private readonly workflowKernel: WorkflowKernelService,
    private readonly dependencyGraphService: DependencyGraphService,
    private readonly epcReviewRepository: EpcReviewRepository,
    private readonly reviewWorkflowService: ReviewWorkflowService,
    private readonly prisma: PrismaService,
    private readonly taskAccessScopeService: TaskAccessScopeService,
    private readonly taskAssignmentNotificationService: TaskAssignmentNotificationService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly permissionService: PermissionService,
  ) {}

  /**
   * Lists design packages for a task discipline.
   */
  async list(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<MappedDesignPackage[]> {
    const packageScope = await this.taskAccessScopeService.buildPackageListWhere(
      ctx,
      projectId,
      taskDisciplineId,
    );
    const rows = await this.designPackageRepository.findMany(
      ctx.companyId,
      taskDisciplineId,
      packageScope,
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
    await this.taskAccessScopeService.assertPackageReadable(
      ctx,
      projectId,
      taskDisciplineId,
      packageId,
    );
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
   * Creates a design package - only the discipline leader may create packages.
   */
  async create(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    dto: CreateDesignPackageDto,
  ): Promise<MappedDesignPackage> {
    await this.taskAccessScopeService.assertDisciplineWritable(
      ctx,
      projectId,
      taskDisciplineId,
    );

    const discipline = await this.taskDisciplineScopeRepository.findWithReviewRoles(
      ctx.companyId,
      taskDisciplineId,
      projectId,
    );
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }

    if (!discipline.disciplineLeadUserId) {
      throw new BadRequestException(
        'Assign a discipline leader before creating a design package.',
      );
    }
    if (dto.instituteChiefUserId && dto.instituteChiefName) {
      throw new BadRequestException(
        'Set either instituteChiefUserId or instituteChiefName, not both.',
      );
    }
    const instituteChiefName = dto.instituteChiefName ?? null;
    const siteRepType = dto.siteRepType ?? SiteRepType.EXTERNAL;
    const externalParties = this.resolveExternalPartiesOnWrite(dto, siteRepType);

    const packageOverrides = {
      designerUserId: dto.designerUserId ?? discipline.designerUserId ?? null,
      supportingDesignerUserId:
        dto.supportingDesignerUserId ?? discipline.supportingDesignerUserId ?? null,
      disciplineOwnerUserId:
        dto.disciplineOwnerUserId ?? discipline.ownerUserId ?? null,
      reviewerUserId: dto.reviewerUserId ?? discipline.reviewerUserId ?? null,
      disciplinaryLeaderUserId:
        dto.disciplinaryLeaderUserId ?? discipline.disciplineLeadUserId ?? null,
      deptDeputyChiefUserId:
        dto.deptDeputyChiefUserId ?? discipline.chiefUserId ?? null,
      // An external Institute Chief name means no FK, even if the discipline
      // has a default instituteChiefUserId to fall back to.
      instituteChiefUserId: instituteChiefName
        ? null
        : dto.instituteChiefUserId ?? discipline.instituteChiefUserId ?? null,
      instituteChiefName,
      siteRepresentativeUserId: externalParties.siteRepresentativeUserId,
    };
    const effectiveChain = this.getEffectiveApprovalChain(packageOverrides, discipline);

    const requiredTiers =
      dto.requiredTiers && dto.requiredTiers.length > 0
        ? dto.requiredTiers
        : computeRequiredTiers(effectiveChain, instituteChiefName);

    if (!requiredTiers.includes(ReviewTier.DISCIPLINE_LEAD)) {
      throw new BadRequestException(
        'Required tiers must include DISCIPLINE_LEAD.',
      );
    }

    const hasDeptOrInstituteChief =
      requiredTiers.includes(ReviewTier.DEPT_CHIEF) ||
      requiredTiers.includes(ReviewTier.INSTITUTE_CHIEF);
    if (!hasDeptOrInstituteChief) {
      this.logger.warn(
        `Design package "${dto.name}" has no DEPT_CHIEF or INSTITUTE_CHIEF in requiredTiers`,
      );
    }

    if (dto.sourceEntityType && dto.sourceEntityId) {
      const sourceExists =
        await this.taskDisciplineScopeRepository.findSourceEntityInProject(
          ctx.companyId,
          projectId,
          dto.sourceEntityType,
          dto.sourceEntityId,
        );
      if (!sourceExists) {
        throw new NotFoundException('Source entity not found in this project');
      }
    }

    const packageCode = await this.documentNumberService.getNextNumber(
      ctx,
      'SUBTASK',
    );

    const maxPackage = await this.prisma.designPackage.aggregate({
      where: activeOnly({
        taskDisciplineId,
        companyId: ctx.companyId,
      }),
      _max: { subtaskIndex: true },
    });
    const subtaskIndex = (maxPackage._max.subtaskIndex ?? 0) + 1;

    const parentDiscipline = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId: ctx.companyId,
      }),
      include: {
        task: {
          select: {
            overseasTaskNumber: true,
          },
        },
      },
    });

    const subtaskId =
      parentDiscipline?.task.overseasTaskNumber &&
      parentDiscipline.disciplineIndex
        ? `${parentDiscipline.task.overseasTaskNumber}-${String(
            parentDiscipline.disciplineIndex,
          ).padStart(2, '0')}-${String(subtaskIndex).padStart(2, '0')}`
        : null;

    const row = await this.designPackageRepository.createWithBriefAttachments({
      packageData: {
        company: { connect: { id: ctx.companyId } },
        taskDiscipline: { connect: { id: taskDisciplineId } },
        packageCode,
        subtaskIndex,
        subtaskId,
        name: dto.name,
        nameZh: dto.nameZh,
        mainWorkContent: dto.mainWorkContent,
        plannedStartDate: dto.plannedStartDate
          ? new Date(dto.plannedStartDate)
          : undefined,
        plannedFinishDate: dto.plannedFinishDate
          ? new Date(dto.plannedFinishDate)
          : undefined,
        actualWorkDays: dto.actualWorkDays,
        urgencyLevel: dto.urgencyLevel,
        reviewLevel: dto.reviewLevel,
        projectedStatus:
          dto.projectedStatus ?? DesignPackageProjectedStatus.IN_PROGRESS,
        requiredTiers,
        briefText: dto.briefText,
        sourceEntityType: dto.sourceEntityType,
        sourceEntityId: dto.sourceEntityId,
        instituteChiefName,
        siteRepType: externalParties.siteRepType,
        siteRepName: externalParties.siteRepName,
        siteRepEmail: externalParties.siteRepEmail,
        siteRepPhone: externalParties.siteRepPhone,
        siteRepCompany: externalParties.siteRepCompany,
        consultantName: externalParties.consultantName,
        consultantTitle: externalParties.consultantTitle,
        consultantEmail: externalParties.consultantEmail,
        consultantPhone: externalParties.consultantPhone,
        consultantCompany: externalParties.consultantCompany,
        ...this.buildPackageApprovalChainCreateRelations(packageOverrides),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      briefAttachments: dto.briefDocumentIds?.map((documentId) => ({
        companyId: ctx.companyId,
        documentId,
        attachedBy: ctx.userId,
      })),
    });

    await this.workflowEventLogService.logCrud(
      ctx,
      WorkflowEntityType.DesignPackage,
      row.id,
      'CREATED',
      {},
      {
        name: row.name,
        projectedStatus: row.projectedStatus,
        requiredTiers: row.requiredTiers,
      },
    );

    const withItems = await this.designPackageRepository.findById(
      ctx.companyId,
      row.id,
    );

    if (withItems) {
      await this.notifySubtaskRoleChanges(
        ctx,
        projectId,
        taskDisciplineId,
        withItems.id,
        withItems.name,
        null,
        withItems,
      );
    }

    return mapDesignPackage(withItems!);
  }

  /**
   * Updates design package fields - no projection recompute (Wave 1).
   */
  async update(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    dto: UpdateDesignPackageDto,
  ): Promise<MappedDesignPackage> {
    await this.taskAccessScopeService.assertPackageReadable(
      ctx,
      projectId,
      taskDisciplineId,
      packageId,
    );
    await this.taskAccessScopeService.assertDisciplineWritable(
      ctx,
      projectId,
      taskDisciplineId,
    );
    const existing = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!existing || existing.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    const discipline = await this.taskDisciplineScopeRepository.findWithReviewRoles(
      ctx.companyId,
      taskDisciplineId,
      projectId,
    );
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }

    if (dto.instituteChiefUserId && dto.instituteChiefName) {
      throw new BadRequestException(
        'Set either instituteChiefUserId or instituteChiefName, not both.',
      );
    }

    const nextSiteRepType =
      dto.siteRepType ?? existing.siteRepType ?? SiteRepType.EXTERNAL;
    const externalParties = this.resolveExternalPartiesOnWrite(
      {
        siteRepresentativeUserId:
          dto.siteRepresentativeUserId !== undefined
            ? dto.siteRepresentativeUserId
            : existing.siteRepresentativeUserId ?? undefined,
        siteRepName:
          dto.siteRepName !== undefined
            ? dto.siteRepName
            : existing.siteRepName ?? undefined,
        siteRepEmail:
          dto.siteRepEmail !== undefined
            ? dto.siteRepEmail
            : existing.siteRepEmail ?? undefined,
        siteRepPhone:
          dto.siteRepPhone !== undefined
            ? dto.siteRepPhone
            : existing.siteRepPhone ?? undefined,
        siteRepCompany:
          dto.siteRepCompany !== undefined
            ? dto.siteRepCompany
            : existing.siteRepCompany ?? undefined,
        consultantName:
          dto.consultantName !== undefined
            ? dto.consultantName
            : existing.consultantName ?? undefined,
        consultantTitle:
          dto.consultantTitle !== undefined
            ? dto.consultantTitle
            : existing.consultantTitle ?? undefined,
        consultantEmail:
          dto.consultantEmail !== undefined
            ? dto.consultantEmail
            : existing.consultantEmail ?? undefined,
        consultantPhone:
          dto.consultantPhone !== undefined
            ? dto.consultantPhone
            : existing.consultantPhone ?? undefined,
        consultantCompany:
          dto.consultantCompany !== undefined
            ? dto.consultantCompany
            : existing.consultantCompany ?? undefined,
      },
      nextSiteRepType,
    );

    const chainFkChanged =
      dto.designerUserId !== undefined ||
      dto.supportingDesignerUserId !== undefined ||
      dto.disciplineOwnerUserId !== undefined ||
      dto.reviewerUserId !== undefined ||
      dto.disciplinaryLeaderUserId !== undefined ||
      dto.deptDeputyChiefUserId !== undefined ||
      dto.instituteChiefUserId !== undefined ||
      dto.instituteChiefName !== undefined ||
      dto.siteRepresentativeUserId !== undefined ||
      dto.siteRepType !== undefined;

    const priorEffectiveChain = this.getEffectiveApprovalChain(
      {
        designerUserId: existing.designerUserId,
        supportingDesignerUserId: existing.supportingDesignerUserId,
        disciplineOwnerUserId: existing.disciplineOwnerUserId,
        reviewerUserId: existing.reviewerUserId,
        disciplinaryLeaderUserId: existing.disciplinaryLeaderUserId,
        deptDeputyChiefUserId: existing.deptDeputyChiefUserId,
        instituteChiefUserId: existing.instituteChiefUserId,
        instituteChiefName: existing.instituteChiefName,
      },
      discipline,
    );
    const wasAutoComputed = this.requiredTiersMatchAutoComputed(
      existing.requiredTiers,
      priorEffectiveChain,
      existing.instituteChiefName,
    );

    let nextInstituteChiefName =
      dto.instituteChiefName !== undefined
        ? dto.instituteChiefName
        : existing.instituteChiefName;
    let nextInstituteChiefUserId =
      dto.instituteChiefUserId !== undefined
        ? dto.instituteChiefUserId
        : existing.instituteChiefUserId;
    // Whichever of the two this request explicitly set wins; clear the other
    // so the row never ends up with both populated.
    if (dto.instituteChiefUserId !== undefined && dto.instituteChiefUserId) {
      nextInstituteChiefName = null;
    }
    if (dto.instituteChiefName !== undefined && dto.instituteChiefName) {
      nextInstituteChiefUserId = null;
    }

    const nextPackageOverrides = {
      designerUserId: this.resolveRoleOnUpdate(
        dto.designerUserId,
        existing.designerUserId,
        discipline.designerUserId,
      ),
      supportingDesignerUserId: this.resolveRoleOnUpdate(
        dto.supportingDesignerUserId,
        existing.supportingDesignerUserId,
        discipline.supportingDesignerUserId,
      ),
      disciplineOwnerUserId: this.resolveRoleOnUpdate(
        dto.disciplineOwnerUserId,
        existing.disciplineOwnerUserId,
        discipline.ownerUserId,
      ),
      reviewerUserId: this.resolveRoleOnUpdate(
        dto.reviewerUserId,
        existing.reviewerUserId,
        discipline.reviewerUserId,
      ),
      disciplinaryLeaderUserId: this.resolveRoleOnUpdate(
        dto.disciplinaryLeaderUserId,
        existing.disciplinaryLeaderUserId,
        discipline.disciplineLeadUserId,
      ),
      deptDeputyChiefUserId: this.resolveRoleOnUpdate(
        dto.deptDeputyChiefUserId,
        existing.deptDeputyChiefUserId,
        discipline.chiefUserId,
      ),
      instituteChiefUserId: nextInstituteChiefUserId,
      instituteChiefName: nextInstituteChiefName,
      siteRepresentativeUserId: externalParties.siteRepresentativeUserId,
    };
    const nextEffectiveChain = this.getEffectiveApprovalChain(
      nextPackageOverrides,
      discipline,
    );

    let requiredTiers = existing.requiredTiers;
    if (dto.requiredTiers !== undefined && dto.requiredTiers.length > 0) {
      requiredTiers = dto.requiredTiers;
    } else if (chainFkChanged && wasAutoComputed) {
      requiredTiers = computeRequiredTiers(nextEffectiveChain, nextInstituteChiefName);
    }

    if (!requiredTiers.includes(ReviewTier.DISCIPLINE_LEAD)) {
      throw new BadRequestException(
        'Required tiers must include DISCIPLINE_LEAD.',
      );
    }

    await this.designPackageRepository.update(packageId, {
      name: dto.name,
      nameZh: dto.nameZh,
      mainWorkContent: dto.mainWorkContent,
      plannedStartDate: dto.plannedStartDate
        ? new Date(dto.plannedStartDate)
        : undefined,
      plannedFinishDate: dto.plannedFinishDate
        ? new Date(dto.plannedFinishDate)
        : undefined,
      actualWorkDays: dto.actualWorkDays,
      urgencyLevel: dto.urgencyLevel,
      reviewLevel: dto.reviewLevel,
      projectedStatus: dto.projectedStatus,
      requiredTiers,
      instituteChiefName: nextInstituteChiefName,
      siteRepType: externalParties.siteRepType,
      siteRepName: externalParties.siteRepName,
      siteRepEmail: externalParties.siteRepEmail,
      siteRepPhone: externalParties.siteRepPhone,
      siteRepCompany: externalParties.siteRepCompany,
      consultantName: externalParties.consultantName,
      consultantTitle: externalParties.consultantTitle,
      consultantEmail: externalParties.consultantEmail,
      consultantPhone: externalParties.consultantPhone,
      consultantCompany: externalParties.consultantCompany,
      ...(chainFkChanged
        ? this.buildPackageApprovalChainUpdateRelations(nextPackageOverrides)
        : {}),
      updatedBy: ctx.userId,
    });

    const refreshed = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );

    if (chainFkChanged && refreshed) {
      await this.notifySubtaskRoleChanges(
        ctx,
        projectId,
        taskDisciplineId,
        packageId,
        refreshed.name,
        existing,
        refreshed,
      );
    }

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
    await this.taskAccessScopeService.assertDisciplineWritable(
      ctx,
      projectId,
      taskDisciplineId,
    );
    await this.taskAccessScopeService.assertPackageReadable(
      ctx,
      projectId,
      taskDisciplineId,
      packageId,
    );
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

    await this.assertCanManagePackageItems(ctx, projectId, taskDisciplineId, pkg);

    const edv = await this.engineeringDocumentVersionRepository.findById(
      ctx.companyId,
      dto.engineeringDocumentVersionId,
    );
    if (!edv) {
      throw new NotFoundException('Engineering document version not found');
    }

    if (edv.status !== EdvStatus.DRAFT) {
      throw new ConflictException(
        `Only DRAFT engineering document versions can be added to a package; found ${edv.status}`,
      );
    }

    const alreadyLinked = pkg.items.some(
      (item) =>
        item.engineeringDocumentVersionId === dto.engineeringDocumentVersionId,
    );
    if (alreadyLinked) {
      throw new ConflictException(
        'This engineering document version is already in the design package',
      );
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
    await this.assertCanManagePackageItems(ctx, projectId, taskDisciplineId, pkg);
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
   * Closes a design package after all EDVs are locked and linked items are resolved.
   */
  async closeDesignPackage(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
  ): Promise<MappedDesignPackage> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);

    const pkg = await this.designPackageRepository.findForClose(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    await this.assertCanCloseOrReopenPackage(ctx, pkg, 'close');

    if (pkg.packageStatus === DesignPackageStatus.CLOSED) {
      throw new ConflictException('Package is already closed.');
    }

    const unlockedDocuments = pkg.items
      .filter((item) => item.engineeringDocumentVersion.status !== EdvStatus.LOCKED)
      .map((item) => item.engineeringDocumentVersion.engineeringDocument.title);
    if (unlockedDocuments.length > 0) {
      throw new BadRequestException(
        `Cannot close package: ${unlockedDocuments.length} document(s) not yet locked: [${unlockedDocuments.join(', ')}]`,
      );
    }

    const pendingTriggerCount =
      await this.designPackageRepository.countPendingRevisionTriggersForPackage(
        ctx.companyId,
        packageId,
      );
    if (pendingTriggerCount > 0) {
      throw new BadRequestException(
        `Cannot close package: ${pendingTriggerCount} pending revision trigger(s) remain.`,
      );
    }

    const { openRfis, openIssues, openChangeRequests } =
      await this.designPackageRepository.countOpenLinkedEntitiesForPackage(
        ctx.companyId,
        pkg.sourceEntityType,
        pkg.sourceEntityId,
      );
    if (openRfis > 0 || openIssues > 0 || openChangeRequests > 0) {
      throw new BadRequestException(
        `Cannot close package: Open RFIs: ${openRfis}, Open Issues: ${openIssues}, Open Change Requests: ${openChangeRequests}.`,
      );
    }

    const closedAt = new Date();
    const start = pkg.plannedStartDate ?? pkg.submittedAt;
    const actualWorkDays = start
      ? Math.ceil(
          (closedAt.getTime() - new Date(start).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    const closed = await this.designPackageRepository.closePackage(
      packageId,
      ctx.userId,
      actualWorkDays,
    );

    return mapDesignPackage({ ...closed, items: pkg.items });
  }

  /**
   * Reopens a closed design package so the discipline leader can unlock EDVs.
   */
  async reopenDesignPackage(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
  ): Promise<MappedDesignPackage> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);

    const pkg = await this.designPackageRepository.findForClose(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    await this.assertCanCloseOrReopenPackage(ctx, pkg, 'reopen');

    if (pkg.packageStatus !== DesignPackageStatus.CLOSED) {
      throw new ConflictException('Only closed packages can be reopened.');
    }

    const reopened = await this.designPackageRepository.reopenPackage(
      packageId,
      ctx.userId,
    );

    return mapDesignPackage({ ...reopened, items: pkg.items });
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
   * Submits design package for review - opens session and freezes snapshot.
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
      approvedOnBehalfOfName: dto.approvedOnBehalfOfName,
    });
  }

  /**
   * Returns package for rework - closes session and reverts EDVs to DRAFT.
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
      comments: dto.comments.map((comment) => ({
        engineeringDocumentVersionId: comment.engineeringDocumentVersionId,
        body: comment.body,
        severity: comment.severity,
        commentDocumentVersionId: comment.commentDocumentVersionId,
        commentFileIds: comment.commentFileIds,
        assignedToUserId: comment.assignedToUserId,
      })),
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
   * Locks all EDVs in multiple packages - one kernel tx per package.
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

  /**
   * Lists review sessions for a task discipline.
   */
  async listReviewSessions(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    query: ReviewSessionListQueryDto,
  ): Promise<PaginatedResult<MappedReviewSessionListItem>> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);

    const status = query.status
      ? (query.status as ReviewSessionStatus)
      : ReviewSessionStatus.ACTIVE;
    const { skip, take } = buildPrismaPagination(query.page, query.limit);

    const { rows, total } = await this.epcReviewRepository.listSessionsForDiscipline(
      ctx.companyId,
      taskDisciplineId,
      status,
      skip,
      take,
    );

    return buildPaginatedResult(
      rows.map((row) => this.mapReviewSessionListItem(row)),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Attaches a document to the active review session at the current tier.
   */
  async addSessionAttachment(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    reviewSessionId: string,
    dto: AddReviewSessionAttachmentDto,
  ): Promise<MappedReviewSessionAttachment> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    return this.reviewWorkflowService.addSessionAttachment({
      companyId: ctx.companyId,
      actorId: ctx.userId,
      designPackageId: packageId,
      reviewSessionId,
      documentId: dto.documentId,
      purpose: dto.purpose,
      note: dto.note,
    });
  }

  /**
   * Lists tier attachments for a review session.
   */
  async listSessionAttachments(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    reviewSessionId: string,
  ): Promise<MappedReviewSessionAttachment[]> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    return this.reviewWorkflowService.listSessionAttachments({
      companyId: ctx.companyId,
      designPackageId: packageId,
      reviewSessionId,
    });
  }

  /**
   * Returns the frozen context snapshot for a review session.
   */
  async getReviewContextSnapshot(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    reviewSessionId: string,
  ): Promise<{
    snapshotId: string;
    capturedAt: string;
    contentHash: string | null;
    edvs: Array<{
      id: string;
      revisionLabel: string;
      status: string;
      engineeringDocumentName: string;
    }>;
  }> {
    await this.assertDisciplineScope(ctx, projectId, taskDisciplineId);
    const pkg = await this.designPackageRepository.findById(
      ctx.companyId,
      packageId,
    );
    if (!pkg || pkg.taskDisciplineId !== taskDisciplineId) {
      throw new NotFoundException('Design package not found');
    }

    const snapshot = await this.epcReviewRepository.findSessionSnapshotForPackage(
      ctx.companyId,
      packageId,
      reviewSessionId,
    );
    if (!snapshot) {
      throw new NotFoundException(
        'No context snapshot found for this review session.',
      );
    }

    return {
      snapshotId: snapshot.id,
      capturedAt: snapshot.capturedAt.toISOString(),
      contentHash: snapshot.contentHash,
      edvs: snapshot.edvDetails.map((edv) => ({
        id: edv.id,
        revisionLabel: edv.revisionLabel,
        status: edv.status,
        engineeringDocumentName: edv.engineeringDocument.title,
      })),
    };
  }

  private mapReviewSessionListItem(
    row: ReviewSession & {
      designPackage: { id: string; name: string };
      assignedToUser: {
        id: string;
        firstName: string;
        lastName: string;
      } | null;
    },
  ): MappedReviewSessionListItem {
    const now = Date.now();
    const slaOverdue =
      row.slaDeadlineAt != null && row.slaDeadlineAt.getTime() < now;

    return {
      id: row.id,
      designPackageId: row.designPackageId,
      designPackageName: row.designPackage.name,
      taskDisciplineId: row.taskDisciplineId,
      status: row.status,
      currentTier: row.currentTier,
      assigneeName: row.assignedToUser
        ? `${row.assignedToUser.firstName} ${row.assignedToUser.lastName}`.trim()
        : null,
      slaDeadlineAt: row.slaDeadlineAt?.toISOString() ?? null,
      slaOverdue,
      openedAt: row.openedAt.toISOString(),
    };
  }

  private resolveExternalPartiesOnWrite(
    dto: {
      siteRepresentativeUserId?: string | null;
      siteRepName?: string | null;
      siteRepEmail?: string | null;
      siteRepPhone?: string | null;
      siteRepCompany?: string | null;
      consultantName?: string | null;
      consultantTitle?: string | null;
      consultantEmail?: string | null;
      consultantPhone?: string | null;
      consultantCompany?: string | null;
    },
    siteRepType: SiteRepType,
  ): {
    siteRepType: SiteRepType;
    siteRepresentativeUserId: string | null;
    siteRepName: string | null;
    siteRepEmail: string | null;
    siteRepPhone: string | null;
    siteRepCompany: string | null;
    consultantName: string | null;
    consultantTitle: string | null;
    consultantEmail: string | null;
    consultantPhone: string | null;
    consultantCompany: string | null;
  } {
    const isInternal = siteRepType === SiteRepType.INTERNAL;
    return {
      siteRepType,
      siteRepresentativeUserId: isInternal
        ? (dto.siteRepresentativeUserId ?? null)
        : null,
      siteRepName: isInternal ? null : (dto.siteRepName ?? null),
      siteRepEmail: isInternal ? null : (dto.siteRepEmail ?? null),
      siteRepPhone: isInternal ? null : (dto.siteRepPhone ?? null),
      siteRepCompany: isInternal ? null : (dto.siteRepCompany ?? null),
      consultantName: dto.consultantName ?? null,
      consultantTitle: dto.consultantTitle ?? null,
      consultantEmail: dto.consultantEmail ?? null,
      consultantPhone: dto.consultantPhone ?? null,
      consultantCompany: dto.consultantCompany ?? null,
    };
  }

  private buildPackageApprovalChainCreateRelations(overrides: {
    designerUserId: string | null;
    supportingDesignerUserId: string | null;
    disciplineOwnerUserId: string | null;
    reviewerUserId: string | null;
    disciplinaryLeaderUserId: string | null;
    deptDeputyChiefUserId: string | null;
    instituteChiefUserId: string | null;
    siteRepresentativeUserId?: string | null;
  }) {
    return {
      ...(overrides.designerUserId
        ? { designerUser: { connect: { id: overrides.designerUserId } } }
        : {}),
      ...(overrides.supportingDesignerUserId
        ? {
            supportingDesignerUser: {
              connect: { id: overrides.supportingDesignerUserId },
            },
          }
        : {}),
      ...(overrides.disciplineOwnerUserId
        ? {
            disciplineOwnerUser: {
              connect: { id: overrides.disciplineOwnerUserId },
            },
          }
        : {}),
      ...(overrides.reviewerUserId
        ? { reviewerUser: { connect: { id: overrides.reviewerUserId } } }
        : {}),
      ...(overrides.disciplinaryLeaderUserId
        ? {
            disciplinaryLeaderUser: {
              connect: { id: overrides.disciplinaryLeaderUserId },
            },
          }
        : {}),
      ...(overrides.deptDeputyChiefUserId
        ? {
            deptDeputyChiefUser: {
              connect: { id: overrides.deptDeputyChiefUserId },
            },
          }
        : {}),
      ...(overrides.instituteChiefUserId
        ? {
            instituteChiefUser: {
              connect: { id: overrides.instituteChiefUserId },
            },
          }
        : {}),
      ...(overrides.siteRepresentativeUserId
        ? {
            siteRepresentative: {
              connect: { id: overrides.siteRepresentativeUserId },
            },
          }
        : {}),
    };
  }

  private buildPackageApprovalChainUpdateRelations(overrides: {
    designerUserId: string | null;
    supportingDesignerUserId: string | null;
    disciplineOwnerUserId: string | null;
    reviewerUserId: string | null;
    disciplinaryLeaderUserId: string | null;
    deptDeputyChiefUserId: string | null;
    instituteChiefUserId: string | null;
    siteRepresentativeUserId?: string | null;
  }) {
    return {
      designerUser: overrides.designerUserId
        ? { connect: { id: overrides.designerUserId } }
        : { disconnect: true },
      supportingDesignerUser: overrides.supportingDesignerUserId
        ? { connect: { id: overrides.supportingDesignerUserId } }
        : { disconnect: true },
      disciplineOwnerUser: overrides.disciplineOwnerUserId
        ? { connect: { id: overrides.disciplineOwnerUserId } }
        : { disconnect: true },
      reviewerUser: overrides.reviewerUserId
        ? { connect: { id: overrides.reviewerUserId } }
        : { disconnect: true },
      disciplinaryLeaderUser: overrides.disciplinaryLeaderUserId
        ? { connect: { id: overrides.disciplinaryLeaderUserId } }
        : { disconnect: true },
      deptDeputyChiefUser: overrides.deptDeputyChiefUserId
        ? { connect: { id: overrides.deptDeputyChiefUserId } }
        : { disconnect: true },
      instituteChiefUser: overrides.instituteChiefUserId
        ? { connect: { id: overrides.instituteChiefUserId } }
        : { disconnect: true },
      siteRepresentative: overrides.siteRepresentativeUserId
        ? { connect: { id: overrides.siteRepresentativeUserId } }
        : { disconnect: true },
    };
  }

  private resolveRoleOnUpdate(
    dtoValue: string | undefined,
    existingValue: string | null,
    disciplineDefault: string | null,
  ): string | null {
    if (dtoValue === undefined) {
      return existingValue;
    }
    return dtoValue ?? disciplineDefault;
  }

  private getEffectiveApprovalChain(
    pkg: {
      designerUserId: string | null;
      supportingDesignerUserId: string | null;
      disciplineOwnerUserId: string | null;
      reviewerUserId: string | null;
      disciplinaryLeaderUserId: string | null;
      deptDeputyChiefUserId: string | null;
      instituteChiefUserId: string | null;
      instituteChiefName?: string | null;
    },
    discipline: {
      ownerUserId: string | null;
      reviewerUserId: string | null;
      disciplineLeadUserId: string | null;
      chiefUserId: string | null;
      instituteChiefUserId: string | null;
      designerUserId: string | null;
      supportingDesignerUserId: string | null;
    },
  ) {
    return getEffectiveApprovalChain(pkg, discipline);
  }

  private requiredTiersMatchAutoComputed(
    tiers: ReviewTier[],
    chain: EffectiveApprovalChain,
    instituteChiefName?: string | null,
  ): boolean {
    const auto = computeRequiredTiers(chain, instituteChiefName);
    return (
      tiers.length === auto.length && tiers.every((tier, index) => tier === auto[index])
    );
  }

  private async assertDisciplineScope(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
  ): Promise<void> {
    await this.taskAccessScopeService.assertDisciplineReadable(
      ctx,
      projectId,
      taskDisciplineId,
    );
  }

  /**
   * Close/reopen are restricted to the discipline (or package) leader, or full-access admins.
   */
  private async assertCanCloseOrReopenPackage(
    ctx: PmContext,
    pkg: {
      disciplinaryLeaderUserId?: string | null;
      taskDiscipline: { disciplineLeadUserId: string | null };
    },
    action: 'close' | 'reopen',
  ): Promise<void> {
    const profile = await this.taskAccessScopeService.resolveProfile(ctx);
    if (profile.hasFullProjectAccess || profile.isProjectAdmin) {
      return;
    }

    const leaderUserId =
      pkg.disciplinaryLeaderUserId ?? pkg.taskDiscipline.disciplineLeadUserId;
    if (leaderUserId === ctx.userId) {
      return;
    }

    throw new ForbiddenException(
      `Only the discipline leader can ${action} a design package.`,
    );
  }

  /**
   * Allows package item mutations for schedule writers, full project access,
   * or primary/supporting designers on the package (or discipline defaults).
   */
  private async assertCanManagePackageItems(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    pkg: {
      designerUserId: string | null;
      supportingDesignerUserId: string | null;
      disciplineOwnerUserId: string | null;
      reviewerUserId: string | null;
      disciplinaryLeaderUserId: string | null;
      deptDeputyChiefUserId: string | null;
      instituteChiefUserId: string | null;
      instituteChiefName: string | null;
    },
  ): Promise<void> {
    const [canEdit, canCreate, profile] = await Promise.all([
      this.permissionService.hasPermission(
        ctx.userId,
        ctx.companyId,
        'schedule',
        'edit',
      ),
      this.permissionService.hasPermission(
        ctx.userId,
        ctx.companyId,
        'schedule',
        'create',
      ),
      this.taskAccessScopeService.resolveProfile(ctx),
    ]);
    if (canEdit || canCreate || profile.hasFullProjectAccess) {
      return;
    }

    const discipline = await this.taskDisciplineScopeRepository.findWithReviewRoles(
      ctx.companyId,
      taskDisciplineId,
      projectId,
    );
    if (!discipline) {
      throw new NotFoundException('Task discipline not found');
    }

    const chain = this.getEffectiveApprovalChain(pkg, discipline);
    if (
      chain.designerUserId === ctx.userId ||
      chain.supportingDesignerUserId === ctx.userId ||
      discipline.designerUserId === ctx.userId ||
      discipline.supportingDesignerUserId === ctx.userId
    ) {
      return;
    }

    throw new ForbiddenException('Missing permission: schedule.edit');
  }

  private async notifySubtaskRoleChanges(
    ctx: PmContext,
    projectId: string,
    taskDisciplineId: string,
    packageId: string,
    packageName: string,
    before: {
      designerUserId: string | null;
      reviewerUserId: string | null;
      disciplinaryLeaderUserId: string | null;
      deptDeputyChiefUserId: string | null;
      instituteChiefUserId: string | null;
      disciplineOwnerUserId: string | null;
      supportingDesignerUserId: string | null;
      siteRepresentativeUserId: string | null;
    } | null,
    after: {
      designerUserId: string | null;
      reviewerUserId: string | null;
      disciplinaryLeaderUserId: string | null;
      deptDeputyChiefUserId: string | null;
      instituteChiefUserId: string | null;
      disciplineOwnerUserId: string | null;
      supportingDesignerUserId: string | null;
      siteRepresentativeUserId: string | null;
    },
  ): Promise<void> {
    const assignments = before
      ? diffNewSubtaskRoleAssignments(before, after)
      : collectSubtaskRoleAssignments(after);
    if (assignments.length === 0) {
      return;
    }

    const context = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId: ctx.companyId,
        task: { projectId, deletedAt: null },
      }),
      select: {
        disciplineName: true,
        task: {
          select: {
            id: true,
            name: true,
            nameZh: true,
            project: {
              select: { name: true, nameZh: true, projectCode: true },
            },
          },
        },
      },
    });
    if (!context) {
      return;
    }

    await this.taskAssignmentNotificationService.notifySubtaskRolesAssigned(ctx, {
      projectName: context.task.project.name,
      projectNumber: context.task.project.projectCode,
      taskName: formatLocalizedName(context.task.name, context.task.nameZh),
      disciplineName: context.disciplineName,
      subtaskName: packageName,
      designPackageId: packageId,
      assignments,
    });
  }
}
