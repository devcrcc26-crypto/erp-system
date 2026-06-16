import { Injectable, NotFoundException } from '@nestjs/common';
import { CorrespondenceStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateCorrespondenceDto,
  PmListQueryDto,
  UpdateCorrespondenceDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapCorrespondence,
  MappedCorrespondence,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { DocumentNumberService } from './document-number.service';
import { ProjectScopeService } from './project-scope.service';

const CORRESPONDENCE_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'referenceNumber',
  'subject',
  'correspondenceDate',
  'status',
]);

@Injectable()
export class CorrespondenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
  ) {}

  /**
   * Returns a paginated list of correspondence records for a project.
   */
  async listCorrespondence(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedCorrespondence>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = this.buildListWhere(projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      CORRESPONDENCE_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.correspondence.findMany({ where, skip, take, orderBy }),
      this.prisma.correspondence.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapCorrespondence),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a single correspondence record by id scoped to a project.
   */
  async getCorrespondence(
    ctx: PmContext,
    projectId: string,
    correspondenceId: string,
  ): Promise<MappedCorrespondence> {
    const row = await this.getCorrespondenceOrThrow(projectId, correspondenceId);
    return mapCorrespondence(row);
  }

  /**
   * Creates a correspondence record with an auto-generated reference.
   */
  async createCorrespondence(
    ctx: PmContext,
    projectId: string,
    dto: CreateCorrespondenceDto,
  ): Promise<MappedCorrespondence> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const referenceNumber =
      dto.referenceNumber ??
      (await this.documentNumberService.getNextNumber(ctx, 'CORRESPONDENCE'));

    const row = await this.prisma.correspondence.create({
      data: {
        projectId,
        senderUserId: ctx.userId,
        referenceNumber,
        correspondenceType: dto.correspondenceType,
        subject: dto.subject,
        senderName: dto.senderName,
        recipientName: dto.recipientName,
        correspondenceDate: new Date(dto.correspondenceDate),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapCorrespondence(row);
  }

  /**
   * Updates an existing correspondence record scoped to a project.
   */
  async updateCorrespondence(
    ctx: PmContext,
    projectId: string,
    correspondenceId: string,
    dto: UpdateCorrespondenceDto,
  ): Promise<MappedCorrespondence> {
    await this.getCorrespondenceOrThrow(projectId, correspondenceId);

    const row = await this.prisma.correspondence.update({
      where: { id: correspondenceId },
      data: {
        correspondenceType: dto.correspondenceType,
        subject: dto.subject,
        senderName: dto.senderName,
        recipientName: dto.recipientName,
        correspondenceDate: dto.correspondenceDate
          ? new Date(dto.correspondenceDate)
          : undefined,
        referenceNumber: dto.referenceNumber,
        status: dto.status,
        updatedBy: ctx.userId,
      },
    });

    return mapCorrespondence(row);
  }

  /**
   * Soft-deletes a correspondence record scoped to a project.
   */
  async deleteCorrespondence(
    ctx: PmContext,
    projectId: string,
    correspondenceId: string,
  ): Promise<void> {
    await this.getCorrespondenceOrThrow(projectId, correspondenceId);
    await this.prisma.correspondence.update({
      where: { id: correspondenceId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.CorrespondenceWhereInput {
    const where: Prisma.CorrespondenceWhereInput = activeOnly({ projectId });

    if (query.status) {
      where.status = query.status as CorrespondenceStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { referenceNumber: { contains: term, mode: 'insensitive' } },
        { subject: { contains: term, mode: 'insensitive' } },
        { senderName: { contains: term, mode: 'insensitive' } },
        { recipientName: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async getCorrespondenceOrThrow(
    projectId: string,
    correspondenceId: string,
  ) {
    const row = await this.prisma.correspondence.findFirst({
      where: activeOnly({ id: correspondenceId, projectId }),
    });
    if (!row) {
      throw new NotFoundException('Correspondence not found');
    }
    return row;
  }
}
