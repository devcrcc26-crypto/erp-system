import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CorrespondenceDirection,
  CorrespondenceStatus,
  Prisma,
} from '@prisma/client';
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
  RespondCorrespondenceDto,
  UpdateCorrespondenceDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapCorrespondence,
  MappedCorrespondence,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import { loadRaisedItemsForSource } from '../utils/source-entity.util';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';

const CORRESPONDENCE_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'referenceNumber',
  'subject',
  'correspondenceDate',
  'status',
  'direction',
]);

const CORRESPONDENCE_DETAIL_INCLUDE = {
  parent: {
    select: {
      id: true,
      referenceNumber: true,
      subject: true,
      direction: true,
      status: true,
    },
  },
  responses: {
    where: { deletedAt: null },
    orderBy: { correspondenceDate: 'asc' as const },
    select: {
      id: true,
      referenceNumber: true,
      subject: true,
      direction: true,
      status: true,
      correspondenceDate: true,
      senderName: true,
      recipientName: true,
    },
  },
  project: {
    select: { id: true, name: true, projectCode: true },
  },
} satisfies Prisma.CorrespondenceInclude;

type CorrespondenceDetailRow = Prisma.CorrespondenceGetPayload<{
  include: typeof CORRESPONDENCE_DETAIL_INCLUDE;
}>;

