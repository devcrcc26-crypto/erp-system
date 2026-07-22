import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { EdvStatus, FolderContextType, Prisma, SubmittalPurpose, SubmittalPreparedByRole, SubmittalStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  AddSubmittalItemsDto,
  CreateConstructionSubmittalDto,
  CreateDesignSubmittalDto,
  CreateSubmittalDto,
  CreateSubmittalReviewDto,
  IssueSubmittalDto,
  BatchIssueSubmittalsDto,
  BatchAddSubmittalItemsDto,
  PmListQueryDto,
  UpdateSubmittalDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapSubmittal,
  mapSubmittalItem,
  mapSubmittalReview,
  MappedSubmittal,
  MappedSubmittalItem,
  MappedSubmittalReview,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { enrichRowsWithUserDisplayNames, enrichWithUserDisplayNames } from '../utils/pm-user-names.util';
import { PM_SUBMITTAL_USER_NAMES, PM_REVIEWED_BY_NAME } from '../utils/pm-user-name-fields.const';
import { DocumentNumberService } from './document-number.service';
import { DisciplineScopeService } from './discipline-scope.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ExternalReviewTriggerService } from './external-review-trigger.service';
import { ProjectScopeService } from './project-scope.service';
import { TaskAccessScopeService } from './task-access-scope.service';
import { WorkflowKernelService } from './workflow-kernel.service';
import { WorkflowResultSnapshot } from '../../domain/contracts/workflow-kernel.contract';

const SUBMITTAL_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'title',
  'submittalNumber',
  'status',
  'dueDate',
  'submissionDate',
]);

const VERDICT_SUBMITTAL_STATUSES = new Set<SubmittalStatus>([
  SubmittalStatus.APPROVED,
  SubmittalStatus.APPROVED_WITH_COMMENTS,
  SubmittalStatus.REVISE_AND_RESUBMIT,
  SubmittalStatus.REJECTED,
]);

const SUBMITTAL_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['DRAFT'],
  UNDER_REVIEW: [],
};

const REVIEWABLE_SUBMITTAL_STATUSES = new Set<SubmittalStatus>([
  SubmittalStatus.SUBMITTED,
  SubmittalStatus.UNDER_REVIEW,
]);

const SUBMITTAL_REVIEW_OUTCOME_STATUSES = new Set<SubmittalStatus>([
  SubmittalStatus.UNDER_REVIEW,
  SubmittalStatus.APPROVED,
  SubmittalStatus.APPROVED_WITH_COMMENTS,
  SubmittalStatus.REVISE_AND_RESUBMIT,
  SubmittalStatus.REJECTED,
]);

export interface SubmittalItemReleasableEdv {
  readonly id: string;
  readonly title: string;
  readonly revisionLabel: string;
  readonly documentNumber: string | null;
  readonly edvStatus: string;
  readonly documentVersionId: string;
}

