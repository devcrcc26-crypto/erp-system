import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma, PunchItemSeverity, PunchItemStatus } from '@prisma/client';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  AssignPunchItemDto,
  CorrectPunchItemDto,
  CreatePunchItemDto,
  PmListQueryDto,
  ReopenPunchItemDto,
  UpdatePunchItemDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapPunchItem,
  MappedPunchItem,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import {
  enrichRowsWithUserDisplayNames,
  enrichWithUserDisplayNames,
} from '../utils/pm-user-names.util';
import { PM_PUNCH_ITEM_USER_NAMES } from '../utils/pm-user-name-fields.const';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';

const PUNCH_ITEM_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'punchNumber',
  'title',
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
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly permissionService: PermissionService,
    @Optional() private readonly notificationService?: NotificationService,
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

    const where = this.buildListWhere(projectId, query, ctx.companyId);
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

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map((row) => mapPunchItem(row)),
      PM_PUNCH_ITEM_USER_NAMES,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-wide punch items (portfolio / admin users).
   */
  async listAllPunchItems(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedPunchItem>> {
    const where = this.buildListWhere(null, query, ctx.companyId);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      PUNCH_ITEM_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.punchItem.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.punchItem.count({ where }),
    ]);

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map((row) => mapPunchItem(row)),
      PM_PUNCH_ITEM_USER_NAMES,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
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
   * Creates a punch item with a project-scoped PL- reference number.
   */
  async createPunchItem(
    ctx: PmContext,
    projectId: string,
    dto: CreatePunchItemDto,
  ): Promise<MappedPunchItem> {
    const project = await this.projectScopeService.getProjectOrThrow(
      ctx,
      projectId,
    );

    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }

    const count = await this.prisma.punchItem.count({
      where: { projectId, deletedAt: null },
    });
    const seq = String(count + 1).padStart(3, '0');
    const punchNumber = `PL-${project.projectCode}-${seq}`;
    const status = dto.assignedTo
      ? PunchItemStatus.ASSIGNED
      : PunchItemStatus.RAISED;

    const row = await this.prisma.punchItem.create({
      data: {
        companyId: project.companyId,
        projectId,
        raisedBy: ctx.userId,
        assignedTo: dto.assignedTo ?? null,
        punchNumber,
        title: dto.title.trim(),
        description: dto.description.trim(),
        roomOrArea: dto.roomOrArea?.trim() || null,
        tradeResponsible: dto.tradeResponsible?.trim() || null,
        category: dto.category?.trim() || null,
        severity: dto.severity,
        status,
        dueDate: parseOptionalDate(dto.dueDate),
        taskDisciplineId: dto.taskDisciplineId ?? null,
        designPackageId: dto.designPackageId ?? null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    if (dto.assignedTo) {
      await this.notifyPunchEvent(
        ctx,
        dto.assignedTo,
        'punch_item.assigned',
        `Punch item assigned - ${row.punchNumber}`,
        row.description,
        projectId,
        row.id,
        row.punchNumber,
      );
    }

    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Updates editable fields on a punch item (status via actions only).
   */
  async updatePunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
    dto: UpdatePunchItemDto,
  ): Promise<MappedPunchItem> {
    await this.getPunchItemOrThrow(projectId, punchItemId);

    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }

    const row = await this.prisma.punchItem.update({
      where: { id: punchItemId },
      data: {
        assignedTo: dto.assignedTo,
        title: dto.title?.trim(),
        description: dto.description?.trim(),
        roomOrArea:
          dto.roomOrArea !== undefined
            ? dto.roomOrArea.trim() || null
            : undefined,
        tradeResponsible:
          dto.tradeResponsible !== undefined
            ? dto.tradeResponsible.trim() || null
            : undefined,
        category:
          dto.category !== undefined ? dto.category.trim() || null : undefined,
        severity: dto.severity,
        dueDate:
          dto.dueDate !== undefined
            ? parseOptionalDate(dto.dueDate)
            : undefined,
        taskDisciplineId: dto.taskDisciplineId,
        designPackageId: dto.designPackageId,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Assigns a RAISED punch item to a user and moves it to ASSIGNED.
   */
  async assignPunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
    dto: AssignPunchItemDto,
  ): Promise<MappedPunchItem> {
    const item = await this.getPunchItemOrThrow(projectId, punchItemId);
    if (item.status !== PunchItemStatus.RAISED) {
      throw new BadRequestException('Can only assign RAISED items');
    }

    await this.assertUserInCompany(ctx, dto.assignedTo);

    const row = await this.prisma.punchItem.update({
      where: { id: punchItemId },
      data: {
        status: PunchItemStatus.ASSIGNED,
        assignedTo: dto.assignedTo,
        updatedBy: ctx.userId,
      },
    });

    await this.notifyPunchEvent(
      ctx,
      dto.assignedTo,
      'punch_item.assigned',
      `Punch item assigned - ${item.punchNumber}`,
      item.description,
      projectId,
      punchItemId,
      item.punchNumber,
    );

    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Records correction of an ASSIGNED punch item by the assignee (or admin).
   */
  async correctPunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
    dto: CorrectPunchItemDto,
  ): Promise<MappedPunchItem> {
    const item = await this.getPunchItemOrThrow(projectId, punchItemId);
    if (item.status !== PunchItemStatus.ASSIGNED) {
      throw new BadRequestException('Can only correct ASSIGNED items');
    }

    const roleNames = await this.getRoleNames(ctx);
    if (
      ctx.userId !== item.assignedTo &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the assignee or admin can mark as corrected',
      );
    }

    if (!dto.resolutionNote?.trim()) {
      throw new BadRequestException('Resolution note is required');
    }

    const row = await this.prisma.punchItem.update({
      where: { id: punchItemId },
      data: {
        status: PunchItemStatus.CORRECTED,
        correctedAt: new Date(),
        resolutionNote: dto.resolutionNote.trim(),
        updatedBy: ctx.userId,
      },
    });

    await this.notifyPunchEvent(
      ctx,
      item.raisedBy,
      'punch_item.corrected',
      `Punch item corrected - ${item.punchNumber}`,
      `Please verify the fix: ${dto.resolutionNote.trim()}`,
      projectId,
      punchItemId,
      item.punchNumber,
    );

    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Verifies a CORRECTED punch item (raiser or admin; not the assignee).
   */
  async verifyPunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
  ): Promise<MappedPunchItem> {
    const item = await this.getPunchItemOrThrow(projectId, punchItemId);
    if (item.status !== PunchItemStatus.CORRECTED) {
      throw new BadRequestException('Can only verify CORRECTED items');
    }

    const roleNames = await this.getRoleNames(ctx);
    if (
      ctx.userId !== item.raisedBy &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException('Only the raiser or admin can verify');
    }

    this.assertFixerIsNotVerifier(item, ctx.userId);

    const row = await this.prisma.punchItem.update({
      where: { id: punchItemId },
      data: {
        status: PunchItemStatus.VERIFIED,
        verifiedAt: new Date(),
        verifiedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    if (item.assignedTo) {
      await this.notifyPunchEvent(
        ctx,
        item.assignedTo,
        'punch_item.verified',
        `Punch item verified - ${item.punchNumber}`,
        `Punch item ${item.punchNumber} has been verified.`,
        projectId,
        punchItemId,
        item.punchNumber,
      );
    }

    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Closes a VERIFIED punch item (raiser or admin).
   */
  async closePunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
  ): Promise<MappedPunchItem> {
    const item = await this.getPunchItemOrThrow(projectId, punchItemId);
    if (item.status !== PunchItemStatus.VERIFIED) {
      throw new BadRequestException('Can only close VERIFIED items');
    }

    const roleNames = await this.getRoleNames(ctx);
    if (
      ctx.userId !== item.raisedBy &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException('Only raiser or admin can close');
    }

    const row = await this.prisma.punchItem.update({
      where: { id: punchItemId },
      data: {
        status: PunchItemStatus.CLOSED,
        closedAt: new Date(),
        closedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichPunchItem(ctx, projectId, row);
  }

  /**
   * Reopens a CORRECTED, VERIFIED, or CLOSED punch item back to ASSIGNED.
   */
  async reopenPunchItem(
    ctx: PmContext,
    projectId: string,
    punchItemId: string,
    dto: ReopenPunchItemDto,
  ): Promise<MappedPunchItem> {
    const item = await this.getPunchItemOrThrow(projectId, punchItemId);
    if (
      item.status !== PunchItemStatus.CORRECTED &&
      item.status !== PunchItemStatus.VERIFIED &&
      item.status !== PunchItemStatus.CLOSED
    ) {
      throw new BadRequestException(
        'Can only reopen CORRECTED, VERIFIED, or CLOSED items',
      );
    }

    const roleNames = await this.getRoleNames(ctx);
    if (
      ctx.userId !== item.raisedBy &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException('Only raiser or admin can reopen');
    }

    const row = await this.prisma.punchItem.update({
      where: { id: punchItemId },
      data: {
        status: PunchItemStatus.ASSIGNED,
        correctedAt: null,
        resolutionNote: null,
        verifiedAt: null,
        verifiedBy: null,
        closedAt: null,
        closedBy: null,
        updatedBy: ctx.userId,
      },
    });

    if (item.assignedTo) {
      await this.notifyPunchEvent(
        ctx,
        item.assignedTo,
        'punch_item.reopened',
        `Punch item reopened - ${item.punchNumber}`,
        dto.reason?.trim() ||
          'Item has been reopened for re-correction.',
        projectId,
        punchItemId,
        item.punchNumber,
      );
    }

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

    const mapped = mapPunchItem(row, attachmentFolderId);

    if (row.taskDisciplineId) {
      const discipline = await this.prisma.taskDiscipline.findFirst({
        where: {
          id: row.taskDisciplineId,
          companyId: ctx.companyId,
          deletedAt: null,
        },
        select: { disciplineName: true },
      });
      mapped.disciplineName = discipline?.disciplineName ?? null;
    }

    if (row.designPackageId) {
      const designPackage = await this.prisma.designPackage.findFirst({
        where: {
          id: row.designPackageId,
          companyId: ctx.companyId,
          deletedAt: null,
        },
        select: { packageCode: true, name: true },
      });
      mapped.packageCode = designPackage?.packageCode ?? null;
      mapped.packageName = designPackage?.name ?? null;
    }

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapped,
      PM_PUNCH_ITEM_USER_NAMES,
    );
  }

  private buildListWhere(
    projectId: string | null,
    query: PmListQueryDto,
    companyId: string,
  ): Prisma.PunchItemWhereInput {
    const where: Prisma.PunchItemWhereInput = activeOnly({
      companyId,
      ...(projectId ? { projectId } : {}),
    });

    if (!projectId && query.projectId) {
      where.projectId = query.projectId;
    }

    const statusFilter = parseStatusFilter<PunchItemStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.severity?.trim()) {
      where.severity = query.severity.trim() as PunchItemSeverity;
    }

    if (query.category?.trim()) {
      where.category = query.category.trim();
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { punchNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { roomOrArea: { contains: term, mode: 'insensitive' } },
        { tradeResponsible: { contains: term, mode: 'insensitive' } },
        { category: { contains: term, mode: 'insensitive' } },
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

  private async getRoleNames(ctx: PmContext): Promise<string[]> {
    return this.permissionService.getUserRoleNames(ctx.userId, ctx.companyId);
  }

  /**
   * The person who corrected the item cannot verify their own fix.
   */
  private assertFixerIsNotVerifier(
    punchItem: { assignedTo: string | null },
    userId: string,
  ): void {
    if (punchItem.assignedTo && userId === punchItem.assignedTo) {
      throw new ForbiddenException(
        'The person who corrected the item cannot verify their own fix.',
      );
    }
  }

  private async notifyPunchEvent(
    ctx: PmContext,
    recipientId: string,
    eventType: string,
    subject: string,
    body: string,
    projectId: string,
    punchItemId: string,
    punchNumber: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }
    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId,
          eventType,
          subject,
          body,
          variables: {
            projectId,
            punchItemId,
            punchNumber,
            link: `/projects/${projectId}/punch-list`,
          },
        },
      );
    } catch (error) {
      this.logger.warn(
        `Punch notification failed (${eventType})`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
