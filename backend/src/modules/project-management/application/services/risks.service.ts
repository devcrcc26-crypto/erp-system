import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, Risk, RiskStatus } from '@prisma/client';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateRiskDto,
  CreateRiskMitigationDto,
  PmListQueryDto,
  RiskStatusActionDto,
  UpdateRiskDto,
  UpdateRiskMitigationDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapRisk,
  mapRiskMitigation,
  mapRiskReview,
  MappedRisk,
  MappedRiskDetail,
  MappedRiskReview,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import { enrichRowsWithUserDisplayNames, enrichWithUserDisplayNames } from '../utils/pm-user-names.util';
import { PM_REVIEWED_BY_NAME, PM_RISK_USER_NAMES } from '../utils/pm-user-name-fields.const';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';
import { NotificationService } from '../../../notifications/application/services/notification.service';

const RISK_ASSIGNED_EVENT = 'risk.assigned';
const RISK_STATUS_CHANGED_EVENT = 'risk.status_changed';

export interface RiskProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

export type MappedMyRisk = MappedRisk & {
  projectName: string;
  projectCode: string;
};

const RISK_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'title',
  'riskIdCode',
  'riskScore',
  'status',
  'reviewDate',
]);

/**
 * Allowed status transitions. OPEN → MITIGATED is auto-only via addMitigation;
 * callers must not set MITIGATED through updateRisk / accept / close / reopen.
 */
const RISK_STATUS_TRANSITIONS: Record<string, RiskStatus[]> = {
  OPEN: [RiskStatus.MITIGATED, RiskStatus.ACCEPTED],
  MITIGATED: [RiskStatus.CLOSED, RiskStatus.OPEN],
  ACCEPTED: [RiskStatus.CLOSED, RiskStatus.OPEN],
  CLOSED: [RiskStatus.OPEN],
  MONITORING: [RiskStatus.OPEN, RiskStatus.CLOSED],
};

