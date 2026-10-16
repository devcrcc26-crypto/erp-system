import { Injectable, NotFoundException, BadRequestException, ConflictException, ForbiddenException, Logger, Optional } from '@nestjs/common';
import { EdvStatus, FolderContextType, Prisma, SubmittalPurpose, SubmittalPreparedByRole, SubmittalSiteReviewStatus, SubmittalStatus } from '@prisma/client';
import { formatDesignPackageFullCode } from '../../../../shared/discipline-number.util';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
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
  RecordExternalApprovalDto,
  RecordExternalFeedbackDto,
  SubmittalSiteReviewCommentDto,
  UpdateSubmittalDto,
  WithdrawSubmittalDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapSubmittal,
  mapSubmittalExternalApproval,
  mapSubmittalExternalFeedback,
  mapSubmittalItem,
  mapSubmittalReview,
  mapSubmittalSiteReview,
  MappedSubmittal,
  MappedSubmittalExternalApproval,
  MappedSubmittalExternalFeedback,
  MappedSubmittalItem,
  MappedSubmittalReview,
  MappedSubmittalSiteReview,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
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
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';

const SITE_REVIEW_REQUESTED_EVENT = 'submittal.site_review_requested';
const SITE_REVIEW_APPROVED_EVENT = 'submittal.site_review_approved';
const SITE_REVIEW_ALL_APPROVED_EVENT = 'submittal.site_review_all_approved';
const SITE_REVIEW_COMMENTED_EVENT = 'submittal.site_review_commented';
const SITE_REVIEW_REREQUESTED_EVENT = 'submittal.site_review_rerequested';
const EXTERNAL_SITE_APPROVAL_EVENT = 'submittal.external_site_approval';
const EXTERNAL_CONSULTANT_APPROVAL_EVENT = 'submittal.external_consultant_approval';
const EXTERNAL_FEEDBACK_EVENT = 'submittal.external_feedback';
const EXTERNAL_WITHDRAWN_EVENT = 'submittal.external_withdrawn';

