import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExternalReviewTriggerType,
  Prisma,
  ProjectChangeRequest,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
} from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateChangeRequestDto,
  PmListQueryDto,
  RejectChangeRequestDto,
  UpdateChangeRequestDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapProjectChangeRequest,
  MappedProjectChangeRequest,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { PrismaTx } from '../../infrastructure/repositories/epc-workflow.repository';
import { ProjectScopeService } from './project-scope.service';

const CHANGE_REQUEST_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'changeNumber',
  'title',
  'status',
]);

/**
 * Manages project change requests — manual CRUD and external trigger drafts.
 */
@Injectable()
export class ProjectChangeRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
  ) {}

  /**
   * Returns a paginated list of change requests for a project.
   */
  async listChangeRequests(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedProjectChangeRequest>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = this.buildListWhere(ctx, projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      CHANGE_REQUEST_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.projectChangeRequest.findMany({ where, skip, take, orderBy }),
      this.prisma.projectChangeRequest.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapProjectChangeRequest),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a single change request scoped to a project.
   */
  async getChangeRequest(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
  ): Promise<MappedProjectChangeRequest> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const row = await this.getChangeRequestOrThrow(ctx, projectId, changeRequestId);
    return mapProjectChangeRequest(row);
  }

  /**
   * Creates a manual change request in DRAFT status.
   */
  async createChangeRequest(
    ctx: PmContext,
    projectId: string,
    dto: CreateChangeRequestDto,
  ): Promise<MappedProjectChangeRequest> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const changeNumber = await this.generateChangeNumber(ctx);

    const row = await this.prisma.projectChangeRequest.create({
      data: {
        companyId: ctx.companyId,
        projectId,
        changeNumber,
        title: dto.title,
        description: dto.description,
        status: ProjectChangeRequestStatus.DRAFT,
        sourceType: dto.sourceType ?? ProjectChangeRequestSource.MANUAL,
        sourceEntityId: dto.sourceEntityId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapProjectChangeRequest(row);
  }

  /**
   * Updates change request metadata.
   */
  async updateChangeRequest(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
    dto: UpdateChangeRequestDto,
  ): Promise<MappedProjectChangeRequest> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.getChangeRequestOrThrow(ctx, projectId, changeRequestId);

    const row = await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        updatedBy: ctx.userId,
      },
    });

    return mapProjectChangeRequest(row);
  }

  /**
   * Approves a change request.
   */
  async approveChangeRequest(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
  ): Promise<MappedProjectChangeRequest> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const existing = await this.getChangeRequestOrThrow(
      ctx,
      projectId,
      changeRequestId,
    );

    if (existing.status === ProjectChangeRequestStatus.APPROVED) {
      return mapProjectChangeRequest(existing);
    }

    const row = await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: ProjectChangeRequestStatus.APPROVED,
        updatedBy: ctx.userId,
      },
    });

    return mapProjectChangeRequest(row);
  }

  /**
   * Rejects a change request with a reason stored in description.
   */
  async rejectChangeRequest(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
    dto: RejectChangeRequestDto,
  ): Promise<MappedProjectChangeRequest> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const existing = await this.getChangeRequestOrThrow(
      ctx,
      projectId,
      changeRequestId,
    );

    const rejectionNote = `Rejection reason: ${dto.reason.trim()}`;
    const description = existing.description
      ? `${existing.description}\n\n${rejectionNote}`
      : rejectionNote;

    const row = await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: ProjectChangeRequestStatus.REJECTED,
        description,
        updatedBy: ctx.userId,
      },
    });

    return mapProjectChangeRequest(row);
  }

  /**
   * Soft-deletes a change request.
   */
  async deleteChangeRequest(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
  ): Promise<void> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    await this.getChangeRequestOrThrow(ctx, projectId, changeRequestId);

    await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Drafts a change request from an external review trigger (idempotent per trigger).
   */
  async createFromExternalTrigger(
    tx: PrismaTx,
    input: {
      companyId: string;
      projectId: string;
      triggerId: string;
      triggerType: ExternalReviewTriggerType;
      sourceEntityId: string;
      title: string;
      description?: string;
      actorId: string;
    },
  ): Promise<void> {
    const existing = await tx.projectChangeRequest.findFirst({
      where: {
        companyId: input.companyId,
        externalReviewTriggerId: input.triggerId,
        deletedAt: null,
      },
    });
    if (existing) {
      return;
    }

    const changeNumber = `CR-${input.triggerId.slice(0, 8).toUpperCase()}`;
    const sourceType =
      input.triggerType === ExternalReviewTriggerType.RFI
        ? ProjectChangeRequestSource.RFI
        : input.triggerType === ExternalReviewTriggerType.CHANGE_REQUEST
          ? ProjectChangeRequestSource.EXTERNAL_TRIGGER
          : ProjectChangeRequestSource.SUBMITTAL_REVIEW;

    await tx.projectChangeRequest.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId,
        changeNumber,
        title: input.title,
        description: input.description,
        status: ProjectChangeRequestStatus.DRAFT,
        sourceType,
        sourceEntityId: input.sourceEntityId,
        externalReviewTriggerId: input.triggerId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      },
    });
  }

  private buildListWhere(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.ProjectChangeRequestWhereInput {
    const where: Prisma.ProjectChangeRequestWhereInput = activeOnly({
      companyId: ctx.companyId,
      projectId,
    });

    if (query.status) {
      where.status = query.status as ProjectChangeRequestStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { changeNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async getChangeRequestOrThrow(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
  ): Promise<ProjectChangeRequest> {
    const row = await this.prisma.projectChangeRequest.findFirst({
      where: activeOnly({
        id: changeRequestId,
        companyId: ctx.companyId,
        projectId,
      }),
    });
    if (!row) {
      throw new NotFoundException('Change request not found');
    }
    return row;
  }

  private async generateChangeNumber(ctx: PmContext): Promise<string> {
    const count = await this.prisma.projectChangeRequest.count({
      where: activeOnly({ companyId: ctx.companyId }),
    });
    return `CR-${String(count + 1).padStart(5, '0')}`;
  }
}
