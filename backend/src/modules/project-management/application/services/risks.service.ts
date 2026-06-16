import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RiskStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateRiskDto,
  PmListQueryDto,
  UpdateRiskDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapRisk,
  MappedRisk,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { ProjectScopeService } from './project-scope.service';

const RISK_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'title',
  'riskIdCode',
  'riskScore',
  'status',
  'reviewDate',
]);

@Injectable()
export class RisksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
  ) {}

  /**
   * Returns a paginated list of risks for a project.
   */
  async listRisks(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedRisk>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = this.buildListWhere(projectId, query);
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

    return buildPaginatedResult(
      rows.map(mapRisk),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a single risk by id scoped to a project.
   */
  async getRisk(
    ctx: PmContext,
    projectId: string,
    riskId: string,
  ): Promise<MappedRisk> {
    const row = await this.getRiskOrThrow(projectId, riskId);
    return mapRisk(row);
  }

  /**
   * Creates a risk with a computed risk score.
   */
  async createRisk(
    ctx: PmContext,
    projectId: string,
    dto: CreateRiskDto,
  ): Promise<MappedRisk> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.assertUserInCompany(ctx, dto.ownerId);

    const row = await this.prisma.risk.create({
      data: {
        projectId,
        ownerId: dto.ownerId,
        riskIdCode: dto.riskIdCode,
        title: dto.title,
        description: dto.description,
        category: dto.category,
        probability: dto.probability,
        impact: dto.impact,
        riskScore: dto.probability * dto.impact,
        mitigationPlan: dto.mitigationPlan,
        contingencyPlan: dto.contingencyPlan,
        reviewDate: parseOptionalDate(dto.reviewDate),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapRisk(row);
  }

  /**
   * Updates an existing risk scoped to a project.
   */
  async updateRisk(
    ctx: PmContext,
    projectId: string,
    riskId: string,
    dto: UpdateRiskDto,
  ): Promise<MappedRisk> {
    const existing = await this.getRiskOrThrow(projectId, riskId);

    if (dto.ownerId) {
      await this.assertUserInCompany(ctx, dto.ownerId);
    }

    const probability = dto.probability ?? existing.probability;
    const impact = dto.impact ?? existing.impact;

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
        riskScore: probability * impact,
        mitigationPlan: dto.mitigationPlan,
        contingencyPlan: dto.contingencyPlan,
        reviewDate: parseOptionalDate(dto.reviewDate),
        status: dto.status,
        updatedBy: ctx.userId,
      },
    });

    return mapRisk(row);
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

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.RiskWhereInput {
    const where: Prisma.RiskWhereInput = activeOnly({ projectId });

    if (query.status) {
      where.status = query.status as RiskStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { riskIdCode: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async getRiskOrThrow(projectId: string, riskId: string) {
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
