import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { FolderContextType, Prisma, SubmittalPurpose, SubmittalPreparedByRole, SubmittalStatus } from '@prisma/client';
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
import { DocumentNumberService } from './document-number.service';
import { DisciplineScopeService } from './discipline-scope.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ExternalReviewTriggerService } from './external-review-trigger.service';
import { ProjectScopeService } from './project-scope.service';
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
      this.prisma.submittal.findMany({ where, skip, take, orderBy }),
      this.prisma.submittal.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapSubmittal),
      total,
      query.page,
      query.limit,
    );
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
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException('Submittal not found');
    }

    const folder = await this.engineeringDocumentFolderService.findEntityFolder(
      ctx,
      FolderContextType.SUBMITTAL,
      submittalId,
    );

    return {
      ...mapSubmittal(row),
      items: row.items.map(mapSubmittalItem),
      attachmentFolderId: folder?.id ?? null,
    };
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
    await this.disciplineScopeService.assertDisciplineAccess(
      ctx,
      projectId,
      dto.taskDisciplineId,
    );

    const designPackageIds = dto.designPackageIds ?? [];
    if (designPackageIds.length > 0) {
      await this.assertPackagesBelongToDiscipline(
        ctx.companyId,
        projectId,
        dto.taskDisciplineId,
        designPackageIds,
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
          status: SubmittalStatus.DRAFT,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      const items: MappedSubmittalItem[] = [];
      for (let i = 0; i < designPackageIds.length; i++) {
        const item = await tx.submittalItem.create({
          data: {
            companyId: ctx.companyId,
            submittalId: submittal.id,
            designPackageId: designPackageIds[i]!,
            sortOrder: i,
            createdBy: ctx.userId,
          },
        });
        items.push(mapSubmittalItem(item));
      }

      return { submittal, items };
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
   * Submits an in-construction submittal to the discipline leader for approval.
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
    if (submittal.status !== SubmittalStatus.DRAFT) {
      throw new ConflictException('Submittal has already been submitted');
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

    if (itemCount === 0 && attachmentCount === 0) {
      throw new BadRequestException(
        'Attach at least one design package or upload supporting documents before submitting',
      );
    }

    const row = await this.prisma.submittal.update({
      where: { id: submittalId },
      data: {
        assignedTo: discipline.disciplineLeadUserId,
        status: SubmittalStatus.SUBMITTED,
        submissionDate: this.todayDate(),
        updatedBy: ctx.userId,
      },
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
    await this.getSubmittalOrThrow(projectId, submittalId);

    return this.workflowKernel.execute({
      type: 'IssueSubmittal',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      submittalId,
      idempotencyKey: dto.idempotencyKey,
    });
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
      await this.getSubmittalOrThrow(projectId, submittalId);
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
        'Submittal verdict must be set through the review endpoint, not direct update.',
      );
    }

    await this.getSubmittalOrThrow(projectId, submittalId);

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
    });

    return rows.map(mapSubmittalReview);
  }

  /**
   * Records external submittal review - trigger only, no EDV mutation.
   */
  async addReview(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: CreateSubmittalReviewDto,
  ): Promise<MappedSubmittalReview> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
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
          comments: dto.comments,
        },
      });

      await tx.submittal.update({
        where: { id: submittalId },
        data: {
          status: dto.status,
          reviewedBy: ctx.userId,
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

    return mapSubmittalReview(review);
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
      where.submittalPurpose = query.submittalPurpose;
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

  private async getSubmittalOrThrow(projectId: string, submittalId: string) {
    const row = await this.prisma.submittal.findFirst({
      where: activeOnly({ id: submittalId, projectId }),
    });
    if (!row) {
      throw new NotFoundException('Submittal not found');
    }
    return row;
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
}