@Injectable()
export class RisksService {
  private readonly logger = new Logger(RisksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly permissionService: PermissionService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  /**
   * Returns a paginated list of risks for a project, scoped to what the
   * current user is allowed to see (full access / RBAC view / discipline
   * lead see everything; everyone else only their own owned/created risks).
   */
  async listRisks(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedRisk>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = await this.buildListWhere(ctx, projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      RISK_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.risk.findMany({ where, skip, take, orderBy }),
      this.prisma.risk.count({ where }),
    ]);

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map((row) => mapRisk(row)),
      PM_RISK_USER_NAMES,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Risks relevant to the current user across projects: owner, creator, or
   * discipline lead on any discipline in the risk's project.
   */
  async listMyRisks(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyRisk>> {
    const where = this.buildMyRiskListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(query.sortBy, query.sortOrder, RISK_SORT_FIELDS);

    const [rows, total] = await Promise.all([
      this.prisma.risk.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { project: { select: { id: true, name: true, projectCode: true } } },
      }),
      this.prisma.risk.count({ where }),
    ]);

    const data = await this.mapMyRiskRows(ctx, rows);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-wide risks (portfolio / admin users).
   */
  async listAllRisks(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyRisk>> {
    // Risk has no direct companyId column - scope via the owning project.
    const where: Prisma.RiskWhereInput = activeOnly({
      project: activeOnly({ companyId: ctx.companyId }),
    });
    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.status) {
      const statusFilter = parseStatusFilter<RiskStatus>(query.status);
      if (statusFilter) {
        where.status = statusFilter;
      }
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { riskIdCode: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(query.sortBy, query.sortOrder, RISK_SORT_FIELDS);

    const [rows, total] = await Promise.all([
      this.prisma.risk.findMany({
        where,
        skip,
        take,
        orderBy,
        include: { project: { select: { id: true, name: true, projectCode: true } } },
      }),
      this.prisma.risk.count({ where }),
    ]);

    const data = await this.mapMyRiskRows(ctx, rows);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Distinct projects with risks relevant to the current user.
   */
  async listMyRiskProjects(ctx: PmContext): Promise<RiskProjectOption[]> {
    const where = this.buildMyRiskListWhere(ctx, {});
    const rows = await this.prisma.risk.findMany({
      where,
      select: { project: { select: { id: true, projectCode: true, name: true } } },
    });

    const byId = new Map<string, RiskProjectOption>();
    for (const row of rows) {
      if (!byId.has(row.project.id)) {
        byId.set(row.project.id, {
          id: row.project.id,
          projectCode: row.project.projectCode,
          name: row.project.name,
        });
      }
    }

    return [...byId.values()].sort((a, b) => a.projectCode.localeCompare(b.projectCode));
  }

  /**
   * Returns a single risk (with its review history) by id scoped to a project.
   */
  async getRisk(
    ctx: PmContext,
    projectId: string,
    riskId: string,
  ): Promise<MappedRiskDetail> {
    const row = await this.getRiskOrThrow(projectId, riskId);
    await this.assertCanAccessRisk(ctx, row, 'view');
    return this.enrichRiskDetail(ctx, projectId, row);
  }

  /**
   * Creates a risk with a computed inherent risk score and a project-scoped
   * sequential risk number (RSK-{projectCode}-{seq}).
   */
  async createRisk(
    ctx: PmContext,
    projectId: string,
    dto: CreateRiskDto,
  ): Promise<MappedRisk> {
    const project = await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.assertCanCreateRisk(ctx, projectId, dto.ownerId);
    await this.assertUserInCompany(ctx, dto.ownerId);

    const count = await this.prisma.risk.count({
      where: { projectId, deletedAt: null },
    });
    const seq = String(count + 1).padStart(3, '0');
    const riskIdCode = `RSK-${project.projectCode}-${seq}`;

    const row = await this.prisma.risk.create({
      data: {
        projectId,
        ownerId: dto.ownerId,
        riskIdCode,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        probability: dto.probability,
        impact: dto.impact,
        riskScore: this.calculateScore(dto.probability, dto.impact),
        mitigationPlan: dto.mitigationPlan,
        contingencyPlan: dto.contingencyPlan,
        reviewDate: parseOptionalDate(dto.reviewDate),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await this.sendRiskAssignedNotification(ctx, row);

    return this.enrichRisk(ctx, projectId, row);
  }

  /**
   * Updates an existing risk scoped to a project. Recomputes the inherent and
   * residual scores when their inputs change, applies the residual-driven
   * MITIGATED/OPEN auto-transition, validates manual status transitions, logs
   * a RiskReview entry when any tracked field changes, and notifies the owner
   * and creator on a status change.
   */
  async updateRisk(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    dto: UpdateRiskDto,
  ): Promise<MappedRisk> {
    const existing = await this.getRiskOrThrow(projectId, riskId);
    await this.assertCanAccessRisk(ctx, existing, 'edit');

    if (dto.ownerId) {
      await this.assertUserInCompany(ctx, dto.ownerId);
    }

    const probability = dto.probability ?? existing.probability;
    const impact = dto.impact ?? existing.impact;
    const riskScore = this.calculateScore(probability, impact);

    let residualLikelihood = existing.residualLikelihood;
    let residualImpact = existing.residualImpact;
    let residualScore = existing.residualScore;
    if (dto.clearResidual) {
      residualLikelihood = null;
      residualImpact = null;
      residualScore = null;
    } else if (dto.residualLikelihood !== undefined || dto.residualImpact !== undefined) {
      residualLikelihood = dto.residualLikelihood ?? existing.residualLikelihood ?? null;
      residualImpact = dto.residualImpact ?? existing.residualImpact ?? null;
      residualScore =
        residualLikelihood != null && residualImpact != null
          ? this.calculateScore(residualLikelihood, residualImpact)
          : null;
    }

    const status = this.resolveStatus(existing, dto, residualLikelihood, residualImpact);

    const row = await this.prisma.risk.update({
      where: { id: riskId },
      data: {
        ownerId: dto.ownerId,
        riskIdCode: dto.riskIdCode,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        probability: dto.probability,
        impact: dto.impact,
        riskScore,
        mitigationPlan: dto.mitigationPlan,
        contingencyPlan: dto.contingencyPlan,
        reviewDate: parseOptionalDate(dto.reviewDate),
        status,
        residualLikelihood,
        residualImpact,
        residualScore,
        updatedBy: ctx.userId,
      },
    });

    await this.recordReviewIfChanged(ctx, existing, row, dto.reviewNotes);

    if (row.status !== existing.status) {
      await this.sendRiskStatusChangedNotification(ctx, row, existing.status);
    }

    return this.enrichRisk(ctx, projectId, row);
  }

  /**
   * Adds a mitigation attempt and syncs the risk residual fields to the
   * lowest residual-score attempt (best mitigation). Auto-transitions OPEN → MITIGATED.
   */
  async addMitigation(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    dto: CreateRiskMitigationDto,
  ): Promise<MappedRiskDetail> {
    const existing = await this.getRiskOrThrow(projectId, riskId);
    await this.assertCanAccessRisk(ctx, existing, 'edit');

    if (
      existing.status !== RiskStatus.OPEN &&
      existing.status !== RiskStatus.MITIGATED
    ) {
      throw new BadRequestException(
        `Cannot add mitigation while risk status is ${existing.status}`,
      );
    }

    const residualScore = this.calculateScore(
      dto.residualLikelihood,
      dto.residualImpact,
    );

    const maxAttempt = await this.prisma.riskMitigation.aggregate({
      where: { riskId },
      _max: { attemptNumber: true },
    });
    const attemptNumber = (maxAttempt._max.attemptNumber ?? 0) + 1;

    await this.prisma.riskMitigation.create({
      data: {
        riskId,
        attemptNumber,
        mitigationStrategy: dto.mitigationStrategy.trim(),
        residualLikelihood: dto.residualLikelihood,
        residualImpact: dto.residualImpact,
        residualScore,
        notes: dto.notes?.trim() || null,
        assessedBy: ctx.userId,
      },
    });

    await this.syncRiskFromBestMitigation(ctx, existing, dto.notes?.trim());

    return this.getRisk(ctx, projectId, riskId);
  }

  /**
   * Accepts an OPEN risk without further mitigation (OPEN → ACCEPTED).
   */
  async acceptRisk(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    dto: RiskStatusActionDto,
  ): Promise<MappedRisk> {
    return this.transitionRiskStatus(
      ctx,
      projectId,
      riskId,
      RiskStatus.ACCEPTED,
      [RiskStatus.OPEN],
      dto.notes,
    );
  }

  /**
   * Closes a MITIGATED or ACCEPTED risk (→ CLOSED).
   */
  async closeRisk(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    dto: RiskStatusActionDto,
  ): Promise<MappedRisk> {
    return this.transitionRiskStatus(
      ctx,
      projectId,
      riskId,
      RiskStatus.CLOSED,
      [RiskStatus.MITIGATED, RiskStatus.ACCEPTED],
      dto.notes,
    );
  }

  /**
   * Reopens a MITIGATED, ACCEPTED, or CLOSED risk to OPEN and clears residual fields.
   */
  async reopenRisk(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    dto: RiskStatusActionDto,
  ): Promise<MappedRisk> {
    const existing = await this.getRiskOrThrow(projectId, riskId);
    await this.assertCanAccessRisk(ctx, existing, 'edit');

    const allowedFrom: RiskStatus[] = [
      RiskStatus.MITIGATED,
      RiskStatus.ACCEPTED,
      RiskStatus.CLOSED,
    ];
    if (!allowedFrom.includes(existing.status)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${RiskStatus.OPEN}`,
      );
    }

    const notes = dto.notes?.trim();
    if (!notes) {
      throw new BadRequestException('Notes are required when reopening a risk');
    }

    const row = await this.prisma.risk.update({
      where: { id: riskId },
      data: {
        status: RiskStatus.OPEN,
        residualLikelihood: null,
        residualImpact: null,
        residualScore: null,
        updatedBy: ctx.userId,
      },
    });

    await this.recordReviewIfChanged(ctx, existing, row, notes);
    await this.sendRiskStatusChangedNotification(ctx, row, existing.status);

    return this.enrichRisk(ctx, projectId, row);
  }

  /**
   * Updates an existing mitigation attempt and re-syncs the risk to the best score.
   */
  async updateMitigation(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    mitigationId: string,
    dto: UpdateRiskMitigationDto,
  ): Promise<MappedRiskDetail> {
    const existing = await this.getRiskOrThrow(projectId, riskId);
    await this.assertCanAccessRisk(ctx, existing, 'edit');

    const mitigation = await this.prisma.riskMitigation.findFirst({
      where: { id: mitigationId, riskId },
    });
    if (!mitigation) {
      throw new NotFoundException('Mitigation attempt not found');
    }

    const residualLikelihood =
      dto.residualLikelihood ?? mitigation.residualLikelihood;
    const residualImpact = dto.residualImpact ?? mitigation.residualImpact;
    const residualScore = this.calculateScore(residualLikelihood, residualImpact);

    await this.prisma.riskMitigation.update({
      where: { id: mitigationId },
      data: {
        mitigationStrategy:
          dto.mitigationStrategy !== undefined
            ? dto.mitigationStrategy.trim()
            : undefined,
        residualLikelihood:
          dto.residualLikelihood !== undefined ? dto.residualLikelihood : undefined,
        residualImpact:
          dto.residualImpact !== undefined ? dto.residualImpact : undefined,
        residualScore:
          dto.residualLikelihood !== undefined || dto.residualImpact !== undefined
            ? residualScore
            : undefined,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
      },
    });

    await this.syncRiskFromBestMitigation(ctx, existing, dto.notes?.trim());

    return this.getRisk(ctx, projectId, riskId);
  }

  /**
   * Soft-deletes a risk scoped to a project.
   */
  async deleteRisk(
    ctx: PmContext,
    projectId: string,
    riskId: string,
  ): Promise<void> {
    await this.getRiskOrThrow(projectId, riskId);
    await this.prisma.risk.update({
      where: { id: riskId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private calculateScore(likelihood: number, impact: number): number {
    return likelihood * impact;
  }

  /**
   * Resolves the risk's next status: an explicit, validated manual
   * transition takes priority. MITIGATED cannot be set manually.
   * OPEN → MITIGATED is applied only by addMitigation.
   */
  private resolveStatus(
    existing: Risk,
    dto: UpdateRiskDto,
    residualLikelihood: number | null,
    residualImpact: number | null,
  ): RiskStatus {
    if (dto.status && dto.status !== existing.status) {
      if (dto.status === RiskStatus.MITIGATED) {
        throw new BadRequestException(
          'MITIGATED is set automatically when a mitigation attempt is recorded, not selected manually',
        );
      }
      const allowed = RISK_STATUS_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Cannot transition from ${existing.status} to ${dto.status}`,
        );
      }
      return dto.status;
    }

    const residualWasSet =
      existing.residualLikelihood != null && existing.residualImpact != null;
    const residualNowSet =
      residualLikelihood != null && residualImpact != null;

    if (
      !residualWasSet &&
      residualNowSet &&
      existing.status === RiskStatus.OPEN
    ) {
      return RiskStatus.MITIGATED;
    }
    if (
      residualWasSet &&
      !residualNowSet &&
      existing.status === RiskStatus.MITIGATED
    ) {
      return RiskStatus.OPEN;
    }

    return existing.status;
  }

  /**
   * Shared status transition for accept / close actions.
   */
  private async transitionRiskStatus(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    targetStatus: RiskStatus,
    allowedFrom: RiskStatus[],
    notes?: string,
  ): Promise<MappedRisk> {
    const existing = await this.getRiskOrThrow(projectId, riskId);
    await this.assertCanAccessRisk(ctx, existing, 'edit');

    if (!allowedFrom.includes(existing.status)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${targetStatus}`,
      );
    }

    const allowed = RISK_STATUS_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(targetStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${existing.status} to ${targetStatus}`,
      );
    }

    const row = await this.prisma.risk.update({
      where: { id: riskId },
      data: {
        status: targetStatus,
        updatedBy: ctx.userId,
      },
    });

    await this.recordReviewIfChanged(ctx, existing, row, notes?.trim());
    await this.sendRiskStatusChangedNotification(ctx, row, existing.status);

    return this.enrichRisk(ctx, projectId, row);
  }

  private async recordReviewIfChanged(
    ctx: PmContext,
    existing: Risk,
    updated: Risk,
    notes: string | undefined,
  ): Promise<void> {
    const trackedFieldsChanged =
      existing.status !== updated.status ||
      existing.probability !== updated.probability ||
      existing.impact !== updated.impact ||
      existing.riskScore !== updated.riskScore ||
      existing.residualLikelihood !== updated.residualLikelihood ||
      existing.residualImpact !== updated.residualImpact ||
      existing.residualScore !== updated.residualScore ||
      existing.mitigationPlan !== updated.mitigationPlan;

    if (!trackedFieldsChanged) {
      return;
    }

    await this.prisma.riskReview.create({
      data: {
        riskId: updated.id,
        reviewedBy: ctx.userId,
        previousStatus: existing.status,
        newStatus: updated.status,
        previousScore: existing.riskScore,
        newScore: updated.riskScore,
        previousResidualScore: existing.residualScore,
        newResidualScore: updated.residualScore,
        notes: notes ?? null,
      },
    });
  }

  private async enrichRisk(
    ctx: PmContext,
    projectId: string,
    row: Risk,
  ): Promise<MappedRisk> {
    let attachmentFolderId: string | null = null;

    try {
      const folder =
        await this.engineeringDocumentFolderService.ensureRiskFolder(
          ctx,
          projectId,
          row.id,
          row.riskIdCode,
        );
      attachmentFolderId = folder.id;
    } catch (error) {
      this.logger.warn(
        `Failed to ensure risk folder for ${row.id}: ${String(error)}`,
      );
    }

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapRisk(row, attachmentFolderId),
      PM_RISK_USER_NAMES,
    );
  }

  private async enrichRiskDetail(
    ctx: PmContext,
    projectId: string,
    row: Risk,
  ): Promise<MappedRiskDetail> {
    const base = await this.enrichRisk(ctx, projectId, row);

    const [reviewRows, mitigationRows] = await Promise.all([
      this.prisma.riskReview.findMany({
        where: { riskId: row.id },
        orderBy: { reviewedAt: 'desc' },
      }),
      this.prisma.riskMitigation.findMany({
        where: { riskId: row.id },
        orderBy: [{ residualScore: 'asc' }, { attemptNumber: 'asc' }],
        include: {
          assessor: { select: { firstName: true, lastName: true } },
        },
      }),
    ]);

    const reviews: MappedRiskReview[] = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      reviewRows.map(mapRiskReview),
      PM_REVIEWED_BY_NAME,
    );

    return {
      ...base,
      reviews,
      mitigations: mitigationRows.map(mapRiskMitigation),
    };
  }

  /**
   * Sets the risk residual fields from the lowest-scoring mitigation attempt
   * and records a review log entry when values change. Auto-sets MITIGATED
   * when the risk is still OPEN.
   */
  private async syncRiskFromBestMitigation(
    ctx: PmContext,
    existing: Risk,
    notes?: string,
  ): Promise<Risk> {
    const best = await this.prisma.riskMitigation.findFirst({
      where: { riskId: existing.id },
      orderBy: [{ residualScore: 'asc' }, { attemptNumber: 'asc' }],
    });

    if (!best) {
      return existing;
    }

    const nextStatus =
      existing.status === RiskStatus.OPEN
        ? RiskStatus.MITIGATED
        : existing.status;

    const updated = await this.prisma.risk.update({
      where: { id: existing.id },
      data: {
        residualLikelihood: best.residualLikelihood,
        residualImpact: best.residualImpact,
        residualScore: best.residualScore,
        mitigationPlan: best.mitigationStrategy,
        status: nextStatus,
        updatedBy: ctx.userId,
      },
    });

    await this.recordReviewIfChanged(
      ctx,
      existing,
      updated,
      notes ||
        `Mitigation attempt recorded (score ${best.residualScore})`,
    );

    if (updated.status !== existing.status) {
      await this.sendRiskStatusChangedNotification(ctx, updated, existing.status);
    }

    return updated;
  }

  private async mapMyRiskRows(
    ctx: PmContext,
    rows: (Risk & { project: { id: string; name: string; projectCode: string } })[],
  ): Promise<MappedMyRisk[]> {
    return Promise.all(
      rows.map(async (row) => {
        const enriched = await this.enrichRisk(ctx, row.projectId, row);
        return {
          ...enriched,
          projectName: row.project.name,
          projectCode: row.project.projectCode,
        };
      }),
    );
  }

  /**
   * Cross-project visibility for "my risks": owned, created, or in a project
   * where the user leads any discipline.
   */
  private buildMyRiskListWhere(
    ctx: PmContext,
    query: Partial<PmListQueryDto>,
  ): Prisma.RiskWhereInput {
    const where: Prisma.RiskWhereInput = activeOnly({
      project: activeOnly({ companyId: ctx.companyId }),
      OR: [
        { ownerId: ctx.userId },
        { createdBy: ctx.userId },
        {
          project: {
            tasks: {
              some: {
                deletedAt: null,
                disciplines: {
                  some: activeOnly({ disciplineLeadUserId: ctx.userId }),
                },
              },
            },
          },
        },
      ],
    });

    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.status) {
      const statusFilter = parseStatusFilter<RiskStatus>(query.status);
      if (statusFilter) {
        where.status = statusFilter;
      }
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { riskIdCode: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  /**
   * FK/RBAC access gate for a project's risk list. Full access, module
   * canView, or a discipline lead on any discipline in the project see every
   * risk in the project; everyone else only sees risks they own or created.
   */
  private async buildListWhere(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<Prisma.RiskWhereInput> {
    const where: Prisma.RiskWhereInput = activeOnly({ projectId });

    if (!(await this.canViewAllProjectRisks(ctx, projectId))) {
      where.OR = [{ ownerId: ctx.userId }, { createdBy: ctx.userId }];
    }

    if (query.status) {
      const statusFilter = parseStatusFilter<RiskStatus>(query.status);
      if (statusFilter) {
        where.status = statusFilter;
      }
    }
    if (query.probability) {
      where.probability = query.probability;
    }
    if (query.impact) {
      where.impact = query.impact;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      const searchOr: Prisma.RiskWhereInput[] = [
        { riskIdCode: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchOr }];
        delete where.OR;
      } else {
        where.OR = searchOr;
      }
    }

    return where;
  }

  private async canViewAllProjectRisks(
    ctx: PmContext,
    projectId: string,
  ): Promise<boolean> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (hasFullProjectDataAccess(roleNames)) {
      return true;
    }

    const pmPerms = await this.permissionService.getUserModulePermissions(
      ctx.userId,
      ctx.companyId,
      'risks',
    );
    if (pmPerms.canView) {
      return true;
    }

    return this.isDisciplineLeadInProject(ctx, projectId);
  }

  /**
   * Who can create: full access, RBAC create permission, a discipline lead
   * on any discipline in the project, or the person creating the risk
   * assigning themselves as owner.
   */
  private async assertCanCreateRisk(
    ctx: PmContext,
    projectId: string,
    ownerId: string,
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (hasFullProjectDataAccess(roleNames)) {
      return;
    }

    const pmPerms = await this.permissionService.getUserModulePermissions(
      ctx.userId,
      ctx.companyId,
      'risks',
    );
    if (pmPerms.canCreate) {
      return;
    }

    if (await this.isDisciplineLeadInProject(ctx, projectId)) {
      return;
    }

    if (ownerId === ctx.userId) {
      return;
    }

    throw new ForbiddenException('Access denied');
  }

  /**
   * Who can view: full access, RBAC view permission, discipline lead on any
   * discipline in the project, the risk owner, or the risk's creator.
   * Who can edit: only the risk owner, or full access - a narrower gate than
   * view, since risks are meant to be maintained by the person accountable
   * for them.
   */
  private async assertCanAccessRisk(
    ctx: PmContext,
    risk: { projectId: string; ownerId: string; createdBy: string },
    action: 'view' | 'edit',
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (hasFullProjectDataAccess(roleNames)) {
      return;
    }

    if (action === 'edit') {
      if (risk.ownerId === ctx.userId) {
        return;
      }
      throw new ForbiddenException(
        'Only the risk owner or a project administrator can edit this risk',
      );
    }

    const pmPerms = await this.permissionService.getUserModulePermissions(
      ctx.userId,
      ctx.companyId,
      'risks',
    );
    if (pmPerms.canView) {
      return;
    }
    if (risk.ownerId === ctx.userId || risk.createdBy === ctx.userId) {
      return;
    }
    if (await this.isDisciplineLeadInProject(ctx, risk.projectId)) {
      return;
    }

    throw new ForbiddenException('Access denied');
  }

  private async isDisciplineLeadInProject(
    ctx: PmContext,
    projectId: string,
  ): Promise<boolean> {
    const discipline = await this.prisma.taskDiscipline.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        task: { projectId, deletedAt: null },
        disciplineLeadUserId: ctx.userId,
      }),
      select: { id: true },
    });
    return Boolean(discipline);
  }

  private async sendRiskAssignedNotification(
    ctx: PmContext,
    risk: Risk,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const link = `/projects/${risk.projectId}/risks?riskId=${risk.id}`;
    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: risk.ownerId,
          eventType: RISK_ASSIGNED_EVENT,
          subject: `Risk assigned - ${risk.riskIdCode}`,
          body: `Risk ${risk.riskIdCode} has been assigned to you: ${risk.title}`,
          variables: {
            projectId: risk.projectId,
            riskId: risk.id,
            riskIdCode: risk.riskIdCode,
            link,
          },
          link,
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Risk assigned notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async sendRiskStatusChangedNotification(
    ctx: PmContext,
    risk: Risk,
    previousStatus: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const link = `/projects/${risk.projectId}/risks?riskId=${risk.id}`;
    const recipients = new Set<string>([risk.ownerId, risk.createdBy]);
    for (const recipientId of recipients) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType: RISK_STATUS_CHANGED_EVENT,
            subject: `Risk status changed - ${risk.riskIdCode}`,
            body: `Risk ${risk.riskIdCode} status changed to ${risk.status}`,
            variables: {
              projectId: risk.projectId,
              riskId: risk.id,
              riskIdCode: risk.riskIdCode,
              previousStatus,
              newStatus: risk.status,
              link,
            },
            link,
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'Risk status changed notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async getRiskOrThrow(projectId: string, riskId: string): Promise<Risk> {
    const row = await this.prisma.risk.findFirst({
      where: activeOnly({ id: riskId, projectId }),
    });
    if (!row) {
      throw new NotFoundException('Risk not found');
    }
    return row;
  }

  private async assertUserInCompany(
    ctx: PmContext,
    userId: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
  }
}
