import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateDrawingDto,
  CreateDrawingLinkDto,
  PmListQueryDto,
  UpdateDrawingDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapDrawing,
  mapDrawingLink,
  mapDrawingVersion,
  MappedDrawing,
  MappedDrawingLink,
  MappedDrawingVersion,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { enrichRowsWithUserDisplayNames } from '../utils/pm-user-names.util';
import { PM_UPLOADED_BY_NAME } from '../utils/pm-user-name-fields.const';
import { ProjectScopeService } from './project-scope.service';

const DRAWING_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'drawingNumber',
  'title',
  'discipline',
  'dateIssued',
]);

@Injectable()
export class DrawingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
  ) {}

  /**
   * Returns a paginated list of drawings for a project.
   */
  async listDrawings(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedDrawing>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = this.buildListWhere(projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      DRAWING_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.drawing.findMany({ where, skip, take, orderBy }),
      this.prisma.drawing.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapDrawing),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a single drawing by id scoped to a project.
   */
  async getDrawing(
    ctx: PmContext,
    projectId: string,
    drawingId: string,
  ): Promise<MappedDrawing> {
    const row = await this.getDrawingOrThrow(projectId, drawingId);
    return mapDrawing(row);
  }

  /**
   * Creates a drawing and its initial version record.
   */
  async createDrawing(
    ctx: PmContext,
    projectId: string,
    dto: CreateDrawingDto,
  ): Promise<MappedDrawing> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    if (dto.folderId) {
      await this.assertFolderInCompany(ctx, dto.folderId);
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const drawing = await tx.drawing.create({
        data: {
          projectId,
          folderId: dto.folderId,
          drawingNumber: dto.drawingNumber,
          title: dto.title,
          discipline: dto.discipline,
          revision: dto.revision,
          status: dto.status ?? 'CURRENT',
          dateIssued: parseOptionalDate(dto.dateIssued),
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      await tx.drawingVersion.create({
        data: {
          drawingId: drawing.id,
          uploadedBy: ctx.userId,
          revision: dto.revision,
          fileKey: `pending/${drawing.id}/${dto.revision}`,
          status: dto.status ?? 'CURRENT',
        },
      });

      return drawing;
    });

    return mapDrawing(row);
  }

  /**
   * Updates an existing drawing scoped to a project.
   */
  async updateDrawing(
    ctx: PmContext,
    projectId: string,
    drawingId: string,
    dto: UpdateDrawingDto,
  ): Promise<MappedDrawing> {
    await this.getDrawingOrThrow(projectId, drawingId);

    if (dto.folderId) {
      await this.assertFolderInCompany(ctx, dto.folderId);
    }

    const row = await this.prisma.drawing.update({
      where: { id: drawingId },
      data: {
        folderId: dto.folderId,
        drawingNumber: dto.drawingNumber,
        title: dto.title,
        discipline: dto.discipline,
        revision: dto.revision,
        status: dto.status,
        dateIssued: parseOptionalDate(dto.dateIssued),
        updatedBy: ctx.userId,
      },
    });

    return mapDrawing(row);
  }

  /**
   * Soft-deletes a drawing scoped to a project.
   */
  async deleteDrawing(
    ctx: PmContext,
    projectId: string,
    drawingId: string,
  ): Promise<void> {
    await this.getDrawingOrThrow(projectId, drawingId);
    await this.prisma.drawing.update({
      where: { id: drawingId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns all versions for a drawing.
   */
  async listVersions(
    ctx: PmContext,
    projectId: string,
    drawingId: string,
  ): Promise<MappedDrawingVersion[]> {
    await this.getDrawingOrThrow(projectId, drawingId);

    const rows = await this.prisma.drawingVersion.findMany({
      where: { drawingId },
      orderBy: { createdAt: 'desc' },
    });

    return enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map(mapDrawingVersion),
      PM_UPLOADED_BY_NAME,
    );
  }

  /**
   * Returns all entity links for a drawing.
   */
  async listLinks(
    ctx: PmContext,
    projectId: string,
    drawingId: string,
  ): Promise<MappedDrawingLink[]> {
    await this.getDrawingOrThrow(projectId, drawingId);

    const rows = await this.prisma.drawingLink.findMany({
      where: { drawingId },
      orderBy: { createdAt: 'desc' },
    });

    return rows.map(mapDrawingLink);
  }

  /**
   * Creates a link between a drawing and another entity.
   */
  async createLink(
    ctx: PmContext,
    projectId: string,
    drawingId: string,
    dto: CreateDrawingLinkDto,
  ): Promise<MappedDrawingLink> {
    await this.getDrawingOrThrow(projectId, drawingId);

    const row = await this.prisma.drawingLink.create({
      data: {
        drawingId,
        linkedEntityType: dto.linkedEntityType,
        linkedEntityId: dto.linkedEntityId,
        createdBy: ctx.userId,
      },
    });

    return mapDrawingLink(row);
  }

  /**
   * Removes a drawing entity link.
   */
  async deleteLink(
    ctx: PmContext,
    projectId: string,
    drawingId: string,
    linkId: string,
  ): Promise<void> {
    await this.getDrawingOrThrow(projectId, drawingId);

    const link = await this.prisma.drawingLink.findFirst({
      where: { id: linkId, drawingId },
    });
    if (!link) {
      throw new NotFoundException('Drawing link not found');
    }

    await this.prisma.drawingLink.delete({ where: { id: linkId } });
  }

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.DrawingWhereInput {
    const where: Prisma.DrawingWhereInput = activeOnly({ projectId });

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { drawingNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { discipline: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async getDrawingOrThrow(projectId: string, drawingId: string) {
    const row = await this.prisma.drawing.findFirst({
      where: activeOnly({ id: drawingId, projectId }),
    });
    if (!row) {
      throw new NotFoundException('Drawing not found');
    }
    return row;
  }

  private async assertFolderInCompany(
    ctx: PmContext,
    folderId: string,
  ): Promise<void> {
    const folder = await this.prisma.documentFolder.findFirst({
      where: activeOnly({ id: folderId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!folder) {
      throw new NotFoundException('Document folder not found');
    }
  }
}