@Injectable()
export class SubmittalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly workflowKernel: WorkflowKernelService,
    private readonly externalReviewTrigger: ExternalReviewTriggerService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly taskAccessScopeService: TaskAccessScopeService,
  ) {}

  /**
   * Returns a paginated list of submittals for a project.
   */
  async listSubmittals(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedSubmittal>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = this.buildListWhere(projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      SUBMITTAL_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.submittal.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          items: {
            orderBy: { sortOrder: 'asc' },
            include: {
              designPackage: { select: { packageCode: true, name: true } },
            },
          },
        },
      }),
      this.prisma.submittal.count({ where }),
    ]);

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map(mapSubmittal),
      PM_SUBMITTAL_USER_NAMES,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-scoped submittals relevant to the current user across projects.
   * Defaults to construction submittals; pass query.submittalPurpose to widen.
   */
  async listMySubmittals(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedSubmittal>> {
    const where = this.buildMyListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      SUBMITTAL_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.submittal.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { name: true, projectCode: true } },
          items: {
            orderBy: { sortOrder: 'asc' },
            include: {
              designPackage: { select: { packageCode: true, name: true } },
            },
          },
        },
      }),
      this.prisma.submittal.count({ where }),
    ]);

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map(mapSubmittal),
      PM_SUBMITTAL_USER_NAMES,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Returns a single submittal by id scoped to a project.
   */
  async getSubmittal(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
  ): Promise<
    MappedSubmittal & {
      items: MappedSubmittalItem[];
      attachmentFolderId: string | null;
    }
  > {
    const row = await this.prisma.submittal.findFirst({
      where: activeOnly({ id: submittalId, projectId }),
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            designPackage: { select: { packageCode: true, name: true } },
          },
        },
        taskDiscipline: { select: { disciplineLeadUserId: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Submittal not found');
    }

    const folder = await this.engineeringDocumentFolderService.findEntityFolder(
      ctx,
      FolderContextType.SUBMITTAL,
      submittalId,
    );

    const attachmentFolder =
      folder ??
      (await this.engineeringDocumentFolderService.ensureSubmittalFolder(
        ctx,
        projectId,
        row.id,
        row.submittalNumber,
      ));

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      {
        ...mapSubmittal(row),
        disciplineLeadUserId: row.taskDiscipline?.disciplineLeadUserId ?? null,
        items: row.items.map(mapSubmittalItem),
        attachmentFolderId: attachmentFolder.id,
      },
      PM_SUBMITTAL_USER_NAMES,
    );
  }

  /**
   * Legacy create - metadata only without design packages.
   */
  async createSubmittal(
    ctx: PmContext,
    projectId: string,
    dto: CreateSubmittalDto,
  ): Promise<MappedSubmittal & { attachmentFolderId: string }> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const submittalNumber = await this.documentNumberService.getNextNumber(
      ctx,
      'SUBMITTAL',
    );

    const row = await this.prisma.submittal.create({
      data: {
        projectId,
        submittedBy: ctx.userId,
        submittalNumber,
        category: dto.category,
        title: dto.title,
        submittalPurpose: dto.submittalPurpose,
        preparedByRole: dto.preparedByRole,
        taskDisciplineId: dto.taskDisciplineId,
        contractor: dto.contractor,
        supplier: dto.supplier,
        specReference: dto.specReference,
        revisionNumber: dto.revisionNumber ?? 1,
        dueDate: parseOptionalDate(dto.dueDate),
        submissionDate: this.todayDate(),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const folder = await this.engineeringDocumentFolderService.ensureSubmittalFolder(
      ctx,
      projectId,
      row.id,
      row.submittalNumber,
    );

    return { ...mapSubmittal(row), attachmentFolderId: folder.id };
  }

  /**
   * Creates an in-construction submittal with optional design packages and document folder.
   */
  async createConstructionSubmittal(
    ctx: PmContext,
    projectId: string,
    dto: CreateConstructionSubmittalDto,
  ): Promise<
    MappedSubmittal & {
      items: MappedSubmittalItem[];
      attachmentFolderId: string;
    }
  > {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.assertCanCreateConstructionSubmittal(ctx, projectId);
    await this.disciplineScopeService.assertDisciplineAccess(
      ctx,
      projectId,
      dto.taskDisciplineId,
    );

    await this.assertPackagesBelongToDiscipline(
      ctx.companyId,
      projectId,
      dto.taskDisciplineId,
      [dto.designPackageId],
    );

    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: dto.designPackageId,
        companyId: ctx.companyId,
      }),
      select: {
        designerUserId: true,
        disciplinaryLeaderUserId: true,
      },
    });

    if (!pkg) {
      throw new NotFoundException('Subtask not found');
    }
    if (!pkg.designerUserId) {
      throw new BadRequestException(
        'Subtask has no designer assigned — cannot route for review',
      );
    }
    if (!pkg.disciplinaryLeaderUserId) {
      throw new BadRequestException(
        'Subtask has no discipline leader assigned — cannot route for approval',
      );
    }

    const submittalNumber = await this.documentNumberService.getNextNumber(
      ctx,
      'SUBMITTAL',
    );

    const row = await this.prisma.$transaction(async (tx) => {
      const submittal = await tx.submittal.create({
        data: {
          projectId,
          submittedBy: ctx.userId,
          assignedTo: pkg.designerUserId,
          reviewedBy: pkg.disciplinaryLeaderUserId,
          submittalNumber,
          category: dto.category,
          title: dto.title,
          submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION,
          preparedByRole: SubmittalPreparedByRole.SITE_TEAM,
          taskDisciplineId: dto.taskDisciplineId,
          contractor: dto.contractor,
          supplier: dto.supplier,
          specReference: dto.specReference,
          revisionNumber: dto.revisionNumber ?? 1,
          dueDate: parseOptionalDate(dto.dueDate),
          status: SubmittalStatus.SUBMITTED,
          submissionDate: this.todayDate(),
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      const item = await tx.submittalItem.create({
        data: {
          companyId: ctx.companyId,
          submittalId: submittal.id,
          designPackageId: dto.designPackageId,
          sortOrder: 0,
          createdBy: ctx.userId,
        },
      });

      return { submittal, items: [mapSubmittalItem(item)] };
    });

    const folder = await this.engineeringDocumentFolderService.ensureSubmittalFolder(
      ctx,
      projectId,
      row.submittal.id,
      row.submittal.submittalNumber,
    );

    return {
      ...mapSubmittal(row.submittal),
      items: row.items,
      attachmentFolderId: folder.id,
    };
  }

  /**
   * Submits an in-construction submittal to the discipline leader for approval,
   * or resubmits after a revise-and-resubmit outcome.
   */
  async submitToDisciplineLead(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
  ): Promise<MappedSubmittal> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);

    if (submittal.submittalPurpose !== SubmittalPurpose.IN_CONSTRUCTION) {
      throw new BadRequestException(
        'Only in-construction submittals can be submitted to a discipline leader',
      );
    }

    const isInitialSubmit = submittal.status === SubmittalStatus.DRAFT;
    const isResubmit = submittal.status === SubmittalStatus.REVISE_AND_RESUBMIT;

    if (!isInitialSubmit && !isResubmit) {
      throw new ConflictException(
        'Submittal cannot be submitted in its current status',
      );
    }

    if (isResubmit && submittal.submittedBy !== ctx.userId) {
      throw new ForbiddenException(
        'Only the original submitter can resubmit after a revise request',
      );
    }

    if (!submittal.taskDisciplineId) {
      throw new BadRequestException('Submittal discipline is required');
    }

    const discipline = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: submittal.taskDisciplineId,
        companyId: ctx.companyId,
      }),
      select: { disciplineLeadUserId: true },
    });
    if (!discipline?.disciplineLeadUserId) {
      throw new BadRequestException(
        'No discipline leader is assigned for this discipline',
      );
    }

    const linkedPackage = await this.prisma.submittalItem.findFirst({
      where: { submittalId },
      orderBy: { sortOrder: 'asc' },
      select: {
        designPackage: {
          select: {
            designerUserId: true,
            disciplinaryLeaderUserId: true,
          },
        },
      },
    });
    const designerUserId = linkedPackage?.designPackage.designerUserId;
    const disciplinaryLeaderUserId =
      linkedPackage?.designPackage.disciplinaryLeaderUserId ??
      discipline.disciplineLeadUserId;

    if (!designerUserId) {
      throw new BadRequestException(
        'Linked subtask has no designer assigned — cannot resubmit for review',
      );
    }

    const folder = await this.engineeringDocumentFolderService.findEntityFolder(
      ctx,
      FolderContextType.SUBMITTAL,
      submittalId,
    );
    const itemCount = await this.prisma.submittalItem.count({
      where: { submittalId },
    });
    const attachmentCount = folder
      ? await this.prisma.document.count({
          where: activeOnly({
            companyId: ctx.companyId,
            folderId: folder.id,
          }),
        })
      : 0;

    if (isInitialSubmit && itemCount === 0 && attachmentCount === 0) {
      throw new BadRequestException(
        'Attach at least one design package or upload supporting documents before submitting',
      );
    }

    if (isResubmit) {
      const latestReview = await this.prisma.submittalReview.findFirst({
        where: { submittalId },
        orderBy: { reviewedAt: 'desc' },
        select: { reviewedAt: true, status: true },
      });

      if (!latestReview) {
        throw new BadRequestException(
          'No prior review found — cannot resubmit this submittal',
        );
      }

      const revisedUploadCount =
        folder && latestReview
          ? await this.prisma.document.count({
              where: activeOnly({
                companyId: ctx.companyId,
                folderId: folder.id,
                createdAt: { gt: latestReview.reviewedAt },
              }),
            })
          : 0;

      if (revisedUploadCount === 0 && itemCount === 0) {
        throw new BadRequestException(
          'Upload revised documents before resubmitting to the discipline leader',
        );
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.submittal.update({
        where: { id: submittalId },
        data: {
          assignedTo: designerUserId,
          reviewedBy: disciplinaryLeaderUserId,
          status: SubmittalStatus.SUBMITTED,
          submissionDate: this.todayDate(),
          revisionNumber: isResubmit
            ? submittal.revisionNumber + 1
            : submittal.revisionNumber,
          reviewDate: isResubmit ? null : submittal.reviewDate,
          updatedBy: ctx.userId,
        },
      });

      if (isResubmit) {
        await tx.submittalReview.create({
          data: {
            submittalId,
            reviewedBy: ctx.userId,
            revisionNumber: updated.revisionNumber,
            status: SubmittalStatus.SUBMITTED,
            comments: 'Resubmitted for designer review',
          },
        });
      }

      return updated;
    });

    return mapSubmittal(row);
  }

  /**
   * Creates design-package submittal via WorkflowKernel (validates LOCKED packages).
   */
  async createDesignSubmittal(
    ctx: PmContext,
    projectId: string,
    dto: CreateDesignSubmittalDto,
  ): Promise<WorkflowResultSnapshot> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const submittalNumber = await this.documentNumberService.getNextNumber(
      ctx,
      'SUBMITTAL',
    );

    return this.workflowKernel.execute({
      type: 'CreateDesignSubmittal',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      projectId,
      designPackageIds: dto.designPackageIds,
      submittalNumber,
      title: dto.title,
      category: dto.category,
      contractor: dto.contractor,
      supplier: dto.supplier,
      specReference: dto.specReference,
      submittalPurpose: dto.submittalPurpose,
      preparedByRole: dto.preparedByRole,
      taskDisciplineId: dto.taskDisciplineId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Issues submittal - captures immutable package snapshots.
   */
  async issueSubmittal(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: IssueSubmittalDto,
  ): Promise<WorkflowResultSnapshot> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    this.assertSubmittalIssuable(submittal.status);

    return this.workflowKernel.execute({
      type: 'IssueSubmittal',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      submittalId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Lists LOCKED EDVs on the design package linked to a DRAFT submittal item.
   */
  async listSubmittalItemReleasableEdvs(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    itemId: string,
  ): Promise<SubmittalItemReleasableEdv[]> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const item = await this.getSubmittalItemOrThrow(
      ctx.companyId,
      projectId,
      submittalId,
      itemId,
    );
    if (item.submittal.issuedAt) {
      throw new BadRequestException('Submittal is already issued');
    }

    return this.loadLockedEdvsForPackage(ctx.companyId, item.designPackageId);
  }

  /**
   * Excludes an EDV from the external release snapshot (before issue).
   */
  async excludeSubmittalItemEdv(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    itemId: string,
    edvId: string,
  ): Promise<MappedSubmittalItem> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const item = await this.getSubmittalItemOrThrow(
      ctx.companyId,
      projectId,
      submittalId,
      itemId,
    );
    if (item.submittal.issuedAt) {
      throw new BadRequestException('Cannot change document selection after issue');
    }

    await this.assertEdvOnPackage(ctx.companyId, item.designPackageId, edvId);

    const excluded = new Set(item.excludedEdvIds);
    excluded.add(edvId);

    const updated = await this.prisma.submittalItem.update({
      where: { id: itemId },
      data: { excludedEdvIds: [...excluded] },
      include: {
        designPackage: { select: { packageCode: true, name: true } },
      },
    });

    return mapSubmittalItem(updated);
  }

  /**
   * Re-includes a previously excluded EDV in the release selection.
   */
  async includeSubmittalItemEdv(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    itemId: string,
    edvId: string,
  ): Promise<MappedSubmittalItem> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const item = await this.getSubmittalItemOrThrow(
      ctx.companyId,
      projectId,
      submittalId,
      itemId,
    );
    if (item.submittal.issuedAt) {
      throw new BadRequestException('Cannot change document selection after issue');
    }

    const updated = await this.prisma.submittalItem.update({
      where: { id: itemId },
      data: {
        excludedEdvIds: item.excludedEdvIds.filter((id) => id !== edvId),
      },
      include: {
        designPackage: { select: { packageCode: true, name: true } },
      },
    });

    return mapSubmittalItem(updated);
  }

  /**
   * Adds locked design packages to an existing DRAFT submittal.
   */
  async addItems(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: AddSubmittalItemsDto,
  ): Promise<WorkflowResultSnapshot> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (submittal.issuedAt) {
      throw new NotFoundException('Cannot add items to issued submittal');
    }

    return this.workflowKernel.execute({
      type: 'AddSubmittalItems',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      projectId,
      submittalId,
      designPackageIds: dto.designPackageIds,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Issues multiple submittals - one kernel tx per submittal.
   */
  async batchIssue(
    ctx: PmContext,
    projectId: string,
    dto: BatchIssueSubmittalsDto,
  ): Promise<WorkflowResultSnapshot[]> {
    const results: WorkflowResultSnapshot[] = [];
    for (const submittalId of dto.submittalIds) {
      const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
      this.assertSubmittalIssuable(submittal.status);
      const result = await this.workflowKernel.execute({
        type: 'IssueSubmittal',
        companyId: ctx.companyId,
        actorId: ctx.userId,
        submittalId,
        idempotencyKey: dto.idempotencyKey
          ? `${dto.idempotencyKey}:${submittalId}`
          : undefined,
      });
      results.push(result);
    }
    return results;
  }

  async batchAddItems(
    ctx: PmContext,
    projectId: string,
    dto: BatchAddSubmittalItemsDto,
  ): Promise<WorkflowResultSnapshot[]> {
    const results: WorkflowResultSnapshot[] = [];
    for (const submittalId of dto.submittalIds) {
      const result = await this.addItems(ctx, projectId, submittalId, {
        designPackageIds: dto.designPackageIds,
        idempotencyKey: dto.idempotencyKey,
      });
      results.push(result);
    }
    return results;
  }

  /**
   * Updates an existing submittal scoped to a project.
   */
  async updateSubmittal(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: UpdateSubmittalDto,
  ): Promise<MappedSubmittal> {
    if (dto.status !== undefined && VERDICT_SUBMITTAL_STATUSES.has(dto.status)) {
      throw new BadRequestException(
        'Submittal verdict status must be set through the review endpoint, not direct update.',
      );
    }

    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);

    if (
      dto.status !== undefined &&
      submittal.submittalPurpose === SubmittalPurpose.IN_CONSTRUCTION
    ) {
      if (dto.status === SubmittalStatus.SUBMITTED) {
        throw new BadRequestException(
          'Use the submit-to-lead action for in-construction submittals',
        );
      }
      if (
        dto.status === SubmittalStatus.DRAFT &&
        submittal.status === SubmittalStatus.SUBMITTED &&
        submittal.submittedBy !== ctx.userId
      ) {
        throw new ForbiddenException(
          'Only the submitter can recall an in-construction submittal to draft',
        );
      }
    }

    if (dto.status !== undefined) {
      const current = await this.prisma.submittal.findFirst({
        where: activeOnly({ id: submittalId, projectId }),
        select: { status: true },
      });
      if (dto.status !== current!.status) {
        const allowed = SUBMITTAL_STATUS_TRANSITIONS[current!.status];
        if (!allowed?.includes(dto.status)) {
          throw new BadRequestException(
            `Invalid submittal status transition from ${current!.status} to ${dto.status}.`,
          );
        }
      }
    }

    const row = await this.prisma.submittal.update({
      where: { id: submittalId },
      data: {
        category: dto.category,
        title: dto.title,
        contractor: dto.contractor,
        supplier: dto.supplier,
        specReference: dto.specReference,
        revisionNumber: dto.revisionNumber,
        dueDate: parseOptionalDate(dto.dueDate),
        reviewDate: parseOptionalDate(dto.reviewDate),
        status: dto.status,
        updatedBy: ctx.userId,
      },
    });

    return mapSubmittal(row);
  }

  /**
   * Soft-deletes a submittal scoped to a project.
   */
  async deleteSubmittal(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
  ): Promise<void> {
    await this.getSubmittalOrThrow(projectId, submittalId);
    await this.prisma.submittal.update({
      where: { id: submittalId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns all reviews for a submittal.
   */
  async listReviews(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
  ): Promise<MappedSubmittalReview[]> {
    await this.getSubmittalOrThrow(projectId, submittalId);

    const rows = await this.prisma.submittalReview.findMany({
      where: { submittalId },
      orderBy: { reviewedAt: 'asc' },
      include: {
        attachmentDocument: { select: { name: true } },
      },
    });

    return enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map(mapSubmittalReview),
      PM_REVIEWED_BY_NAME,
    );
  }

  /**
   * Records submittal review. Construction: Designer APPROVED → UNDER_REVIEW;
   * Designer REJECTED settles; D.Lead final verdicts settle or return to submitter.
   */
  async addReview(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: CreateSubmittalReviewDto,
  ): Promise<MappedSubmittalReview> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    await this.assertCanReviewSubmittal(ctx, submittal);

    if (!SUBMITTAL_REVIEW_OUTCOME_STATUSES.has(dto.status)) {
      throw new BadRequestException(
        `Invalid review status ${dto.status} for submittal review`,
      );
    }

    const requiresCommentOrFile = (
      [
        SubmittalStatus.APPROVED_WITH_COMMENTS,
        SubmittalStatus.REVISE_AND_RESUBMIT,
        SubmittalStatus.REJECTED,
      ] as SubmittalStatus[]
    ).includes(dto.status);

    if (
      requiresCommentOrFile &&
      !dto.comments?.trim() &&
      !dto.attachmentDocumentId
    ) {
      throw new BadRequestException(
        'A comment or file is required for this action.',
      );
    }

    if (dto.attachmentDocumentId) {
      await this.assertReviewAttachmentBelongsToSubmittal(
        ctx,
        submittalId,
        dto.attachmentDocumentId,
      );
    }

    const isConstruction =
      submittal.submittalPurpose === SubmittalPurpose.IN_CONSTRUCTION;
    const isDesignerStage =
      isConstruction &&
      submittal.status === SubmittalStatus.SUBMITTED &&
      submittal.assignedTo === ctx.userId;
    const isLeadStage =
      isConstruction &&
      submittal.status === SubmittalStatus.UNDER_REVIEW &&
      submittal.reviewedBy === ctx.userId;

    let nextStatus = dto.status;
    let nextAssignedTo: string | null = submittal.assignedTo;

    if (isDesignerStage) {
      if (
        dto.status !== SubmittalStatus.APPROVED &&
        dto.status !== SubmittalStatus.REJECTED
      ) {
        throw new BadRequestException(
          'Designer review may only approve (send to discipline leader) or reject',
        );
      }
      if (dto.status === SubmittalStatus.APPROVED) {
        if (!submittal.reviewedBy) {
          throw new BadRequestException(
            'No discipline leader is stored on this submittal',
          );
        }
        nextStatus = SubmittalStatus.UNDER_REVIEW;
        nextAssignedTo = submittal.reviewedBy;
      } else {
        nextStatus = SubmittalStatus.REJECTED;
        nextAssignedTo = null;
      }
    } else if (isLeadStage) {
      const leadOutcomes = new Set<SubmittalStatus>([
        SubmittalStatus.APPROVED,
        SubmittalStatus.APPROVED_WITH_COMMENTS,
        SubmittalStatus.REVISE_AND_RESUBMIT,
        SubmittalStatus.REJECTED,
      ]);
      if (!leadOutcomes.has(dto.status)) {
        throw new BadRequestException(
          `Invalid discipline leader outcome ${dto.status}`,
        );
      }
      if (dto.status === SubmittalStatus.REVISE_AND_RESUBMIT) {
        nextAssignedTo = submittal.submittedBy;
      } else {
        nextAssignedTo = null;
      }
      nextStatus = dto.status;
    } else if (isConstruction) {
      throw new ForbiddenException(
        'You are not authorized to review this submittal in its current stage',
      );
    }

    const revisionNumber =
      dto.revisionNumber ?? submittal.revisionNumber ?? 1;

    const review = await this.prisma.$transaction(async (tx) => {
      const items = await tx.submittalItem.findMany({
        where: { submittalId },
        select: { id: true },
      });

      const created = await tx.submittalReview.create({
        data: {
          submittalId,
          reviewedBy: ctx.userId,
          revisionNumber,
          status: dto.status,
          comments: dto.comments?.trim() || null,
          attachmentDocumentId: dto.attachmentDocumentId ?? null,
        },
        include: {
          attachmentDocument: { select: { name: true } },
        },
      });

      await tx.submittal.update({
        where: { id: submittalId },
        data: {
          status: nextStatus,
          assignedTo: nextAssignedTo,
          reviewedBy: isConstruction
            ? submittal.reviewedBy
            : ctx.userId,
          revisionNumber,
          reviewDate: this.todayDate(),
          updatedBy: ctx.userId,
        },
      });

      await this.externalReviewTrigger.recordFromSubmittalReview(tx, {
        companyId: ctx.companyId,
        projectId,
        submittalId,
        submittalReviewId: created.id,
        reviewStatus: dto.status,
        comments: dto.comments,
        submittalItemIds: items.map((i) => i.id),
        actorId: ctx.userId,
      });

      return created;
    });

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapSubmittalReview(review),
      PM_REVIEWED_BY_NAME,
    );
  }

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.SubmittalWhereInput {
    const where: Prisma.SubmittalWhereInput = activeOnly({ projectId });

    if (query.status) {
      where.status = query.status as SubmittalStatus;
    }

    if (query.submittalPurpose) {
      const purposes = query.submittalPurpose
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean) as SubmittalPurpose[];
      where.submittalPurpose =
        purposes.length === 1 ? purposes[0] : { in: purposes };
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { submittalNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
        { contractor: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildMyListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Prisma.SubmittalWhereInput {
    const relevanceOr: Prisma.SubmittalWhereInput[] = [
      { assignedTo: ctx.userId },
      { reviewedBy: ctx.userId },
      { submittedBy: ctx.userId },
      {
        taskDiscipline: activeOnly({
          disciplineLeadUserId: ctx.userId,
        }),
      },
    ];

    let submittalPurpose: Prisma.SubmittalWhereInput['submittalPurpose'] =
      SubmittalPurpose.IN_CONSTRUCTION;
    if (query.submittalPurpose) {
      const purposes = query.submittalPurpose
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean) as SubmittalPurpose[];
      submittalPurpose = purposes.length === 1 ? purposes[0] : { in: purposes };
    }

    const where: Prisma.SubmittalWhereInput = activeOnly({
      submittalPurpose,
      project: activeOnly({ companyId: ctx.companyId }),
      OR: relevanceOr,
    });

    if (query.status) {
      where.status = query.status as SubmittalStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { submittalNumber: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { category: { contains: term, mode: 'insensitive' } },
            { contractor: { contains: term, mode: 'insensitive' } },
            {
              project: {
                name: { contains: term, mode: 'insensitive' },
              },
            },
            {
              project: {
                projectCode: { contains: term, mode: 'insensitive' },
              },
            },
          ],
        },
      ];
    }

    return where;
  }

  private async getSubmittalOrThrow(projectId: string, submittalId: string) {
    const row = await this.prisma.submittal.findFirst({
      where: activeOnly({ id: submittalId, projectId }),
    });
    if (!row) {
      throw new NotFoundException('Submittal not found');
    }
    return row;
  }

  private async getSubmittalItemOrThrow(
    companyId: string,
    projectId: string,
    submittalId: string,
    itemId: string,
  ) {
    const item = await this.prisma.submittalItem.findFirst({
      where: { id: itemId, companyId, submittalId },
      include: {
        submittal: { select: { projectId: true, issuedAt: true } },
        designPackage: { select: { packageCode: true, name: true } },
      },
    });
    if (!item || item.submittal.projectId !== projectId) {
      throw new NotFoundException('Submittal item not found');
    }
    return item;
  }

  private async loadLockedEdvsForPackage(
    companyId: string,
    designPackageId: string,
  ): Promise<SubmittalItemReleasableEdv[]> {
    const rows = await this.prisma.designPackageItem.findMany({
      where: { companyId, designPackageId },
      orderBy: { sortOrder: 'asc' },
      include: {
        engineeringDocumentVersion: {
          include: { engineeringDocument: true },
        },
      },
    });

    return rows
      .filter((row) => row.engineeringDocumentVersion.status === EdvStatus.LOCKED)
      .map((row) => {
        const edv = row.engineeringDocumentVersion;
        const doc = edv.engineeringDocument;
        return {
          id: edv.id,
          title: doc.title,
          revisionLabel: edv.revisionLabel,
          documentNumber: doc.documentNumber,
          edvStatus: edv.status,
          documentVersionId: edv.documentVersionId,
        };
      });
  }

  private async assertEdvOnPackage(
    companyId: string,
    designPackageId: string,
    edvId: string,
  ): Promise<void> {
    const link = await this.prisma.designPackageItem.findFirst({
      where: {
        companyId,
        designPackageId,
        engineeringDocumentVersionId: edvId,
        engineeringDocumentVersion: { status: EdvStatus.LOCKED },
      },
    });
    if (!link) {
      throw new NotFoundException(
        'Locked engineering document version not found on this subtask',
      );
    }
  }

  private assertSubmittalIssuable(status: SubmittalStatus): void {
    if (status !== SubmittalStatus.DRAFT) {
      throw new BadRequestException(
        'Only DRAFT submittals can be issued.',
      );
    }
  }

  private async assertPackagesBelongToDiscipline(
    companyId: string,
    projectId: string,
    taskDisciplineId: string,
    designPackageIds: readonly string[],
  ): Promise<void> {
    const packages = await this.prisma.designPackage.findMany({
      where: {
        id: { in: [...designPackageIds] },
        companyId,
        taskDisciplineId,
        deletedAt: null,
        taskDiscipline: {
          task: { projectId, deletedAt: null },
        },
      },
      select: { id: true },
    });

    if (packages.length !== designPackageIds.length) {
      throw new BadRequestException(
        'One or more design packages are invalid for the selected discipline',
      );
    }
  }

  private todayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  /**
   * Ensures a review attachment belongs to this submittal's document folder.
   */
  private async assertReviewAttachmentBelongsToSubmittal(
    ctx: PmContext,
    submittalId: string,
    documentId: string,
  ): Promise<void> {
    const folder = await this.engineeringDocumentFolderService.findEntityFolder(
      ctx,
      FolderContextType.SUBMITTAL,
      submittalId,
    );
    if (!folder) {
      throw new BadRequestException(
        'Submittal has no attachment folder for review files',
      );
    }

    const document = await this.prisma.document.findFirst({
      where: activeOnly({
        id: documentId,
        companyId: ctx.companyId,
        folderId: folder.id,
      }),
      select: { id: true },
    });
    if (!document) {
      throw new BadRequestException(
        'Review attachment must be a document in this submittal folder',
      );
    }
  }

  /**
   * Ensures only the assigned designer or stored discipline lead can review
   * construction submittals at the correct stage.
   */
  private async assertCanReviewSubmittal(
    ctx: PmContext,
    submittal: {
      id: string;
      submittalPurpose: SubmittalPurpose | null;
      status: SubmittalStatus;
      assignedTo: string | null;
      reviewedBy: string | null;
      taskDisciplineId: string | null;
    },
  ): Promise<void> {
    if (!REVIEWABLE_SUBMITTAL_STATUSES.has(submittal.status)) {
      throw new BadRequestException(
        `Cannot review submittal in ${submittal.status} status`,
      );
    }

    if (submittal.submittalPurpose === SubmittalPurpose.IN_CONSTRUCTION) {
      const isAssignee = submittal.assignedTo === ctx.userId;
      const isStoredLead = submittal.reviewedBy === ctx.userId;

      if (!isAssignee && !isStoredLead) {
        throw new ForbiddenException(
          'Only the assigned designer or discipline leader can review this submittal',
        );
      }

      if (
        submittal.status === SubmittalStatus.SUBMITTED &&
        !isAssignee
      ) {
        throw new ForbiddenException(
          'Only the assigned designer can review this submittal',
        );
      }

      if (
        submittal.status === SubmittalStatus.UNDER_REVIEW &&
        !isStoredLead
      ) {
        throw new ForbiddenException(
          'Only the discipline leader can approve this submittal',
        );
      }
      return;
    }

    if (submittal.assignedTo !== ctx.userId) {
      throw new ForbiddenException(
        'Only the assigned reviewer can record a review for this submittal',
      );
    }
  }

  /**
   * Full-access roles bypass; otherwise only FK discipline leads or designers.
   */
  private async assertCanCreateConstructionSubmittal(
    ctx: PmContext,
    projectId: string,
  ): Promise<void> {
    const profile = await this.taskAccessScopeService.resolveProfile(ctx);
    if (profile.hasFullProjectAccess) {
      return;
    }

    const [leadDiscipline, designerPkg] = await Promise.all([
      this.prisma.taskDiscipline.findFirst({
        where: activeOnly({
          companyId: ctx.companyId,
          disciplineLeadUserId: ctx.userId,
          task: { projectId, deletedAt: null },
        }),
        select: { id: true },
      }),
      this.prisma.designPackage.findFirst({
        where: activeOnly({
          companyId: ctx.companyId,
          designerUserId: ctx.userId,
          taskDiscipline: {
            deletedAt: null,
            task: { projectId, deletedAt: null },
          },
        }),
        select: { id: true },
      }),
    ]);

    if (!leadDiscipline && !designerPkg) {
      throw new ForbiddenException(
        'Only discipline leaders and designers can create submittals',
      );
    }
  }
}