/** Package fields needed to compute fullSubtaskCode on mapped items. */
const SUBMITTAL_ITEM_PACKAGE_SELECT = {
  packageCode: true,
  name: true,
  subtaskIndex: true,
  siteRepType: true,
  siteRepName: true,
  siteRepEmail: true,
  siteRepPhone: true,
  siteRepCompany: true,
  siteRepresentativeUserId: true,
  consultantName: true,
  consultantTitle: true,
  consultantEmail: true,
  consultantPhone: true,
  consultantCompany: true,
  taskDiscipline: {
    select: {
      disciplineIndex: true,
      task: {
        select: {
          overseasTaskNumber: true,
        },
      },
    },
  },
} as const;

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
  UNDER_SITE_REVIEW: [],
  SITE_APPROVED: [],
  PENDING_CONSULTANT_REVIEW: [],
  CONSULTANT_REVIEWED: [],
  SUBMITTED: ['DRAFT'],
  WITHDRAWN: [],
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
  private readonly logger = new Logger(SubmittalsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly workflowKernel: WorkflowKernelService,
    private readonly externalReviewTrigger: ExternalReviewTriggerService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly taskAccessScopeService: TaskAccessScopeService,
    private readonly permissionService: PermissionService,
    @Optional()
    private readonly notificationService?: NotificationService,
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
              designPackage: { select: SUBMITTAL_ITEM_PACKAGE_SELECT },
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
              designPackage: { select: SUBMITTAL_ITEM_PACKAGE_SELECT },
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
   * Company-wide construction submittals (portfolio / admin users).
   */
  async listAllSubmittals(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedSubmittal>> {
    return this.listCompanySubmittals(ctx, query, SubmittalPurpose.IN_CONSTRUCTION);
  }

  /**
   * Company-wide external releases (site / consultant purposes).
   */
  async listAllExternalReleases(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedSubmittal>> {
    return this.listCompanySubmittals(ctx, query, {
      in: [SubmittalPurpose.DISCIPLINE_SITE, SubmittalPurpose.DISCIPLINE_CONSULTANT],
    });
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
      siteReviews: MappedSubmittalSiteReview[];
      externalApprovals: MappedSubmittalExternalApproval[];
      externalFeedback: MappedSubmittalExternalFeedback[];
      attachmentFolderId: string | null;
    }
  > {
    const row = await this.prisma.submittal.findFirst({
      where: activeOnly({ id: submittalId, projectId }),
      include: {
        items: {
          orderBy: { sortOrder: 'asc' },
          include: {
            designPackage: { select: SUBMITTAL_ITEM_PACKAGE_SELECT },
          },
        },
        siteReviews: {
          orderBy: { createdAt: 'asc' },
        },
        externalApprovals: {
          orderBy: { createdAt: 'asc' },
        },
        externalFeedback: {
          orderBy: { createdAt: 'asc' },
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

    const siteReviews = await this.enrichSiteReviews(
      ctx.companyId,
      row.siteReviews.map(mapSubmittalSiteReview),
    );

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      {
        ...mapSubmittal(row),
        disciplineLeadUserId: row.taskDiscipline?.disciplineLeadUserId ?? null,
        items: row.items.map(mapSubmittalItem),
        siteReviews,
        externalApprovals: row.externalApprovals.map(mapSubmittalExternalApproval),
        externalFeedback: row.externalFeedback.map(mapSubmittalExternalFeedback),
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
        'Subtask has no designer assigned - cannot route for review',
      );
    }
    if (!pkg.disciplinaryLeaderUserId) {
      throw new BadRequestException(
        'Subtask has no discipline leader assigned - cannot route for approval',
      );
    }

    const submittalNumber = await this.generateConstructionSubmittalNumber(
      ctx.companyId,
      dto.designPackageId,
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
        'Linked subtask has no designer assigned - cannot resubmit for review',
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
          'No prior review found - cannot resubmit this submittal',
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

    const isExternalRelease =
      dto.submittalPurpose === SubmittalPurpose.DISCIPLINE_SITE ||
      dto.submittalPurpose === SubmittalPurpose.DISCIPLINE_CONSULTANT;

    const category =
      dto.category?.trim() ||
      (isExternalRelease ? 'External Release' : undefined);
    if (!category) {
      throw new BadRequestException('Category is required');
    }

    const submittalNumber = isExternalRelease
      ? await this.generateExternalReleaseNumber(
          ctx.companyId,
          dto.designPackageIds[0]!,
        )
      : await this.documentNumberService.getNextNumber(ctx, 'SUBMITTAL');

    return this.workflowKernel.execute({
      type: 'CreateDesignSubmittal',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      projectId,
      designPackageIds: dto.designPackageIds,
      submittalNumber,
      title: dto.title,
      category,
      contractor: dto.recipientName ?? dto.contractor,
      supplier: dto.supplier,
      specReference: dto.description ?? dto.specReference,
      submittalPurpose: dto.submittalPurpose,
      preparedByRole: dto.preparedByRole,
      taskDisciplineId: dto.taskDisciplineId,
      idempotencyKey: dto.idempotencyKey,
    });
  }

  /**
   * Issues submittal - captures immutable package snapshots.
   * May route to UNDER_SITE_REVIEW when any item package has a site rep.
   */
  async issueSubmittal(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: IssueSubmittalDto,
  ): Promise<WorkflowResultSnapshot> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    this.assertSubmittalIssuable(submittal);

    const result = await this.workflowKernel.execute({
      type: 'IssueSubmittal',
      companyId: ctx.companyId,
      actorId: ctx.userId,
      submittalId,
      idempotencyKey: dto.idempotencyKey,
    });

    if (result.siteReviewStarted && result.siteRepUserIds?.length) {
      await this.notifySiteRepsReviewRequested(
        ctx,
        projectId,
        submittalId,
        submittal.submittalNumber,
        result.siteRepUserIds,
      );
    }

    return result;
  }

  /**
   * Site rep approves their SubmittalSiteReview row.
   * When all rows are APPROVED, transitions submittal to SITE_APPROVED.
   */
  async approveSiteReview(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    reviewId: string,
  ): Promise<MappedSubmittal & { siteReviews: MappedSubmittalSiteReview[] }> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (submittal.status !== SubmittalStatus.UNDER_SITE_REVIEW) {
      throw new BadRequestException(
        'Site review can only be approved while UNDER_SITE_REVIEW',
      );
    }

    const review = await this.getSiteReviewOrThrow(
      ctx.companyId,
      submittalId,
      reviewId,
    );
    if (review.siteRepUserId !== ctx.userId) {
      throw new ForbiddenException('Only the assigned site representative may approve');
    }
    if (review.status === SubmittalSiteReviewStatus.APPROVED) {
      throw new BadRequestException('Site review already approved');
    }

    await this.prisma.submittalSiteReview.update({
      where: { id: reviewId },
      data: {
        status: SubmittalSiteReviewStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const pending = await this.prisma.submittalSiteReview.count({
      where: {
        submittalId,
        companyId: ctx.companyId,
        status: { not: SubmittalSiteReviewStatus.APPROVED },
      },
    });

    if (pending === 0) {
      const hasConsultant = await this.submittalHasConsultant(
        ctx.companyId,
        submittalId,
      );
      const nextStatus = hasConsultant
        ? SubmittalStatus.PENDING_CONSULTANT_REVIEW
        : SubmittalStatus.SITE_APPROVED;
      await this.prisma.submittal.update({
        where: { id: submittalId },
        data: {
          status: nextStatus,
          updatedBy: ctx.userId,
        },
      });
      await this.notifySiteReviewComplete(
        ctx,
        projectId,
        submittalId,
        submittal.submittalNumber,
        submittal.submittedBy,
        submittal.taskDisciplineId,
      );
    } else {
      await this.notifyCreatorSiteRepApproved(
        ctx,
        projectId,
        submittalId,
        submittal.submittalNumber,
        submittal.submittedBy,
      );
    }

    const detail = await this.getSubmittal(ctx, projectId, submittalId);
    return detail;
  }

  /**
   * Site rep comments without approving - stays UNDER_SITE_REVIEW (option B).
   */
  async commentSiteReview(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    reviewId: string,
    dto: SubmittalSiteReviewCommentDto,
  ): Promise<MappedSubmittalSiteReview> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (submittal.status !== SubmittalStatus.UNDER_SITE_REVIEW) {
      throw new BadRequestException(
        'Site review comments are only allowed while UNDER_SITE_REVIEW',
      );
    }

    const review = await this.getSiteReviewOrThrow(
      ctx.companyId,
      submittalId,
      reviewId,
    );
    if (review.siteRepUserId !== ctx.userId) {
      throw new ForbiddenException('Only the assigned site representative may comment');
    }

    const comment = dto.comment.trim();
    if (!comment) {
      throw new BadRequestException('Comment is required');
    }

    const updated = await this.prisma.submittalSiteReview.update({
      where: { id: reviewId },
      data: {
        status: SubmittalSiteReviewStatus.COMMENTED,
        comment,
        reviewedAt: new Date(),
        reviewedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await this.notifyCreatorSiteRepCommented(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
      submittal.submittedBy,
      submittal.taskDisciplineId,
      comment,
    );

    const [mapped] = await this.enrichSiteReviews(ctx.companyId, [
      mapSubmittalSiteReview(updated),
    ]);
    return mapped!;
  }

  /**
   * Option B partial reset: after a CR is resolved, D.Lead/creator resets only
   * the commenting site rep back to PENDING. Other approvals are preserved.
   */
  async requestSiteReviewReReview(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    reviewId: string,
  ): Promise<MappedSubmittalSiteReview> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (submittal.status !== SubmittalStatus.UNDER_SITE_REVIEW) {
      throw new BadRequestException(
        'Re-review can only be requested while UNDER_SITE_REVIEW',
      );
    }

    const isCreator = submittal.submittedBy === ctx.userId;
    const isLead =
      submittal.taskDisciplineId != null &&
      (await this.isDisciplineLead(ctx, submittal.taskDisciplineId));
    if (!isCreator && !isLead) {
      throw new ForbiddenException(
        'Only the creator or discipline lead may request re-review',
      );
    }

    const review = await this.getSiteReviewOrThrow(
      ctx.companyId,
      submittalId,
      reviewId,
    );
    if (review.status !== SubmittalSiteReviewStatus.COMMENTED) {
      throw new BadRequestException(
        'Re-review is only available for COMMENTED site reviews',
      );
    }

    const updated = await this.prisma.submittalSiteReview.update({
      where: { id: reviewId },
      data: {
        status: SubmittalSiteReviewStatus.PENDING,
        reviewedAt: null,
        reviewedBy: null,
        updatedBy: ctx.userId,
      },
    });

    await this.notifySiteRepRerequested(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
      review.siteRepUserId,
    );

    const [mapped] = await this.enrichSiteReviews(ctx.companyId, [
      mapSubmittalSiteReview(updated),
    ]);
    return mapped!;
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
    if (item.submittal.issuedAt || item.submittal.status !== SubmittalStatus.DRAFT) {
      throw new BadRequestException(
        'Documents can only be selected while the submittal is DRAFT',
      );
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
    if (item.submittal.issuedAt || item.submittal.status !== SubmittalStatus.DRAFT) {
      throw new BadRequestException('Cannot change document selection after issue');
    }

    await this.assertEdvOnPackage(ctx.companyId, item.designPackageId, edvId);

    const excluded = new Set(item.excludedEdvIds);
    excluded.add(edvId);

    const updated = await this.prisma.submittalItem.update({
      where: { id: itemId },
      data: { excludedEdvIds: [...excluded] },
      include: {
        designPackage: { select: SUBMITTAL_ITEM_PACKAGE_SELECT },
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
    if (item.submittal.issuedAt || item.submittal.status !== SubmittalStatus.DRAFT) {
      throw new BadRequestException('Cannot change document selection after issue');
    }

    const updated = await this.prisma.submittalItem.update({
      where: { id: itemId },
      data: {
        excludedEdvIds: item.excludedEdvIds.filter((id) => id !== edvId),
      },
      include: {
        designPackage: { select: SUBMITTAL_ITEM_PACKAGE_SELECT },
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
    if (submittal.issuedAt || submittal.status !== SubmittalStatus.DRAFT) {
      throw new BadRequestException(
        'Cannot add items unless the submittal is DRAFT',
      );
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
      this.assertSubmittalIssuable(submittal);
      const result = await this.workflowKernel.execute({
        type: 'IssueSubmittal',
        companyId: ctx.companyId,
        actorId: ctx.userId,
        submittalId,
        idempotencyKey: dto.idempotencyKey
          ? `${dto.idempotencyKey}:${submittalId}`
          : undefined,
      });
      if (result.siteReviewStarted && result.siteRepUserIds?.length) {
        await this.notifySiteRepsReviewRequested(
          ctx,
          projectId,
          submittalId,
          submittal.submittalNumber,
          result.siteRepUserIds,
        );
      }
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
    if (
      dto.status === SubmittalStatus.UNDER_SITE_REVIEW ||
      dto.status === SubmittalStatus.SITE_APPROVED ||
      dto.status === SubmittalStatus.PENDING_CONSULTANT_REVIEW ||
      dto.status === SubmittalStatus.CONSULTANT_REVIEWED ||
      dto.status === SubmittalStatus.WITHDRAWN
    ) {
      throw new BadRequestException(
        'Site review statuses must be set through the issue and site-review endpoints, not direct update.',
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

  private async listCompanySubmittals(
    ctx: PmContext,
    query: PmListQueryDto,
    defaultPurpose: SubmittalPurpose | { in: SubmittalPurpose[] },
  ): Promise<PaginatedResult<MappedSubmittal>> {
    const where = this.buildCompanyListWhere(ctx, query, defaultPurpose);
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
              designPackage: { select: SUBMITTAL_ITEM_PACKAGE_SELECT },
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
   * Construction lists treat null purpose as legacy in-construction rows.
   */
  private applySubmittalPurposeFilter(
    where: Prisma.SubmittalWhereInput,
    purpose: SubmittalPurpose | { in: SubmittalPurpose[] },
  ): void {
    const purposes =
      typeof purpose === 'object' && 'in' in purpose ? purpose.in : [purpose];

    if (purposes.includes(SubmittalPurpose.IN_CONSTRUCTION)) {
      const others = purposes.filter(
        (p) => p !== SubmittalPurpose.IN_CONSTRUCTION,
      );
      const purposeClause: Prisma.SubmittalWhereInput = {
        OR: [
          { submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION },
          { submittalPurpose: null },
          ...(others.length > 0
            ? [{ submittalPurpose: { in: others } }]
            : []),
        ],
      };
      const existingAnd = Array.isArray(where.AND)
        ? where.AND
        : where.AND
          ? [where.AND]
          : [];
      where.AND = [...existingAnd, purposeClause];
      return;
    }

    where.submittalPurpose =
      purposes.length === 1 ? purposes[0] : { in: purposes };
  }

  private buildCompanyListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
    defaultPurpose: SubmittalPurpose | { in: SubmittalPurpose[] },
  ): Prisma.SubmittalWhereInput {
    const projectWhere: Prisma.ProjectWhereInput = {
      ...activeOnly({ companyId: ctx.companyId }),
      ...(query.projectId ? { id: query.projectId } : {}),
    };

    const where: Prisma.SubmittalWhereInput = activeOnly({
      project: projectWhere,
    });

    if (query.submittalPurpose) {
      const purposes = query.submittalPurpose
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean) as SubmittalPurpose[];
      this.applySubmittalPurposeFilter(
        where,
        purposes.length === 1 ? purposes[0]! : { in: purposes },
      );
    } else {
      this.applySubmittalPurposeFilter(where, defaultPurpose);
    }

    const statusFilter = parseStatusFilter<SubmittalStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      const searchOr: Prisma.SubmittalWhereInput[] = [
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
      ];
      // Purpose filter may already set OR (null construction). Nest search under AND.
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: searchOr }];
    }

    return where;
  }

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.SubmittalWhereInput {
    const where: Prisma.SubmittalWhereInput = activeOnly({ projectId });

    const statusFilter = parseStatusFilter<SubmittalStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.submittalPurpose) {
      const purposes = query.submittalPurpose
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean) as SubmittalPurpose[];
      this.applySubmittalPurposeFilter(
        where,
        purposes.length === 1 ? purposes[0]! : { in: purposes },
      );
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      const searchOr: Prisma.SubmittalWhereInput[] = [
        { submittalNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
        { contractor: { contains: term, mode: 'insensitive' } },
      ];
      where.AND = [...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), { OR: searchOr }];
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

    const where: Prisma.SubmittalWhereInput = activeOnly({
      project: activeOnly({ companyId: ctx.companyId }),
      AND: [{ OR: relevanceOr }],
    });

    if (query.submittalPurpose) {
      const purposes = query.submittalPurpose
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean) as SubmittalPurpose[];
      this.applySubmittalPurposeFilter(
        where,
        purposes.length === 1 ? purposes[0]! : { in: purposes },
      );
    } else {
      this.applySubmittalPurposeFilter(
        where,
        SubmittalPurpose.IN_CONSTRUCTION,
      );
    }

    const statusFilter = parseStatusFilter<SubmittalStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      const searchOr: Prisma.SubmittalWhereInput[] = [
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
      ];
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { OR: searchOr },
      ];
    }

    return where;
  }

  private async getSubmittalOrThrow(projectId: string, submittalId: string) {
    const row = await this.prisma.submittal.findFirst({
      where: activeOnly({ id: submittalId, projectId }),
      include: {
        items: {
          include: {
            designPackage: {
              select: {
                siteRepType: true,
                siteRepName: true,
                siteRepresentativeUserId: true,
                consultantName: true,
              },
            },
          },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Submittal not found');
    }
    return row;
  }

  /**
   * ER-{overseas}-{discipline:02}-{subtask:03}-{seq:03} for site/consultant releases.
   */
  private async generateExternalReleaseNumber(
    companyId: string,
    designPackageId: string,
  ): Promise<string> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      select: {
        subtaskIndex: true,
        taskDiscipline: {
          select: {
            disciplineIndex: true,
            task: { select: { overseasTaskNumber: true } },
          },
        },
      },
    });
    if (!pkg) {
      throw new NotFoundException('Design package not found');
    }

    const fullCode = formatDesignPackageFullCode(
      pkg.taskDiscipline.task.overseasTaskNumber,
      pkg.taskDiscipline.disciplineIndex,
      pkg.subtaskIndex,
    );

    const existingCount = await this.prisma.submittal.count({
      where: {
        deletedAt: null,
        submittalPurpose: {
          in: [
            SubmittalPurpose.DISCIPLINE_SITE,
            SubmittalPurpose.DISCIPLINE_CONSULTANT,
          ],
        },
        project: { companyId, deletedAt: null },
        items: {
          some: { designPackageId },
        },
      },
    });

    const seq = String(existingCount + 1).padStart(3, '0');
    return `ER-${fullCode}-${seq}`;
  }

  /**
   * CS-{overseas}-{discipline:02}-{subtask:03}-{seq:03} for construction submittals.
   */
  private async generateConstructionSubmittalNumber(
    companyId: string,
    designPackageId: string,
  ): Promise<string> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: designPackageId, companyId }),
      select: {
        subtaskIndex: true,
        taskDiscipline: {
          select: {
            disciplineIndex: true,
            task: { select: { overseasTaskNumber: true } },
          },
        },
      },
    });
    if (!pkg) {
      throw new NotFoundException('Design package not found');
    }

    const fullCode = formatDesignPackageFullCode(
      pkg.taskDiscipline.task.overseasTaskNumber,
      pkg.taskDiscipline.disciplineIndex,
      pkg.subtaskIndex,
    );

    const existingCount = await this.prisma.submittal.count({
      where: {
        deletedAt: null,
        submittalPurpose: SubmittalPurpose.IN_CONSTRUCTION,
        project: { companyId, deletedAt: null },
        items: {
          some: { designPackageId },
        },
      },
    });

    const seq = String(existingCount + 1).padStart(3, '0');
    return `CS-${fullCode}-${seq}`;
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
        submittal: { select: { projectId: true, issuedAt: true, status: true } },
        designPackage: { select: SUBMITTAL_ITEM_PACKAGE_SELECT },
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

  private assertSubmittalIssuable(submittal: {
    status: SubmittalStatus;
    items: Array<{
      designPackage?: {
        siteRepType?: string | null;
        siteRepName?: string | null;
        siteRepresentativeUserId?: string | null;
        consultantName?: string | null;
      } | null;
    }>;
  }): void {
    const hasSiteRep = submittal.items.some(
      (item) =>
        Boolean(item.designPackage?.siteRepName?.trim()) ||
        Boolean(item.designPackage?.siteRepresentativeUserId),
    );
    const hasConsultant = submittal.items.some((item) =>
      Boolean(item.designPackage?.consultantName?.trim()),
    );
    const status = submittal.status;

    // DRAFT starts the external-review pipeline (or direct issue when no parties).
    if (status === SubmittalStatus.DRAFT) {
      return;
    }

    // No external parties → final issue only from DRAFT (handled above).
    if (!hasSiteRep && !hasConsultant) {
      throw new BadRequestException(
        'No external parties. Issue from DRAFT.',
      );
    }

    // Site rep only, no consultant → issue from SITE_APPROVED
    if (hasSiteRep && !hasConsultant) {
      if (status !== SubmittalStatus.SITE_APPROVED) {
        throw new BadRequestException(
          'Site representative must approve before issuing.',
        );
      }
      return;
    }

    // Consultant only or both → issue from CONSULTANT_REVIEWED
    if (status !== SubmittalStatus.CONSULTANT_REVIEWED) {
      throw new BadRequestException(
        hasConsultant && hasSiteRep
          ? 'Both site representative and consultant must approve before issuing.'
          : 'Consultant must approve before issuing.',
      );
    }
  }

  /**
   * Records site representative approval on behalf of an external/internal site rep.
   */
  async recordSiteApproval(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: RecordExternalApprovalDto,
  ): Promise<MappedSubmittal & {
    items: MappedSubmittalItem[];
    siteReviews: MappedSubmittalSiteReview[];
    externalApprovals: MappedSubmittalExternalApproval[];
    externalFeedback: MappedSubmittalExternalFeedback[];
    attachmentFolderId: string | null;
  }> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (submittal.status !== SubmittalStatus.UNDER_SITE_REVIEW) {
      throw new BadRequestException(
        'Site approval can only be recorded while UNDER_SITE_REVIEW',
      );
    }
    await this.assertCanRecordExternalResponse(ctx, projectId, submittalId);

    const parties = await this.loadExternalPartiesForSubmittal(
      ctx.companyId,
      submittalId,
    );
    const onBehalfOf =
      parties.siteRepNames[0] ??
      parties.siteRepInternalNames[0] ??
      'Site representative';
    const approvedByName = await this.resolveUserDisplayName(ctx);
    const folder = await this.engineeringDocumentFolderService.ensureSubmittalFolder(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
    );

    await this.prisma.submittalExternalApproval.create({
      data: {
        companyId: ctx.companyId,
        submittalId,
        approvalType: 'SITE',
        approvedByName,
        onBehalfOf,
        approvedAt: dto.approvedAt ? new Date(dto.approvedAt) : new Date(),
        notes: dto.notes?.trim() || null,
        evidenceFolderId: folder.id,
        createdBy: ctx.userId,
      },
    });

    const nextStatus = parties.hasConsultant
      ? SubmittalStatus.PENDING_CONSULTANT_REVIEW
      : SubmittalStatus.SITE_APPROVED;
    await this.prisma.submittal.update({
      where: { id: submittalId },
      data: { status: nextStatus, updatedBy: ctx.userId },
    });

    await this.notifyExternalApprovalRecorded(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
      submittal.submittedBy,
      submittal.taskDisciplineId,
      EXTERNAL_SITE_APPROVAL_EVENT,
      `Site approval recorded for ER ${submittal.submittalNumber}.`,
    );

    return this.getSubmittal(ctx, projectId, submittalId);
  }

  /**
   * Records consultant approval on behalf of the client consultant.
   */
  async recordConsultantApproval(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: RecordExternalApprovalDto,
  ): Promise<MappedSubmittal & {
    items: MappedSubmittalItem[];
    siteReviews: MappedSubmittalSiteReview[];
    externalApprovals: MappedSubmittalExternalApproval[];
    externalFeedback: MappedSubmittalExternalFeedback[];
    attachmentFolderId: string | null;
  }> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (submittal.status !== SubmittalStatus.PENDING_CONSULTANT_REVIEW) {
      throw new BadRequestException(
        'Consultant approval can only be recorded while PENDING_CONSULTANT_REVIEW',
      );
    }
    await this.assertCanRecordExternalResponse(ctx, projectId, submittalId);

    const parties = await this.loadExternalPartiesForSubmittal(
      ctx.companyId,
      submittalId,
    );
    const onBehalfOf = parties.consultantNames[0] ?? 'Consultant';
    const approvedByName = await this.resolveUserDisplayName(ctx);
    const folder = await this.engineeringDocumentFolderService.ensureSubmittalFolder(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
    );

    await this.prisma.submittalExternalApproval.create({
      data: {
        companyId: ctx.companyId,
        submittalId,
        approvalType: 'CONSULTANT',
        approvedByName,
        onBehalfOf,
        approvedAt: dto.approvedAt ? new Date(dto.approvedAt) : new Date(),
        notes: dto.notes?.trim() || null,
        evidenceFolderId: folder.id,
        createdBy: ctx.userId,
      },
    });

    await this.prisma.submittal.update({
      where: { id: submittalId },
      data: {
        status: SubmittalStatus.CONSULTANT_REVIEWED,
        updatedBy: ctx.userId,
      },
    });

    await this.notifyExternalApprovalRecorded(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
      submittal.submittedBy,
      submittal.taskDisciplineId,
      EXTERNAL_CONSULTANT_APPROVAL_EVENT,
      `Consultant approval recorded. ER ${submittal.submittalNumber} is ready to issue.`,
    );

    return this.getSubmittal(ctx, projectId, submittalId);
  }

  /**
   * Records site feedback (comment or rejection). Rejection returns ER to DRAFT.
   */
  async recordSiteFeedback(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: RecordExternalFeedbackDto,
  ): Promise<MappedSubmittal & {
    items: MappedSubmittalItem[];
    siteReviews: MappedSubmittalSiteReview[];
    externalApprovals: MappedSubmittalExternalApproval[];
    externalFeedback: MappedSubmittalExternalFeedback[];
    attachmentFolderId: string | null;
  }> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (submittal.status !== SubmittalStatus.UNDER_SITE_REVIEW) {
      throw new BadRequestException(
        'Site feedback can only be recorded while UNDER_SITE_REVIEW',
      );
    }
    await this.assertCanRecordExternalResponse(ctx, projectId, submittalId);

    const comment = dto.comment.trim();
    if (!comment) {
      throw new BadRequestException('Comment is required');
    }

    const folder = await this.engineeringDocumentFolderService.ensureSubmittalFolder(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
    );

    await this.prisma.submittalExternalFeedback.create({
      data: {
        companyId: ctx.companyId,
        submittalId,
        feedbackFrom: 'SITE',
        feedbackKind: dto.kind,
        comment,
        evidenceFolderId: folder.id,
        createdBy: ctx.userId,
      },
    });

    if (dto.kind === 'REJECTION') {
      await this.prisma.submittal.update({
        where: { id: submittalId },
        data: { status: SubmittalStatus.DRAFT, updatedBy: ctx.userId },
      });
    }

    await this.notifyExternalApprovalRecorded(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
      submittal.submittedBy,
      submittal.taskDisciplineId,
      EXTERNAL_FEEDBACK_EVENT,
      `Site feedback recorded on ER ${submittal.submittalNumber}.`,
    );

    return this.getSubmittal(ctx, projectId, submittalId);
  }

  /**
   * Records consultant feedback. Rejection returns ER to DRAFT.
   */
  async recordConsultantFeedback(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: RecordExternalFeedbackDto,
  ): Promise<MappedSubmittal & {
    items: MappedSubmittalItem[];
    siteReviews: MappedSubmittalSiteReview[];
    externalApprovals: MappedSubmittalExternalApproval[];
    externalFeedback: MappedSubmittalExternalFeedback[];
    attachmentFolderId: string | null;
  }> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (submittal.status !== SubmittalStatus.PENDING_CONSULTANT_REVIEW) {
      throw new BadRequestException(
        'Consultant feedback can only be recorded while PENDING_CONSULTANT_REVIEW',
      );
    }
    await this.assertCanRecordExternalResponse(ctx, projectId, submittalId);

    const comment = dto.comment.trim();
    if (!comment) {
      throw new BadRequestException('Comment is required');
    }

    const folder = await this.engineeringDocumentFolderService.ensureSubmittalFolder(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
    );

    await this.prisma.submittalExternalFeedback.create({
      data: {
        companyId: ctx.companyId,
        submittalId,
        feedbackFrom: 'CONSULTANT',
        feedbackKind: dto.kind,
        comment,
        evidenceFolderId: folder.id,
        createdBy: ctx.userId,
      },
    });

    if (dto.kind === 'REJECTION') {
      await this.prisma.submittal.update({
        where: { id: submittalId },
        data: { status: SubmittalStatus.DRAFT, updatedBy: ctx.userId },
      });
    }

    await this.notifyExternalApprovalRecorded(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
      submittal.submittedBy,
      submittal.taskDisciplineId,
      EXTERNAL_FEEDBACK_EVENT,
      `Consultant feedback recorded on ER ${submittal.submittalNumber}.`,
    );

    return this.getSubmittal(ctx, projectId, submittalId);
  }

  /**
   * Withdraws an ER that has not yet been issued externally.
   */
  async withdrawSubmittal(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    dto: WithdrawSubmittalDto,
  ): Promise<MappedSubmittal & {
    items: MappedSubmittalItem[];
    siteReviews: MappedSubmittalSiteReview[];
    externalApprovals: MappedSubmittalExternalApproval[];
    externalFeedback: MappedSubmittalExternalFeedback[];
    attachmentFolderId: string | null;
  }> {
    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (
      submittal.status === SubmittalStatus.SUBMITTED ||
      submittal.status === SubmittalStatus.WITHDRAWN
    ) {
      throw new BadRequestException(
        'Submitted or already withdrawn releases cannot be withdrawn',
      );
    }
    await this.assertCanRecordExternalResponse(ctx, projectId, submittalId);

    const reason = dto.reason?.trim();
    if (reason) {
      await this.prisma.submittalExternalFeedback.create({
        data: {
          companyId: ctx.companyId,
          submittalId,
          feedbackFrom: 'WITHDRAW',
          feedbackKind: 'COMMENT',
          comment: reason,
          createdBy: ctx.userId,
        },
      });
    }

    await this.prisma.submittal.update({
      where: { id: submittalId },
      data: { status: SubmittalStatus.WITHDRAWN, updatedBy: ctx.userId },
    });

    await this.notifyExternalApprovalRecorded(
      ctx,
      projectId,
      submittalId,
      submittal.submittalNumber,
      submittal.submittedBy,
      submittal.taskDisciplineId,
      EXTERNAL_WITHDRAWN_EVENT,
      `External release ${submittal.submittalNumber} was withdrawn.`,
    );

    return this.getSubmittal(ctx, projectId, submittalId);
  }

  private async getSiteReviewOrThrow(
    companyId: string,
    submittalId: string,
    reviewId: string,
  ) {
    const review = await this.prisma.submittalSiteReview.findFirst({
      where: { id: reviewId, companyId, submittalId },
    });
    if (!review) {
      throw new NotFoundException('Site review not found');
    }
    return review;
  }

  private async isDisciplineLead(
    ctx: PmContext,
    taskDisciplineId: string,
  ): Promise<boolean> {
    const disc = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        id: taskDisciplineId,
        companyId: ctx.companyId,
        disciplineLeadUserId: ctx.userId,
      }),
      select: { id: true },
    });
    return Boolean(disc);
  }

  private async assertCanRecordExternalResponse(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (hasFullProjectDataAccess(roleNames)) {
      return;
    }

    const submittal = await this.getSubmittalOrThrow(projectId, submittalId);
    if (
      submittal.taskDisciplineId &&
      (await this.isDisciplineLead(ctx, submittal.taskDisciplineId))
    ) {
      return;
    }

    const designerItem = await this.prisma.submittalItem.findFirst({
      where: {
        submittalId,
        companyId: ctx.companyId,
        designPackage: {
          designerUserId: ctx.userId,
          deletedAt: null,
        },
      },
      select: { id: true },
    });
    if (designerItem) {
      return;
    }

    throw new ForbiddenException(
      'Only the discipline lead, designer, or a project admin may record external responses',
    );
  }

  private async loadExternalPartiesForSubmittal(
    companyId: string,
    submittalId: string,
  ): Promise<{
    hasConsultant: boolean;
    siteRepNames: string[];
    siteRepInternalNames: string[];
    consultantNames: string[];
  }> {
    const items = await this.prisma.submittalItem.findMany({
      where: { companyId, submittalId },
      include: {
        designPackage: {
          select: {
            siteRepType: true,
            siteRepName: true,
            siteRepresentativeUserId: true,
            consultantName: true,
            siteRepresentative: {
              select: {
                firstName: true,
                lastName: true,
                chineseName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    const siteRepNames: string[] = [];
    const siteRepInternalNames: string[] = [];
    const consultantNames: string[] = [];
    let hasConsultant = false;

    for (const item of items) {
      const pkg = item.designPackage;
      if (!pkg) {
        continue;
      }
      if (pkg.siteRepName?.trim()) {
        siteRepNames.push(pkg.siteRepName.trim());
      }
      if (pkg.siteRepresentative) {
        siteRepInternalNames.push(formatUserDisplayName(pkg.siteRepresentative));
      }
      if (pkg.consultantName?.trim()) {
        hasConsultant = true;
        consultantNames.push(pkg.consultantName.trim());
      }
    }

    return {
      hasConsultant,
      siteRepNames: [...new Set(siteRepNames)],
      siteRepInternalNames: [...new Set(siteRepInternalNames)],
      consultantNames: [...new Set(consultantNames)],
    };
  }

  private async submittalHasConsultant(
    companyId: string,
    submittalId: string,
  ): Promise<boolean> {
    const parties = await this.loadExternalPartiesForSubmittal(
      companyId,
      submittalId,
    );
    return parties.hasConsultant;
  }

  private async resolveUserDisplayName(ctx: PmContext): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id: ctx.userId, companyId: ctx.companyId },
      select: {
        firstName: true,
        lastName: true,
        chineseName: true,
        email: true,
      },
    });
    return user ? formatUserDisplayName(user) : ctx.userId;
  }

  private async notifyExternalApprovalRecorded(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    submittalNumber: string,
    submittedBy: string,
    taskDisciplineId: string | null,
    eventType: string,
    body: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }
    const recipients = new Set<string>([submittedBy]);
    if (taskDisciplineId) {
      const disc = await this.prisma.taskDiscipline.findFirst({
        where: activeOnly({ id: taskDisciplineId, companyId: ctx.companyId }),
        select: { disciplineLeadUserId: true },
      });
      if (disc?.disciplineLeadUserId) {
        recipients.add(disc.disciplineLeadUserId);
      }
    }
    recipients.delete(ctx.userId);
    for (const recipientId of recipients) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType,
            subject: `ER ${submittalNumber}`,
            body,
            variables: {
              projectId,
              submittalId,
              submittalNumber,
              link: `/projects/${projectId}/submittals`,
            },
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'External approval notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async enrichSiteReviews(
    companyId: string,
    reviews: MappedSubmittalSiteReview[],
  ): Promise<MappedSubmittalSiteReview[]> {
    if (reviews.length === 0) {
      return [];
    }
    const userIds = [...new Set(reviews.map((r) => r.siteRepUserId))];
    const users = await this.prisma.user.findMany({
      where: { companyId, id: { in: userIds } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        chineseName: true,
        email: true,
      },
    });
    const byId = new Map(
      users.map((user) => [user.id, formatUserDisplayName(user)]),
    );
    return reviews.map((review) => ({
      ...review,
      siteRepUserName: byId.get(review.siteRepUserId) ?? null,
    }));
  }

  private async notifySiteRepsReviewRequested(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    submittalNumber: string,
    siteRepUserIds: readonly string[],
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }
    const link = `/projects/${projectId}/submittals`;
    for (const recipientId of siteRepUserIds) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType: SITE_REVIEW_REQUESTED_EVENT,
            subject: `Site review required - ${submittalNumber}`,
            body: `External release ${submittalNumber} is waiting for your site review before it can be issued.`,
            variables: { projectId, submittalId, submittalNumber, link },
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'Site review requested notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async notifyCreatorSiteRepApproved(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    submittalNumber: string,
    submittedBy: string,
  ): Promise<void> {
    if (!this.notificationService || submittedBy === ctx.userId) {
      return;
    }
    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: submittedBy,
          eventType: SITE_REVIEW_APPROVED_EVENT,
          subject: `Site review approved - ${submittalNumber}`,
          body: `A site representative approved their review on ${submittalNumber}. Waiting for remaining approvals.`,
          variables: {
            projectId,
            submittalId,
            submittalNumber,
            link: `/projects/${projectId}/submittals`,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Site review approved notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async notifySiteReviewComplete(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    submittalNumber: string,
    submittedBy: string,
    taskDisciplineId: string | null,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }
    const recipients = new Set<string>([submittedBy]);
    if (taskDisciplineId) {
      const disc = await this.prisma.taskDiscipline.findFirst({
        where: activeOnly({ id: taskDisciplineId, companyId: ctx.companyId }),
        select: { disciplineLeadUserId: true },
      });
      if (disc?.disciplineLeadUserId) {
        recipients.add(disc.disciplineLeadUserId);
      }
    }
    recipients.delete(ctx.userId);
    for (const recipientId of recipients) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType: SITE_REVIEW_ALL_APPROVED_EVENT,
            subject: `Site review complete - ${submittalNumber}`,
            body: `All site representatives approved ${submittalNumber}. You can now issue the release.`,
            variables: {
              projectId,
              submittalId,
              submittalNumber,
              link: `/projects/${projectId}/submittals`,
            },
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'Site review complete notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async notifyCreatorSiteRepCommented(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    submittalNumber: string,
    submittedBy: string,
    taskDisciplineId: string | null,
    comment: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }
    const recipients = new Set<string>([submittedBy]);
    if (taskDisciplineId) {
      const disc = await this.prisma.taskDiscipline.findFirst({
        where: activeOnly({ id: taskDisciplineId, companyId: ctx.companyId }),
        select: { disciplineLeadUserId: true },
      });
      if (disc?.disciplineLeadUserId) {
        recipients.add(disc.disciplineLeadUserId);
      }
    }
    recipients.delete(ctx.userId);
    for (const recipientId of recipients) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType: SITE_REVIEW_COMMENTED_EVENT,
            subject: `Site review comment - ${submittalNumber}`,
            body: `A site representative commented on ${submittalNumber}: ${comment}`,
            variables: {
              projectId,
              submittalId,
              submittalNumber,
              link: `/projects/${projectId}/submittals`,
            },
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'Site review commented notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async notifySiteRepRerequested(
    ctx: PmContext,
    projectId: string,
    submittalId: string,
    submittalNumber: string,
    siteRepUserId: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }
    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: siteRepUserId,
          eventType: SITE_REVIEW_REREQUESTED_EVENT,
          subject: `Re-review requested - ${submittalNumber}`,
          body: `Please re-review external release ${submittalNumber} after the latest changes.`,
          variables: {
            projectId,
            submittalId,
            submittalNumber,
            link: `/projects/${projectId}/submittals`,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Site review re-request notification failed',
        error instanceof Error ? error.message : String(error),
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
