import { Injectable, NotFoundException } from '@nestjs/common';
import { Deliverable, DeliverableStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateDeliverableDto,
  DeliverableListQueryDto,
  UpdateDeliverableDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapDeliverable,
  MappedDeliverable,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { DisciplineScopeService } from './discipline-scope.service';
import { DocumentNumberService } from './document-number.service';
import { ProjectScopeService } from './project-scope.service';

const DELIVERABLE_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'name',
  'status',
  'dueDate',
]);

/**
 * CRUD service for project deliverables.
 */
@Injectable()
export class DeliverableService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly disciplineScopeService: DisciplineScopeService,
  ) {}

  /**
   * Returns a paginated list of deliverables for a project.
   */
  async listDeliverables(
    ctx: PmContext,
    projectId: string,
    query: DeliverableListQueryDto,
  ): Promise<PaginatedResult<MappedDeliverable>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = await this.buildListWhere(ctx, projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      DELIVERABLE_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.deliverable.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          taskDiscipline: { select: { id: true, disciplineName: true } },
          designPackage: { select: { id: true, name: true } },
        },
      }),
      this.prisma.deliverable.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapDeliverable),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a single deliverable with related discipline and package.
   */
  async getDeliverable(
    ctx: PmContext,
    projectId: string,
    deliverableId: string,
  ): Promise<MappedDeliverable> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const row = await this.getDeliverableOrThrow(ctx, projectId, deliverableId);
    return mapDeliverable(row);
  }

  /**
   * Creates a deliverable in PLANNED status.
   */
  async createDeliverable(
    ctx: PmContext,
    projectId: string,
    dto: CreateDeliverableDto,
  ): Promise<MappedDeliverable> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    if (dto.taskDisciplineId) {
      await this.disciplineScopeService.assertDisciplineAccess(
        ctx,
        projectId,
        dto.taskDisciplineId,
      );
    }

    if (dto.designPackageId) {
      await this.assertDesignPackageInProject(
        ctx,
        projectId,
        dto.designPackageId,
      );
    }

    const deliverableNumber = await this.documentNumberService.nextDeliverableNumber(
      ctx.companyId,
    );

    const row = await this.prisma.deliverable.create({
      data: {
        companyId: ctx.companyId,
        projectId,
        taskDisciplineId: dto.taskDisciplineId,
        designPackageId: dto.designPackageId,
        engineeringDocumentId: dto.engineeringDocumentId,
        name: `${deliverableNumber} - ${dto.name}`,
        status: DeliverableStatus.PLANNED,
        dueDate: parseOptionalDate(dto.dueDate),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: {
        taskDiscipline: { select: { id: true, disciplineName: true } },
        designPackage: { select: { id: true, name: true } },
      },
    });

    return mapDeliverable(row);
  }

  /**
   * Updates deliverable metadata and status.
   */
  async updateDeliverable(
    ctx: PmContext,
    projectId: string,
    deliverableId: string,
    dto: UpdateDeliverableDto,
  ): Promise<MappedDeliverable> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.getDeliverableOrThrow(ctx, projectId, deliverableId);

    if (dto.taskDisciplineId) {
      await this.disciplineScopeService.assertDisciplineAccess(
        ctx,
        projectId,
        dto.taskDisciplineId,
      );
    }

    if (dto.designPackageId) {
      await this.assertDesignPackageInProject(
        ctx,
        projectId,
        dto.designPackageId,
      );
    }

    const row = await this.prisma.deliverable.update({
      where: { id: deliverableId },
      data: {
        name: dto.name,
        taskDisciplineId: dto.taskDisciplineId,
        designPackageId: dto.designPackageId,
        engineeringDocumentId: dto.engineeringDocumentId,
        status: dto.status,
        dueDate: parseOptionalDate(dto.dueDate),
        updatedBy: ctx.userId,
      },
      include: {
        taskDiscipline: { select: { id: true, disciplineName: true } },
        designPackage: { select: { id: true, name: true } },
      },
    });

    return mapDeliverable(row);
  }

  /**
   * Soft-deletes a deliverable.
   */
  async deleteDeliverable(
    ctx: PmContext,
    projectId: string,
    deliverableId: string,
  ): Promise<void> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.getDeliverableOrThrow(ctx, projectId, deliverableId);

    await this.prisma.deliverable.update({
      where: { id: deliverableId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private async buildListWhere(
    ctx: PmContext,
    projectId: string,
    query: DeliverableListQueryDto,
  ): Promise<Prisma.DeliverableWhereInput> {
    const where: Prisma.DeliverableWhereInput = activeOnly({
      companyId: ctx.companyId,
      projectId,
    });

    if (query.disciplineId) {
      where.taskDisciplineId = query.disciplineId;
    }

    if (query.status) {
      where.status = query.status as DeliverableStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.name = { contains: term, mode: 'insensitive' };
    }

    const bypass = await this.disciplineScopeService.hasDisciplineScopeBypass(
      ctx,
      projectId,
    );
    if (!bypass && !query.disciplineId) {
      const assignedIds =
        await this.disciplineScopeService.getAssignedDisciplineIds(
          ctx,
          projectId,
        );
      where.OR = [
        { taskDisciplineId: null },
        { taskDisciplineId: { in: assignedIds } },
      ];
    }

    return where;
  }

  private async getDeliverableOrThrow(
    ctx: PmContext,
    projectId: string,
    deliverableId: string,
  ): Promise<
    Deliverable & {
      taskDiscipline: { id: string; disciplineName: string } | null;
      designPackage: { id: string; name: string } | null;
    }
  > {
    const row = await this.prisma.deliverable.findFirst({
      where: activeOnly({
        id: deliverableId,
        companyId: ctx.companyId,
        projectId,
      }),
      include: {
        taskDiscipline: { select: { id: true, disciplineName: true } },
        designPackage: { select: { id: true, name: true } },
      },
    });
    if (!row) {
      throw new NotFoundException('Deliverable not found');
    }
    return row;
  }

  private async assertDesignPackageInProject(
    ctx: PmContext,
    projectId: string,
    designPackageId: string,
  ): Promise<void> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: designPackageId,
        companyId: ctx.companyId,
        taskDiscipline: { task: { projectId } },
      }),
      select: { id: true },
    });
    if (!pkg) {
      throw new NotFoundException('Design package not found');
    }
  }
}
