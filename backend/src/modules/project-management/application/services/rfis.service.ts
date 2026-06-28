import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { FolderContextType, Prisma, RfiStatus, ExternalReviewTriggerType } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateRfiDto,
  CreateRfiResponseDto,
  PmListQueryDto,
  UpdateRfiDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapRfi,
  mapRfiResponse,
  MappedRfi,
  MappedRfiResponse,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import {
  buildSourceEntitySummary,
  validateSourceEntity,
} from '../utils/source-entity.util';
import {
  enrichRowsWithUserDisplayNames,
  enrichWithUserDisplayNames,
} from '../utils/pm-user-names.util';
import { PM_RAISED_ASSIGNED_NAMES, PM_RESPONDED_BY_NAME } from '../utils/pm-user-name-fields.const';
import { DisciplineScopeService } from './discipline-scope.service';
import { DocumentNumberService } from './document-number.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';
import { EpcSubmittalRepository } from '../../infrastructure/repositories/epc-submittal.repository';

const RFI_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'title',
  'rfiNumber',
  'status',
  'dueDate',
  'dateRaised',
]);

@Injectable()
export class RfisService {
  private readonly logger = new Logger(RfisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
  ) {}

  /**
   * Returns a paginated list of RFIs for a project.
   */
  async listRfis(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedRfi>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = await this.buildRfiListWhere(ctx, projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      RFI_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.rfi.findMany({ where, skip, take, orderBy }),
      this.prisma.rfi.count({ where }),
    ]);

    const folderIds = await this.resolveRfiAttachmentFolderIds(
      ctx,
      projectId,
      rows,
    );
    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map((row) => ({
        ...mapRfi(row),
        attachmentFolderId: folderIds.get(row.id) ?? null,
      })),
      PM_RAISED_ASSIGNED_NAMES,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Returns a single RFI by id scoped to a project.
   */
  async getRfi(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
  ): Promise<MappedRfi> {
    const rfi = await this.getRfiOrThrow(projectId, rfiId);
    await this.assertRfiVisible(ctx, projectId, rfi);
    return this.enrichRfi(ctx, rfi);
  }

