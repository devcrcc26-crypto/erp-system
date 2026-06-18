import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SubmittalStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  AddSubmittalItemsDto,
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

@Injectable()
export class SubmittalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly workflowKernel: WorkflowKernelService,
    private readonly externalReviewTrigger: ExternalReviewTriggerService,
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
  ): Promise<MappedSubmittal & { items: MappedSubmittalItem[] }> {
    const row = await this.prisma.submittal.findFirst({
      where: activeOnly({ id: submittalId, projectId }),
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!row) {
      throw new NotFoundException('Submittal not found');
    }
    return {
      ...mapSubmittal(row),
      items: row.items.map(mapSubmittalItem),
    };
  }

  /**
   * Legacy create — metadata only without design packages.
   */
  async createSubmittal(
    ctx: PmContext,
    projectId: string,
    dto: CreateSubmittalDto,
  ): Promise<MappedSubmittal> {
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
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Issues submittal — captures immutable package snapshots.
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
   * Issues multiple submittals — one kernel tx per submittal.
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
   * Records external submittal review — trigger only, no EDV mutation.
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

  private todayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
}
