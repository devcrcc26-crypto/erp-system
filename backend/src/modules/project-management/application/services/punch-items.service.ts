import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, PunchItemStatus } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreatePunchItemDto,
  PmListQueryDto,
  UpdatePunchItemDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapPunchItem,
  MappedPunchItem,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { DocumentNumberService } from './document-number.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';

const PUNCH_ITEM_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'punchNumber',
  'description',
  'status',
  'dueDate',
  'severity',
]);

@Injectable()
export class PunchItemsService {
  private readonly logger = new Logger(PunchItemsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
  ) {}

  /**
   * Returns a paginated list of punch items for a project.
   */
  async listPunchItems(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedPunchItem>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = this.buildListWhere(projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      PUNCH_ITEM_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.punchItem.findMany({ where, skip, take, orderBy }),
      this.prisma.punchItem.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => mapPunchItem(row)),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a single punch item by id scoped to a project.
   */
  async getPunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
  ): Promise<MappedPunchItem> {
    const row = await this.getPunchItemOrThrow(projectId, punchItemId);
    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Creates a punch item with an auto-generated punch number.
   */
  async createPunchItem(
    ctx: PmContext,
    projectId: string,
    dto: CreatePunchItemDto,
  ): Promise<MappedPunchItem> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }

    const punchNumber = await this.documentNumberService.getNextNumber(
      ctx,
      'PUNCH_ITEM',
    );

    const row = await this.prisma.punchItem.create({
      data: {
        projectId,
        raisedBy: ctx.userId,
        assignedTo: dto.assignedTo,
        punchNumber,
        description: dto.description,
        roomOrArea: dto.roomOrArea,
        tradeResponsible: dto.tradeResponsible,
        severity: dto.severity,
        dueDate: parseOptionalDate(dto.dueDate),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Updates an existing punch item scoped to a project.
   */
  async updatePunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
    dto: UpdatePunchItemDto,
  ): Promise<MappedPunchItem> {
    const existing = await this.getPunchItemOrThrow(projectId, punchItemId);

    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }

    if (dto.status === PunchItemStatus.VERIFIED) {
      this.assertVerifierIsNotRaiser(existing, ctx.userId);
    }

    const row = await this.prisma.punchItem.update({
      where: { id: punchItemId },
      data: {
        assignedTo: dto.assignedTo,
        description: dto.description,
        roomOrArea: dto.roomOrArea,
        tradeResponsible: dto.tradeResponsible,
        severity: dto.severity,
        dueDate: parseOptionalDate(dto.dueDate),
        status: dto.status,
        correctedAt:
          dto.status === PunchItemStatus.CORRECTED ? new Date() : undefined,
        verifiedAt:
          dto.status === PunchItemStatus.VERIFIED ? new Date() : undefined,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Soft-deletes a punch item scoped to a project.
   */
  async deletePunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
  ): Promise<void> {
    await this.getPunchItemOrThrow(projectId, punchItemId);
    await this.prisma.punchItem.update({
      where: { id: punchItemId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private async enrichPunchItem(
    ctx: PmContext,
    projectId: string,
    row: Parameters<typeof mapPunchItem>[0],
  ): Promise<MappedPunchItem> {
    let attachmentFolderId: string | null = null;

    try {
      const folder =
        await this.engineeringDocumentFolderService.ensurePunchItemFolder(
          ctx,
          projectId,
          row.id,
          row.punchNumber,
        );
      attachmentFolderId = folder.id;
    } catch (error) {
      this.logger.warn(
        `Failed to ensure punch item folder for ${row.id}: ${String(error)}`,
      );
    }

    return mapPunchItem(row, attachmentFolderId);
  }

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.PunchItemWhereInput {
    const where: Prisma.PunchItemWhereInput = activeOnly({ projectId });

    if (query.status) {
      where.status = query.status as PunchItemStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { punchNumber: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { roomOrArea: { contains: term, mode: 'insensitive' } },
        { tradeResponsible: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async getPunchItemOrThrow(projectId: string, punchItemId: string) {
    const row = await this.prisma.punchItem.findFirst({
      where: activeOnly({ id: punchItemId, projectId }),
    });
    if (!row) {
      throw new NotFoundException('Punch item not found');
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

  private assertVerifierIsNotRaiser(
    punchItem: { raisedBy: string },
    userId: string,
  ): void {
    if (userId === punchItem.raisedBy) {
      throw new ForbiddenException(
        'The person who raised a punch item cannot verify their own item. A second person must verify.',
      );
    }
  }
}
