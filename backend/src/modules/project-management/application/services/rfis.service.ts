import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  FolderContextType,
  Prisma,
  Rfi,
  RfiStatus,
  ExternalReviewTriggerType,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { formatDesignPackageFullCode } from '../../../../shared/discipline-number.util';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { subtaskRoleOr } from '../../domain/task-access-scope.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  CreateRfiDto,
  CreateRfiResponseDto,
  LinkRfiCrDto,
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
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import {
  buildSourceEntitySummary,
  validateSourceEntity,
} from '../utils/source-entity.util';
import {
  enrichRowsWithUserDisplayNames,
  enrichWithUserDisplayNames,
} from '../utils/pm-user-names.util';
import {
  PM_RAISED_ASSIGNED_NAMES,
  PM_RESPONDED_BY_NAME,
} from '../utils/pm-user-name-fields.const';
import { DisciplineScopeService } from './discipline-scope.service';
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

const RFI_ASSIGNED_EVENT = 'rfi.assigned';
const RFI_RESPONDED_EVENT = 'rfi.responded';
const RFI_CLOSED_EVENT = 'rfi.closed';

const DESIGN_PACKAGE_FULL_CODE_SELECT = {
  packageCode: true,
  subtaskIndex: true,
  taskDiscipline: {
    select: {
      disciplineIndex: true,
      task: {
        select: {
          overseasTaskNumber: true,
        },
      },
    },
  },
} as const;

export interface RfiSubtaskOption {
  id: string;
  packageCode: string;
  name: string;
  fullCode: string;
  designerUserId: string | null;
  designerName: string | null;
  siteRepresentativeUserId: string | null;
  siteRepresentativeName: string | null;
}

export interface RfiProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

export type MappedMyRfi = MappedRfi & {
  projectName: string;
  projectCode: string;
};

/**
 * Manages project RFIs - CRUD, responses, numbering, and notifications.
 */