@Injectable()
export class CorrespondenceService {
  private readonly logger = new Logger(CorrespondenceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
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

    const where = this.buildListWhere(projectId, query, ctx.companyId);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      CORRESPONDENCE_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.correspondence.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.correspondence.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => mapCorrespondence(row, null)),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Company-wide correspondence list for portfolio users.
   */
  async listAllCorrespondence(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedCorrespondence>> {
    const where = this.buildCompanyListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      CORRESPONDENCE_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.correspondence.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.correspondence.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map((row) => mapCorrespondence(row, null)),
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
    const row = await this.getCorrespondenceDetailOrThrow(
      projectId,
      correspondenceId,
    );
    return this.enrichCorrespondence(ctx, projectId, row);
  }

  /**
   * Creates a correspondence record with a direction-prefixed reference.
   */
  async createCorrespondence(
    ctx: PmContext,
    projectId: string,
    dto: CreateCorrespondenceDto,
  ): Promise<MappedCorrespondence> {
    const project = await this.projectScopeService.getProjectOrThrow(
      ctx,
      projectId,
    );

    if (dto.parentId) {
      await this.assertParentInProject(projectId, dto.parentId);
    }

    const isIncoming = dto.direction === CorrespondenceDirection.INCOMING;
    if (!isIncoming && !dto.senderUserId) {
      throw new BadRequestException(
        'Outgoing correspondence requires a named sender (From)',
      );
    }
    if (isIncoming && !dto.recipientUserId) {
      throw new BadRequestException(
        'Incoming correspondence requires a named recipient (To)',
      );
    }

    const referenceNumber = await this.buildReferenceNumber(
      projectId,
      project.projectCode,
      dto.direction,
    );

    const now = new Date();

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.correspondence.create({
        data: {
          companyId: project.companyId,
          projectId,
          senderUserId: isIncoming ? null : (dto.senderUserId ?? null),
          recipientUserId: isIncoming ? (dto.recipientUserId ?? null) : null,
          referenceNumber,
          correspondenceType: dto.correspondenceType,
          direction: dto.direction,
          subject: dto.subject.trim(),
          senderName: dto.senderName.trim(),
          recipientName: dto.recipientName.trim(),
          senderCompany: dto.senderCompany?.trim() || null,
          recipientCompany: dto.recipientCompany?.trim() || null,
          notes: dto.notes?.trim() || null,
          correspondenceDate: new Date(dto.correspondenceDate),
          parentId: dto.parentId ?? null,
          status: isIncoming
            ? CorrespondenceStatus.ACKNOWLEDGED
            : CorrespondenceStatus.DRAFT,
          acknowledgedAt: isIncoming ? now : null,
          acknowledgedBy: isIncoming ? ctx.userId : null,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      if (dto.parentId) {
        const parent = await tx.correspondence.findFirst({
          where: activeOnly({ id: dto.parentId, projectId }),
          select: { id: true, status: true },
        });
        if (parent?.status === CorrespondenceStatus.SENT) {
          await tx.correspondence.update({
            where: { id: parent.id },
            data: {
              status: CorrespondenceStatus.ACKNOWLEDGED,
              acknowledgedAt: now,
              acknowledgedBy: ctx.userId,
              updatedBy: ctx.userId,
            },
          });
        }
      }

      return created;
    });

    return this.enrichCorrespondence(ctx, projectId, row);
  }

  /**
   * Updates editable fields on a correspondence record (status via actions only).
   */
  async updateCorrespondence(
    ctx: PmContext,
    projectId: string,
    correspondenceId: string,
    dto: UpdateCorrespondenceDto,
  ): Promise<MappedCorrespondence> {
    const existing = await this.getCorrespondenceOrThrow(
      projectId,
      correspondenceId,
    );
    if (existing.status === CorrespondenceStatus.CLOSED) {
      throw new BadRequestException('Closed correspondence cannot be edited');
    }

    const row = await this.prisma.correspondence.update({
      where: { id: correspondenceId },
      data: {
        correspondenceType: dto.correspondenceType,
        subject: dto.subject?.trim(),
        senderName: dto.senderName?.trim(),
        recipientName: dto.recipientName?.trim(),
        senderCompany:
          dto.senderCompany !== undefined
            ? dto.senderCompany.trim() || null
            : undefined,
        recipientCompany:
          dto.recipientCompany !== undefined
            ? dto.recipientCompany.trim() || null
            : undefined,
        notes: dto.notes !== undefined ? dto.notes.trim() || null : undefined,
        correspondenceDate: dto.correspondenceDate
          ? new Date(dto.correspondenceDate)
          : undefined,
        updatedBy: ctx.userId,
      },
      include: CORRESPONDENCE_DETAIL_INCLUDE,
    });

    return this.enrichCorrespondence(ctx, projectId, row);
  }

  /**
   * Marks an outgoing DRAFT correspondence as SENT.
   */
  async markAsSent(
    ctx: PmContext,
    projectId: string,
    correspondenceId: string,
  ): Promise<MappedCorrespondence> {
    const existing = await this.getCorrespondenceOrThrow(
      projectId,
      correspondenceId,
    );
    if (existing.direction !== CorrespondenceDirection.OUTGOING) {
      throw new BadRequestException('Only outgoing correspondence can be sent');
    }
    if (existing.status !== CorrespondenceStatus.DRAFT) {
      throw new BadRequestException(
        'Only draft outgoing correspondence can be marked as sent',
      );
    }

    const row = await this.prisma.correspondence.update({
      where: { id: correspondenceId },
      data: {
        status: CorrespondenceStatus.SENT,
        sentAt: new Date(),
        sentBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: CORRESPONDENCE_DETAIL_INCLUDE,
    });

    return this.enrichCorrespondence(ctx, projectId, row);
  }

  /**
   * Records acknowledgement for a SENT outgoing correspondence.
   */
  async recordAcknowledgement(
    ctx: PmContext,
    projectId: string,
    correspondenceId: string,
  ): Promise<MappedCorrespondence> {
    const existing = await this.getCorrespondenceOrThrow(
      projectId,
      correspondenceId,
    );
    if (existing.status !== CorrespondenceStatus.SENT) {
      throw new BadRequestException(
        'Only sent correspondence can be acknowledged',
      );
    }

    const row = await this.prisma.correspondence.update({
      where: { id: correspondenceId },
      data: {
        status: CorrespondenceStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: CORRESPONDENCE_DETAIL_INCLUDE,
    });

    return this.enrichCorrespondence(ctx, projectId, row);
  }

  /**
   * Closes a SENT or ACKNOWLEDGED correspondence record.
   */
  async closeCorrespondence(
    ctx: PmContext,
    projectId: string,
    correspondenceId: string,
  ): Promise<MappedCorrespondence> {
    const existing = await this.getCorrespondenceOrThrow(
      projectId,
      correspondenceId,
    );
    if (
      existing.status !== CorrespondenceStatus.SENT &&
      existing.status !== CorrespondenceStatus.ACKNOWLEDGED
    ) {
      throw new BadRequestException(
        'Only sent or acknowledged correspondence can be closed',
      );
    }

    const row = await this.prisma.correspondence.update({
      where: { id: correspondenceId },
      data: {
        status: CorrespondenceStatus.CLOSED,
        updatedBy: ctx.userId,
      },
      include: CORRESPONDENCE_DETAIL_INCLUDE,
    });

    return this.enrichCorrespondence(ctx, projectId, row);
  }

  /**
   * Creates a response correspondence linked to a parent record.
   */
  async createResponse(
    ctx: PmContext,
    projectId: string,
    parentId: string,
    dto: RespondCorrespondenceDto,
  ): Promise<MappedCorrespondence> {
    const parent = await this.getCorrespondenceOrThrow(projectId, parentId);
    const oppositeDirection =
      parent.direction === CorrespondenceDirection.OUTGOING
        ? CorrespondenceDirection.INCOMING
        : CorrespondenceDirection.OUTGOING;

    return this.createCorrespondence(ctx, projectId, {
      correspondenceType: dto.correspondenceType,
      direction: oppositeDirection,
      subject: dto.subject,
      senderName: dto.senderName,
      recipientName: dto.recipientName,
      senderCompany: dto.senderCompany,
      recipientCompany: dto.recipientCompany,
      senderUserId: dto.senderUserId,
      recipientUserId: dto.recipientUserId,
      notes: dto.notes,
      correspondenceDate: dto.correspondenceDate,
      parentId: parent.id,
    });
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

  private async buildReferenceNumber(
    projectId: string,
    projectCode: string,
    direction: CorrespondenceDirection,
  ): Promise<string> {
    const count = await this.prisma.correspondence.count({
      where: {
        projectId,
        direction,
        deletedAt: null,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    const prefix =
      direction === CorrespondenceDirection.INCOMING ? 'IN' : 'OUT';
    return `COR-${prefix}-${projectCode}-${seq}`;
  }

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
    companyId: string,
  ): Prisma.CorrespondenceWhereInput {
    const where: Prisma.CorrespondenceWhereInput = activeOnly({
      projectId,
      companyId,
    });

    const statusFilter = parseStatusFilter<CorrespondenceStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.direction) {
      where.direction = query.direction;
    }

    if (query.correspondenceType) {
      where.correspondenceType = query.correspondenceType;
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

  private buildCompanyListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Prisma.CorrespondenceWhereInput {
    const where: Prisma.CorrespondenceWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

    const statusFilter = parseStatusFilter<CorrespondenceStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.direction) {
      where.direction = query.direction;
    }

    if (query.correspondenceType) {
      where.correspondenceType = query.correspondenceType;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { referenceNumber: { contains: term, mode: 'insensitive' } },
        { subject: { contains: term, mode: 'insensitive' } },
        { senderName: { contains: term, mode: 'insensitive' } },
        { recipientName: { contains: term, mode: 'insensitive' } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { project: { projectCode: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private async enrichCorrespondence(
    ctx: PmContext,
    projectId: string,
    row: CorrespondenceDetailRow | Prisma.CorrespondenceGetPayload<object>,
  ): Promise<MappedCorrespondence> {
    let attachmentFolderId: string | null = null;

    try {
      const folder =
        await this.engineeringDocumentFolderService.ensureCorrespondenceFolder(
          ctx,
          projectId,
          row.id,
          row.referenceNumber,
        );
      attachmentFolderId = folder.id;
    } catch (error) {
      this.logger.warn(
        `Correspondence ${row.id} attachment folder could not be ensured`,
        error instanceof Error ? error.message : String(error),
      );
    }

    const raisedItems = await loadRaisedItemsForSource(
      this.prisma,
      projectId,
      'CORRESPONDENCE',
      row.id,
    );

    const userIds = [row.createdBy, row.acknowledgedBy, row.sentBy].filter(
      (id): id is string => Boolean(id),
    );
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const nameById = new Map(
      users.map((user) => [
        user.id,
        `${user.firstName} ${user.lastName}`.trim(),
      ]),
    );

    return mapCorrespondence(row, attachmentFolderId, raisedItems, {
      createdByName: nameById.get(row.createdBy) ?? null,
      acknowledgedByName: row.acknowledgedBy
        ? (nameById.get(row.acknowledgedBy) ?? null)
        : null,
      sentByName: row.sentBy ? (nameById.get(row.sentBy) ?? null) : null,
    });
  }

  private async assertParentInProject(
    projectId: string,
    parentId: string,
  ): Promise<void> {
    const parent = await this.prisma.correspondence.findFirst({
      where: activeOnly({ id: parentId, projectId }),
      select: { id: true },
    });
    if (!parent) {
      throw new BadRequestException(
        'Parent correspondence not found in this project',
      );
    }
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

  private async getCorrespondenceDetailOrThrow(
    projectId: string,
    correspondenceId: string,
  ): Promise<CorrespondenceDetailRow> {
    const row = await this.prisma.correspondence.findFirst({
      where: activeOnly({ id: correspondenceId, projectId }),
      include: CORRESPONDENCE_DETAIL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Correspondence not found');
    }
    return row;
  }
}