  /**
   * Creates an RFI with an auto-generated document number.
   */
  async createRfi(
    ctx: PmContext,
    projectId: string,
    dto: CreateRfiDto,
  ): Promise<MappedRfi> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }

    if (dto.taskDisciplineId) {
      await this.disciplineScopeService.assertDisciplineAccess(
        ctx,
        projectId,
        dto.taskDisciplineId,
      );
    }

    if (dto.sourceEntityType && dto.sourceEntityId) {
      await validateSourceEntity(
        this.prisma,
        projectId,
        dto.sourceEntityType,
        dto.sourceEntityId,
      );
    }

    const rfiNumber = await this.documentNumberService.getNextNumber(
      ctx,
      'RFI',
    );

    const rfi = await this.prisma.rfi.create({
      data: {
        projectId,
        raisedBy: ctx.userId,
        assignedTo: dto.assignedTo,
        taskDisciplineId: dto.taskDisciplineId,
        rfiNumber,
        title: dto.title,
        description: dto.description,
        discipline: dto.discipline,
        priority: dto.priority,
        dueDate: parseOptionalDate(dto.dueDate),
        dateRaised: this.todayDate(),
        sourceEntityType: dto.sourceEntityType,
        sourceEntityId: dto.sourceEntityId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichRfi(ctx, rfi);
  }

  /**
   * Updates an existing RFI scoped to a project.
   */
  async updateRfi(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
    dto: UpdateRfiDto,
  ): Promise<MappedRfi> {
    const existing = await this.getRfiOrThrow(projectId, rfiId);
    await this.assertRfiVisible(ctx, projectId, existing);

    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }

    if (dto.taskDisciplineId) {
      await this.disciplineScopeService.assertDisciplineAccess(
        ctx,
        projectId,
        dto.taskDisciplineId,
      );
    }

    if (dto.sourceEntityType && dto.sourceEntityId) {
      await validateSourceEntity(
        this.prisma,
        projectId,
        dto.sourceEntityType,
        dto.sourceEntityId,
      );
    }

    if (dto.status !== undefined) {
      const current = await this.prisma.rfi.findFirst({
        where: activeOnly({ id: rfiId, projectId }),
        select: { status: true },
      });
      const RFI_STATUS_TRANSITIONS: Record<string, string[]> = {
        DRAFT: ['SUBMITTED'],
        SUBMITTED: ['UNDER_REVIEW', 'DRAFT'],
        UNDER_REVIEW: ['ANSWERED', 'SUBMITTED'],
        ANSWERED: ['CLOSED', 'UNDER_REVIEW'],
        CLOSED: [],
      };
      if (dto.status !== current!.status) {
        const allowed = RFI_STATUS_TRANSITIONS[current!.status];
        if (!allowed?.includes(dto.status)) {
          throw new BadRequestException(
            `Invalid RFI status transition from ${current!.status} to ${dto.status}.`,
          );
        }
      }
    }

    const rfi = await this.prisma.rfi.update({
      where: { id: rfiId },
      data: {
        title: dto.title,
        description: dto.description,
        discipline: dto.discipline,
        priority: dto.priority,
        assignedTo: dto.assignedTo,
        taskDisciplineId: dto.taskDisciplineId,
        dueDate: parseOptionalDate(dto.dueDate),
        status: dto.status,
        sourceEntityType: dto.sourceEntityType,
        sourceEntityId: dto.sourceEntityId,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichRfi(ctx, rfi);
  }

  /**
   * Soft-deletes an RFI scoped to a project.
   */
  async deleteRfi(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
  ): Promise<void> {
    const rfi = await this.getRfiOrThrow(projectId, rfiId);
    await this.assertRfiVisible(ctx, projectId, rfi);
    await this.prisma.rfi.update({
      where: { id: rfiId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns all responses for an RFI.
   */
  async listRfiResponses(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
  ): Promise<MappedRfiResponse[]> {
    const rfi = await this.getRfiOrThrow(projectId, rfiId);
    await this.assertRfiVisible(ctx, projectId, rfi);

    const responses = await this.prisma.rfiResponse.findMany({
      where: { rfiId },
      orderBy: { respondedAt: 'asc' },
    });

    return enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      responses.map(mapRfiResponse),
      PM_RESPONDED_BY_NAME,
    );
  }

  /**
   * Adds a response to an RFI and marks it answered when applicable.
   */
  async addRfiResponse(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
    dto: CreateRfiResponseDto,
  ): Promise<MappedRfiResponse> {
    const rfi = await this.getRfiOrThrow(projectId, rfiId);
    await this.assertRfiVisible(ctx, projectId, rfi);
    this.assertCanRespondToRfi(ctx, rfi);

    const response = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rfiResponse.create({
        data: {
          rfiId,
          respondedBy: ctx.userId,
          responseText: dto.responseText,
        },
      });

      if (rfi.status !== RfiStatus.CLOSED) {
        await tx.rfi.update({
          where: { id: rfiId },
          data: {
            status: RfiStatus.ANSWERED,
            dateAnswered: this.todayDate(),
            updatedBy: ctx.userId,
          },
        });

        if (rfi.linkedDesignPackageId) {
          await this.epcSubmittalRepository.createLinkedEntityTrigger(tx, {
            companyId: ctx.companyId,
            projectId,
            triggerType: ExternalReviewTriggerType.RFI,
            sourceEntityType: 'RFI',
            sourceEntityId: rfiId,
            linkedDesignPackageId: rfi.linkedDesignPackageId,
            createdBy: ctx.userId,
          });
        }
      }

      return created;
    });

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapRfiResponse(response),
      PM_RESPONDED_BY_NAME,
    );
  }

  private async buildRfiListWhere(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<Prisma.RfiWhereInput> {
    const where: Prisma.RfiWhereInput = activeOnly({ projectId });

    const bypass = await this.disciplineScopeService.hasDisciplineScopeBypass(
      ctx,
      projectId,
    );
    if (!bypass) {
      const assignedIds =
        await this.disciplineScopeService.getAssignedDisciplineIds(
          ctx,
          projectId,
        );
      where.OR = [
        { taskDisciplineId: null },
        { taskDisciplineId: { in: assignedIds } },
        { raisedBy: ctx.userId },
        { assignedTo: ctx.userId },
      ];
    }

    if (query.status) {
      where.status = query.status as RfiStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { rfiNumber: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { discipline: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private async enrichRfi(
    ctx: PmContext,
    rfi: Parameters<typeof mapRfi>[0],
  ): Promise<MappedRfi> {
    let attachmentFolderId: string | null = null;

    try {
      const folder =
        await this.engineeringDocumentFolderService.ensureRfiFolder(
          ctx,
          rfi.projectId,
          rfi.id,
          rfi.rfiNumber,
        );
      attachmentFolderId = folder.id;
    } catch (error) {
      this.logger.warn(
        `RFI ${rfi.id} attachment folder could not be ensured`,
        error instanceof Error ? error.message : String(error),
      );
    }

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      {
        ...mapRfi(rfi),
        attachmentFolderId,
        sourceEntitySummary: await buildSourceEntitySummary(
          this.prisma,
          rfi.projectId,
          rfi.sourceEntityType,
          rfi.sourceEntityId,
        ),
      },
      PM_RAISED_ASSIGNED_NAMES,
    );
  }

  /**
   * Resolves attachment folder ids for a batch of RFIs using at most two
   * document-folder queries (lookup + optional createMany).
   */
  private async resolveRfiAttachmentFolderIds(
    ctx: PmContext,
    projectId: string,
    rfis: Array<{ id: string; rfiNumber: string }>,
  ): Promise<Map<string, string>> {
    const folderIds = new Map<string, string>();
    if (rfis.length === 0) {
      return folderIds;
    }

    try {
      const rfiIds = rfis.map((rfi) => rfi.id);
      const existingFolders = await this.prisma.documentFolder.findMany({
        where: activeOnly({
          companyId: ctx.companyId,
          contextType: FolderContextType.RFI,
          contextId: { in: rfiIds },
        }),
        select: { id: true, contextId: true },
      });

      for (const folder of existingFolders) {
        if (folder.contextId) {
          folderIds.set(folder.contextId, folder.id);
        }
      }

      const missingRfis = rfis.filter((rfi) => !folderIds.has(rfi.id));
      if (missingRfis.length === 0) {
        return folderIds;
      }

      const project = await this.prisma.project.findFirst({
        where: activeOnly({ id: projectId, companyId: ctx.companyId }),
        select: { id: true, projectCode: true, name: true },
      });
      if (!project) {
        return folderIds;
      }

      const projectFolder =
        await this.engineeringDocumentFolderService.ensureProjectFolder(
          ctx,
          project.id,
          project.projectCode,
          project.name,
        );

      const createRows = missingRfis.map((rfi) => {
        const folderId = randomUUID();
        const segment = this.toFolderSegment(rfi.rfiNumber);
        folderIds.set(rfi.id, folderId);
        return {
          id: folderId,
          companyId: ctx.companyId,
          parentId: projectFolder.id,
          name: segment,
          path: `${projectFolder.path}/rfis/${segment}`,
          contextType: FolderContextType.RFI,
          contextId: rfi.id,
          isSystem: true,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        };
      });

      await this.prisma.documentFolder.createMany({
        data: createRows,
        skipDuplicates: true,
      });
    } catch (error) {
      this.logger.warn(
        'RFI attachment folders could not be resolved for list',
        error instanceof Error ? error.message : String(error),
      );
    }

    return folderIds;
  }

  private toFolderSegment(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) {
      return 'untitled';
    }
    return trimmed.replace(/[/\\]+/g, '-');
  }

  private async assertRfiVisible(
    ctx: PmContext,
    projectId: string,
    rfi: {
      taskDisciplineId: string | null;
      raisedBy: string;
      assignedTo: string | null;
    },
  ): Promise<void> {
    const bypass = await this.disciplineScopeService.hasDisciplineScopeBypass(
      ctx,
      projectId,
    );
    if (
      bypass ||
      rfi.raisedBy === ctx.userId ||
      rfi.assignedTo === ctx.userId ||
      rfi.taskDisciplineId === null
    ) {
      return;
    }

    const assignedIds =
      await this.disciplineScopeService.getAssignedDisciplineIds(ctx, projectId);
    if (
      rfi.taskDisciplineId !== null &&
      assignedIds.includes(rfi.taskDisciplineId)
    ) {
      return;
    }

    throw new ForbiddenException('You do not have access to this RFI');
  }

  /**
   * Only the RFI assignee may post an official response.
   */
  private assertCanRespondToRfi(
    ctx: PmContext,
    rfi: { assignedTo: string | null; status: RfiStatus },
  ): void {
    if (rfi.status === RfiStatus.CLOSED) {
      throw new BadRequestException('Cannot respond to a closed RFI');
    }

    if (!rfi.assignedTo) {
      throw new ForbiddenException(
        'This RFI has no assigned designer — assign a designer before posting a response',
      );
    }

    if (rfi.assignedTo !== ctx.userId) {
      throw new ForbiddenException(
        'Only the assigned designer can respond to this RFI',
      );
    }
  }

  private async getRfiOrThrow(projectId: string, rfiId: string) {
    const rfi = await this.prisma.rfi.findFirst({
      where: activeOnly({ id: rfiId, projectId }),
    });
    if (!rfi) {
      throw new NotFoundException('RFI not found');
    }
    return rfi;
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

  private todayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
}