@Injectable()
export class RfisService {
  private readonly logger = new Logger(RfisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
    private readonly permissionService: PermissionService,
    @Optional()
    private readonly notificationService?: NotificationService,
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
      await Promise.all(
        rows.map(async (row) => ({
          ...(await this.enrichRfiFields(ctx, row)),
          attachmentFolderId: folderIds.get(row.id) ?? null,
        })),
      ),
      PM_RAISED_ASSIGNED_NAMES,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-scoped RFIs relevant to the current user.
   */
  async listMyRfis(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyRfi>> {
    const where = this.buildMyListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      RFI_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.rfi.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.rfi.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => this.mapMyRfiRow(ctx, row)),
    );
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-wide RFIs (portfolio / admin users).
   */
  async listAllRfis(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyRfi>> {
    const where = this.buildCompanyListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      RFI_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.rfi.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.rfi.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map(async (row) => this.mapMyRfiRow(ctx, row)),
    );
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Distinct projects where the current user has relevant RFIs or FK roles.
   */
  async listMyRfiProjects(ctx: PmContext): Promise<RfiProjectOption[]> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    const isFullAccess = hasFullProjectDataAccess(roleNames);

    const packages = await this.prisma.designPackage.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        ...(isFullAccess
          ? {}
          : {
              OR: subtaskRoleOr(ctx.userId),
            }),
        taskDiscipline: {
          deletedAt: null,
          task: { deletedAt: null },
        },
      }),
      select: {
        taskDiscipline: {
          select: {
            task: {
              select: {
                project: {
                  select: { id: true, projectCode: true, name: true },
                },
              },
            },
          },
        },
      },
    });

    const byId = new Map<string, RfiProjectOption>();
    for (const pkg of packages) {
      const project = pkg.taskDiscipline.task.project;
      if (!byId.has(project.id)) {
        byId.set(project.id, {
          id: project.id,
          projectCode: project.projectCode,
          name: project.name,
        });
      }
    }

    return [...byId.values()].sort((a, b) =>
      a.projectCode.localeCompare(b.projectCode),
    );
  }

  /**
   * Returns a single RFI by id scoped to a project.
   */
  async getRfi(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
  ): Promise<MappedRfi> {
    const rfi = await this.getRfiOrThrow(ctx, projectId, rfiId);
    await this.assertCanAccessRfi(ctx, rfi, 'view');
    return this.enrichRfi(ctx, rfi);
  }

  /**
   * Creates an RFI with package-based numbering and designer auto-assignment.
   */
  async createRfi(
    ctx: PmContext,
    projectId: string,
    dto: CreateRfiDto,
  ): Promise<MappedRfi> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    await this.assertCanAccessRfi(
      ctx,
      {
        linkedDesignPackageId: dto.linkedDesignPackageId,
        raisedBy: ctx.userId,
        assignedTo: null,
      },
      'create',
    );

    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: dto.linkedDesignPackageId,
        companyId: ctx.companyId,
      }),
      select: {
        subtaskIndex: true,
        designerUserId: true,
        siteRepresentativeUserId: true,
        taskDisciplineId: true,
        taskDiscipline: {
          select: {
            disciplineIndex: true,
            task: {
              select: {
                projectId: true,
                overseasTaskNumber: true,
              },
            },
          },
        },
      },
    });
    if (!pkg) {
      throw new NotFoundException('Subtask not found');
    }
    if (pkg.taskDiscipline.task.projectId !== projectId) {
      throw new NotFoundException('Subtask not found');
    }

    const assignedTo =
      dto.directTo === 'SITE_TEAM' && pkg.siteRepresentativeUserId
        ? pkg.siteRepresentativeUserId
        : pkg.designerUserId;

    if (dto.sourceEntityType && dto.sourceEntityId) {
      await validateSourceEntity(
        this.prisma,
        projectId,
        dto.sourceEntityType,
        dto.sourceEntityId,
      );
    }

    const count = await this.prisma.rfi.count({
      where: {
        linkedDesignPackageId: dto.linkedDesignPackageId,
        deletedAt: null,
      },
    });
    const seq = String(count + 1).padStart(3, '0');
    const fullCode = formatDesignPackageFullCode(
      pkg.taskDiscipline.task.overseasTaskNumber,
      pkg.taskDiscipline.disciplineIndex,
      pkg.subtaskIndex,
    );
    const rfiNumber = `RFI-${fullCode}-${seq}`;

    const rfi = await this.prisma.rfi.create({
      data: {
        companyId: ctx.companyId,
        projectId,
        raisedBy: ctx.userId,
        assignedTo,
        taskDisciplineId: pkg.taskDisciplineId,
        linkedDesignPackageId: dto.linkedDesignPackageId,
        rfiNumber,
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        rfiSource: dto.rfiSource,
        dueDate: parseOptionalDate(dto.dueDate),
        dateRaised: this.todayDate(),
        sourceEntityType: dto.sourceEntityType,
        sourceEntityId: dto.sourceEntityId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await this.sendRfiAssignedNotification(ctx, rfi);

    return this.enrichRfi(ctx, rfi);
  }

  /**
   * Previews the next RFI number for a design package.
   */
  async previewNextRfiNumber(
    ctx: PmContext,
    packageId: string,
  ): Promise<{ rfiNumber: string }> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: packageId, companyId: ctx.companyId }),
      select: DESIGN_PACKAGE_FULL_CODE_SELECT,
    });
    if (!pkg) {
      throw new NotFoundException('Subtask not found');
    }

    const existingCount = await this.prisma.rfi.count({
      where: {
        linkedDesignPackageId: packageId,
        deletedAt: null,
      },
    });
    const seq = String(existingCount + 1).padStart(3, '0');
    const fullCode = formatDesignPackageFullCode(
      pkg.taskDiscipline.task.overseasTaskNumber,
      pkg.taskDiscipline.disciplineIndex,
      pkg.subtaskIndex,
    );
    return { rfiNumber: `RFI-${fullCode}-${seq}` };
  }

  /**
   * Lists subtasks the current user may raise an RFI against (FK roles only).
   */
  async listEligibleSubtasks(
    ctx: PmContext,
    projectId: string,
  ): Promise<RfiSubtaskOption[]> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    const isFullAccess = hasFullProjectDataAccess(roleNames);

    const packages = await this.prisma.designPackage.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        taskDiscipline: {
          deletedAt: null,
          task: { projectId, deletedAt: null },
        },
        ...(isFullAccess
          ? {}
          : {
              OR: subtaskRoleOr(ctx.userId),
            }),
      }),
      select: {
        id: true,
        name: true,
        designerUserId: true,
        designerUser: {
          select: {
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        },
        siteRepresentativeUserId: true,
        siteRepresentative: {
          select: {
            firstName: true,
            lastName: true,
            chineseName: true,
            email: true,
          },
        },
        ...DESIGN_PACKAGE_FULL_CODE_SELECT,
      },
      orderBy: { packageCode: 'asc' },
    });

    return packages.map((pkg) => ({
      id: pkg.id,
      packageCode: pkg.packageCode,
      name: pkg.name,
      fullCode: formatDesignPackageFullCode(
        pkg.taskDiscipline.task.overseasTaskNumber,
        pkg.taskDiscipline.disciplineIndex,
        pkg.subtaskIndex,
      ),
      designerUserId: pkg.designerUserId,
      designerName: pkg.designerUser
        ? formatUserDisplayName(pkg.designerUser)
        : null,
      siteRepresentativeUserId: pkg.siteRepresentativeUserId,
      siteRepresentativeName: pkg.siteRepresentative
        ? formatUserDisplayName(pkg.siteRepresentative)
        : null,
    }));
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
    const existing = await this.getRfiOrThrow(ctx, projectId, rfiId);
    await this.assertCanAccessRfi(ctx, existing, 'edit');

    if (dto.linkedDesignPackageId) {
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({
          id: dto.linkedDesignPackageId,
          companyId: ctx.companyId,
        }),
        select: {
          taskDisciplineId: true,
          designerUserId: true,
          taskDiscipline: { select: { task: { select: { projectId: true } } } },
        },
      });
      if (!pkg || pkg.taskDiscipline.task.projectId !== projectId) {
        throw new NotFoundException('Subtask not found');
      }
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
      const RFI_STATUS_TRANSITIONS: Record<string, string[]> = {
        DRAFT: ['SUBMITTED'],
        SUBMITTED: ['UNDER_REVIEW', 'DRAFT'],
        UNDER_REVIEW: ['ANSWERED', 'SUBMITTED'],
        ANSWERED: ['CLOSED', 'UNDER_REVIEW'],
        CLOSED: [],
      };
      if (dto.status !== existing.status) {
        const allowed = RFI_STATUS_TRANSITIONS[existing.status];
        if (!allowed?.includes(dto.status)) {
          throw new BadRequestException(
            `Invalid RFI status transition from ${existing.status} to ${dto.status}.`,
          );
        }
      }
    }

    const rfi = await this.prisma.rfi.update({
      where: { id: rfiId },
      data: {
        title: dto.title,
        description: dto.description,
        priority: dto.priority,
        rfiSource: dto.rfiSource,
        linkedDesignPackageId: dto.linkedDesignPackageId,
        dueDate: parseOptionalDate(dto.dueDate),
        status: dto.status,
        sourceEntityType: dto.sourceEntityType,
        sourceEntityId: dto.sourceEntityId,
        updatedBy: ctx.userId,
      },
    });

    if (
      dto.status === RfiStatus.CLOSED &&
      existing.status !== RfiStatus.CLOSED
    ) {
      await this.sendRfiClosedNotification(ctx, rfi);
    }

    return this.enrichRfi(ctx, rfi);
  }

  /**
   * Closes an answered RFI. Raiser or full-access users only.
   */
  async closeRfi(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
  ): Promise<MappedRfi> {
    const existing = await this.getRfiOrThrow(ctx, projectId, rfiId);

    if (existing.status !== RfiStatus.ANSWERED) {
      throw new BadRequestException(
        'RFI must be answered before it can be closed',
      );
    }

    const roleNames = await this.getRoleNames(ctx);
    if (
      existing.raisedBy !== ctx.userId &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the RFI raiser or a full-access user can close this RFI',
      );
    }

    const rfi = await this.prisma.rfi.update({
      where: { id: rfiId },
      data: {
        status: RfiStatus.CLOSED,
        updatedBy: ctx.userId,
      },
    });

    await this.sendRfiClosedNotification(ctx, rfi);

    return this.enrichRfi(ctx, rfi);
  }

  /**
   * Reopens a closed RFI back to SUBMITTED. Raiser or full-access users only.
   */
  async reopenRfi(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
  ): Promise<MappedRfi> {
    const existing = await this.getRfiOrThrow(ctx, projectId, rfiId);

    if (existing.status !== RfiStatus.CLOSED) {
      throw new BadRequestException('Only a closed RFI can be reopened');
    }

    const roleNames = await this.getRoleNames(ctx);
    if (
      existing.raisedBy !== ctx.userId &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the RFI raiser or a full-access user can reopen this RFI',
      );
    }

    const rfi = await this.prisma.rfi.update({
      where: { id: rfiId },
      data: {
        status: RfiStatus.SUBMITTED,
        dateAnswered: null,
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
    const rfi = await this.getRfiOrThrow(ctx, projectId, rfiId);
    await this.assertRfiVisible(ctx, projectId, rfi);
    await this.prisma.rfi.update({
      where: { id: rfiId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Links an approved/created change request to an RFI.
   */
  async linkChangeRequest(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
    dto: LinkRfiCrDto,
  ): Promise<MappedRfi> {
    const rfi = await this.getRfiOrThrow(ctx, projectId, rfiId);
    await this.assertCanAccessRfi(ctx, rfi, 'edit');

    const cr = await this.prisma.projectChangeRequest.findFirst({
      where: activeOnly({
        id: dto.crId,
        companyId: ctx.companyId,
        projectId,
      }),
      select: {
        id: true,
        linkedDesignPackageId: true,
      },
    });
    if (!cr) {
      throw new NotFoundException('Change request not found');
    }
    if (
      rfi.linkedDesignPackageId &&
      cr.linkedDesignPackageId &&
      cr.linkedDesignPackageId !== rfi.linkedDesignPackageId
    ) {
      throw new BadRequestException(
        'Change request must belong to the same subtask as this RFI',
      );
    }

    const existingIds = [
      ...new Set([
        ...(rfi.linkedCrIds ?? []),
        ...(rfi.linkedCrId ? [rfi.linkedCrId] : []),
      ]),
    ];
    const linkedCrIds = existingIds.includes(cr.id)
      ? existingIds
      : [...existingIds, cr.id];

    const updated = await this.prisma.rfi.update({
      where: { id: rfiId },
      data: {
        linkedCrId: cr.id,
        linkedCrIds,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichRfi(ctx, updated);
  }

  /**
   * Returns all responses for an RFI.
   */
  async listRfiResponses(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
  ): Promise<MappedRfiResponse[]> {
    const rfi = await this.getRfiOrThrow(ctx, projectId, rfiId);
    await this.assertCanAccessRfi(ctx, rfi, 'view');

    const responses = await this.prisma.rfiResponse.findMany({
      where: { rfiId },
      include: {
        responseDocument: { select: { name: true } },
      },
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
    const rfi = await this.getRfiOrThrow(ctx, projectId, rfiId);
    await this.assertCanAccessRfi(ctx, rfi, 'respond');

    if (rfi.status === RfiStatus.CLOSED) {
      throw new BadRequestException('Cannot respond to a closed RFI');
    }

    const roleNames = await this.getRoleNames(ctx);
    const isAssignee = ctx.userId === rfi.assignedTo;
    const isRaiser = ctx.userId === rfi.raisedBy;
    const fullAccess = hasFullProjectDataAccess(roleNames);
    if (!isAssignee && !isRaiser && !fullAccess) {
      throw new ForbiddenException(
        'Only the raiser, assignee, or a project administrator can respond to this RFI',
      );
    }

    const responseText = dto.responseText.trim();
    if (!responseText) {
      throw new BadRequestException('Response text cannot be empty.');
    }

    if (dto.responseDocumentId) {
      await this.assertResponseDocumentBelongsToRfi(
        ctx,
        rfiId,
        dto.responseDocumentId,
      );
    }

    const shouldMarkAnswered = rfi.status !== RfiStatus.ANSWERED;

    const response = await this.prisma.$transaction(async (tx) => {
      const created = await tx.rfiResponse.create({
        data: {
          rfiId,
          respondedBy: ctx.userId,
          responseText,
          responseDocumentId: dto.responseDocumentId ?? null,
        },
        include: {
          responseDocument: { select: { name: true } },
        },
      });

      if (shouldMarkAnswered) {
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

    await this.sendRfiRespondedNotification(
      ctx,
      rfi,
      isAssignee,
      isRaiser,
      fullAccess,
    );

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapRfiResponse(response),
      PM_RESPONDED_BY_NAME,
    );
  }

  private buildMyListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Prisma.RfiWhereInput {
    const assignedPackageWhere: Prisma.DesignPackageWhereInput = activeOnly({
      companyId: ctx.companyId,
      OR: subtaskRoleOr(ctx.userId),
    });

    const where: Prisma.RfiWhereInput = activeOnly({
      companyId: ctx.companyId,
      OR: [
        { raisedBy: ctx.userId },
        { assignedTo: ctx.userId },
        { linkedDesignPackage: assignedPackageWhere },
      ],
    });

    if (query.projectId) {
      where.projectId = query.projectId;
    }

    const statusFilter = parseStatusFilter<RfiStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }
    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { rfiNumber: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private buildCompanyListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Prisma.RfiWhereInput {
    const where: Prisma.RfiWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

    if (query.projectId) {
      where.projectId = query.projectId;
    }

    const statusFilter = parseStatusFilter<RfiStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }
    if (query.priority) {
      where.priority = query.priority;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { rfiNumber: { contains: term, mode: 'insensitive' } },
        { title: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        {
          project: {
            name: { contains: term, mode: 'insensitive' },
          },
        },
        {
          project: {
            projectCode: { contains: term, mode: 'insensitive' },
          },
        },
      ];
    }

    return where;
  }

  private async buildRfiListWhere(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<Prisma.RfiWhereInput> {
    const where: Prisma.RfiWhereInput = activeOnly({
      companyId: ctx.companyId,
      projectId,
    });

    const roleNames = await this.getRoleNames(ctx);
    if (!hasFullProjectDataAccess(roleNames)) {
      const assignedPackageWhere: Prisma.DesignPackageWhereInput = activeOnly({
        companyId: ctx.companyId,
        OR: subtaskRoleOr(ctx.userId),
      });
      where.OR = [
        { raisedBy: ctx.userId },
        { assignedTo: ctx.userId },
        { linkedDesignPackage: assignedPackageWhere },
      ];
    }

    const statusFilter = parseStatusFilter<RfiStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
    }
    if (query.priority) {
      where.priority = query.priority;
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

  /**
   * Allows full-access / RBAC module perms / package FK / raiser / assignee.
   */
  private async assertCanAccessRfi(
    ctx: PmContext,
    rfi: {
      linkedDesignPackageId?: string | null;
      raisedBy?: string | null;
      assignedTo?: string | null;
    },
    action: 'view' | 'create' | 'edit' | 'respond',
  ): Promise<void> {
    const roleNames = await this.getRoleNames(ctx);
    if (hasFullProjectDataAccess(roleNames)) {
      return;
    }

    const pmPerms = await this.getModulePermissions(ctx, 'rfis');
    if (action === 'view' && pmPerms.canView) {
      return;
    }
    if (action === 'create' && pmPerms.canCreate) {
      return;
    }
    if (action === 'edit' && pmPerms.canEdit) {
      return;
    }
    if (action === 'respond' && pmPerms.canEdit) {
      return;
    }

    if (rfi.linkedDesignPackageId) {
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({
          id: rfi.linkedDesignPackageId,
          companyId: ctx.companyId,
          OR: subtaskRoleOr(ctx.userId),
        }),
        select: { id: true },
      });
      if (pkg) {
        return;
      }
    }

    if (rfi.raisedBy === ctx.userId || rfi.assignedTo === ctx.userId) {
      return;
    }

    throw new ForbiddenException('You do not have access to this RFI');
  }

  private async getRoleNames(ctx: PmContext): Promise<string[]> {
    return this.permissionService.getUserRoleNames(ctx.userId, ctx.companyId);
  }

  private async getModulePermissions(
    ctx: PmContext,
    module: string,
  ): Promise<{
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
    canExport: boolean;
  }> {
    return this.permissionService.getUserModulePermissions(
      ctx.userId,
      ctx.companyId,
      module,
    );
  }

  private async mapMyRfiRow(
    ctx: PmContext,
    row: Rfi & {
      project: { id: string; name: string; projectCode: string };
    },
  ): Promise<MappedMyRfi> {
    const enriched = await this.enrichRfi(ctx, row);
    return {
      ...enriched,
      projectName: row.project.name,
      projectCode: row.project.projectCode,
    };
  }

  private async enrichRfi(ctx: PmContext, rfi: Rfi): Promise<MappedRfi> {
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

    const fields = await this.enrichRfiFields(ctx, rfi);

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      {
        ...fields,
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

  private async enrichRfiFields(
    ctx: PmContext,
    rfi: Rfi,
  ): Promise<MappedRfi> {
    const mapped = mapRfi(rfi);
    let linkedDesignPackage: MappedRfi['linkedDesignPackage'] = null;

    if (rfi.linkedDesignPackageId) {
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({
          id: rfi.linkedDesignPackageId,
          companyId: ctx.companyId,
        }),
        select: {
          id: true,
          name: true,
          ...DESIGN_PACKAGE_FULL_CODE_SELECT,
        },
      });
      if (pkg) {
        linkedDesignPackage = {
          id: pkg.id,
          packageCode: pkg.packageCode,
          name: pkg.name,
          fullCode: formatDesignPackageFullCode(
            pkg.taskDiscipline.task.overseasTaskNumber,
            pkg.taskDiscipline.disciplineIndex,
            pkg.subtaskIndex,
          ),
        };
      }
    }

    const linkedCrIdList = [
      ...new Set([
        ...(rfi.linkedCrIds ?? []),
        ...(rfi.linkedCrId ? [rfi.linkedCrId] : []),
      ]),
    ];

    let linkedCrs: NonNullable<MappedRfi['linkedCrs']> = [];
    if (linkedCrIdList.length > 0) {
      const crRows = await this.prisma.projectChangeRequest.findMany({
        where: activeOnly({
          id: { in: linkedCrIdList },
          companyId: ctx.companyId,
        }),
        select: {
          id: true,
          changeNumber: true,
          title: true,
          status: true,
        },
      });
      const byId = new Map(crRows.map((row) => [row.id, row]));
      linkedCrs = linkedCrIdList
        .map((id) => byId.get(id))
        .filter((row): row is NonNullable<typeof row> => row != null)
        .map((row) => ({
          id: row.id,
          changeNumber: row.changeNumber,
          title: row.title,
          status: row.status,
        }));
    }

    return {
      ...mapped,
      linkedDesignPackage,
      linkedCrs,
      linkedCrNumber: linkedCrs[0]?.changeNumber ?? null,
      linkedCrId: linkedCrs[linkedCrs.length - 1]?.id ?? rfi.linkedCrId,
      linkedCrIds: linkedCrIdList,
    };
  }

  private async sendRfiAssignedNotification(
    ctx: PmContext,
    rfi: Rfi,
  ): Promise<void> {
    if (
      !this.notificationService ||
      !rfi.assignedTo ||
      rfi.assignedTo === rfi.createdBy
    ) {
      return;
    }

    const raisedByName = await this.resolveUserName(ctx, rfi.raisedBy);
    const link = `/projects/${rfi.projectId}/rfis`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: rfi.assignedTo,
          eventType: RFI_ASSIGNED_EVENT,
          subject: `RFI assigned to you - ${rfi.rfiNumber}`,
          body: `${raisedByName} raised RFI ${rfi.rfiNumber} and assigned it to you for response.`,
          variables: {
            projectId: rfi.projectId,
            rfiId: rfi.id,
            rfiNumber: rfi.rfiNumber,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'RFI assigned notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async sendRfiRespondedNotification(
    ctx: PmContext,
    rfi: Rfi,
    isAssignee: boolean,
    isRaiser: boolean,
    fullAccess: boolean,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const recipientIds = new Set<string>();
    if (isAssignee && rfi.raisedBy) {
      recipientIds.add(rfi.raisedBy);
    } else if (isRaiser && rfi.assignedTo) {
      recipientIds.add(rfi.assignedTo);
    } else if (fullAccess) {
      if (rfi.raisedBy) {
        recipientIds.add(rfi.raisedBy);
      }
      if (rfi.assignedTo) {
        recipientIds.add(rfi.assignedTo);
      }
    }

    recipientIds.delete(ctx.userId);
    if (recipientIds.size === 0) {
      return;
    }

    const responderName = await this.resolveUserName(ctx, ctx.userId);
    const link = `/projects/${rfi.projectId}/rfis`;
    const variables = {
      projectId: rfi.projectId,
      rfiId: rfi.id,
      rfiNumber: rfi.rfiNumber,
      link,
    };

    for (const recipientId of recipientIds) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType: RFI_RESPONDED_EVENT,
            subject: `Response received - ${rfi.rfiNumber}`,
            body: `${responderName} responded to RFI ${rfi.rfiNumber}.`,
            variables,
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'RFI responded notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async sendRfiClosedNotification(
    ctx: PmContext,
    rfi: Rfi,
  ): Promise<void> {
    if (
      !this.notificationService ||
      !rfi.assignedTo ||
      rfi.assignedTo === ctx.userId
    ) {
      return;
    }

    const closedByName = await this.resolveUserName(ctx, ctx.userId);
    const link = `/projects/${rfi.projectId}/rfis`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: rfi.assignedTo,
          eventType: RFI_CLOSED_EVENT,
          subject: `RFI closed - ${rfi.rfiNumber}`,
          body: `RFI ${rfi.rfiNumber} has been closed by ${closedByName}.`,
          variables: {
            projectId: rfi.projectId,
            rfiId: rfi.id,
            rfiNumber: rfi.rfiNumber,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'RFI closed notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async resolveUserName(
    ctx: PmContext,
    userId: string,
  ): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: {
        firstName: true,
        lastName: true,
        chineseName: true,
        email: true,
      },
    });
    return user ? formatUserDisplayName(user) : userId;
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
   * Ensures the response attachment document lives in this RFI's folder.
   */
  private async assertResponseDocumentBelongsToRfi(
    ctx: PmContext,
    rfiId: string,
    documentId: string,
  ): Promise<void> {
    const folder =
      await this.engineeringDocumentFolderService.findEntityFolder(
        ctx,
        FolderContextType.RFI,
        rfiId,
      );
    if (!folder) {
      throw new BadRequestException(
        'RFI has no attachment folder for response files',
      );
    }

    const document = await this.prisma.document.findFirst({
      where: activeOnly({
        id: documentId,
        companyId: ctx.companyId,
        folderId: folder.id,
      }),
      select: { id: true },
    });
    if (!document) {
      throw new BadRequestException(
        'Response attachment must be a document in this RFI folder',
      );
    }
  }

  private async getRfiOrThrow(
    ctx: PmContext,
    projectId: string,
    rfiId: string,
  ): Promise<Rfi> {
    const rfi = await this.prisma.rfi.findFirst({
      where: activeOnly({
        id: rfiId,
        projectId,
        companyId: ctx.companyId,
      }),
    });
    if (!rfi) {
      throw new NotFoundException('RFI not found');
    }
    return rfi;
  }

  private todayDate(): Date {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }
}
