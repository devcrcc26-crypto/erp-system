import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  DesignPackageProjectedStatus,
  DesignPackageStatus,
  EdvStatus,
  Prisma,
  ProjectChangeRequest,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
  ReviewSessionStatus,
} from '@prisma/client';
import { formatDesignPackageFullCode } from '../../../../shared/discipline-number.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { subtaskRoleOr } from '../../domain/task-access-scope.util';
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
  AffectedEdvSnapshotItem,
  mapProjectChangeRequest,
  MappedProjectChangeRequest,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import {
  buildSourceEntitySummary,
  validateSourceEntity,
} from '../utils/source-entity.util';
import { PrismaTx } from '../../infrastructure/repositories/epc-workflow.repository';
import { EpcReviewRepository } from '../../infrastructure/repositories/epc-review.repository';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';

const CR_APPROVED_REVISION_REQUIRED_EVENT =
  'change_request.approved_revision_required';
const CR_APPROVED_CREATOR_EVENT = 'change_request.approved_creator';

const CHANGE_REQUEST_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'changeNumber',
  'title',
  'status',
]);

const CHANGE_REQUEST_APPROVABLE_STATUSES = new Set<string>([
  ProjectChangeRequestStatus.SUBMITTED,
  'UNDER_REVIEW',
]);

export interface CurrentEdvOption {
  id: string;
  title: string;
  revisionLabel: string;
  status: string;
  display: string;
}

export interface CrSubtaskOption {
  id: string;
  packageCode: string;
  name: string;
  fullCode: string;
}

export interface CrProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

export type MappedMyChangeRequest = MappedProjectChangeRequest & {
  projectName: string;
  projectCode: string;
};

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

/**
 * Manages project change requests - CRUD, submit/recall, and approval side-effects.
 */
@Injectable()
export class ProjectChangeRequestService {
  private readonly logger = new Logger(ProjectChangeRequestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly permissionService: PermissionService,
    private readonly epcReviewRepository: EpcReviewRepository,
    @Optional()
    private readonly notificationService?: NotificationService,
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
      await Promise.all(rows.map((row) => this.enrichChangeRequest(row))),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Company-scoped change requests relevant to the current user.
   */
  async listMyChangeRequests(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyChangeRequest>> {
    const where = this.buildMyListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      CHANGE_REQUEST_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.projectChangeRequest.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          linkedDesignPackage: {
            select: { id: true, packageCode: true, name: true },
          },
        },
      }),
      this.prisma.projectChangeRequest.count({ where }),
    ]);

    const data = rows.map((row) => this.mapMyChangeRequestRow(row));
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-wide change requests (portfolio / admin users).
   */
  async listAllChangeRequests(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyChangeRequest>> {
    const where = this.buildCompanyListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      CHANGE_REQUEST_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.projectChangeRequest.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
          linkedDesignPackage: {
            select: { id: true, packageCode: true, name: true },
          },
        },
      }),
      this.prisma.projectChangeRequest.count({ where }),
    ]);

    const data = rows.map((row) => this.mapMyChangeRequestRow(row));
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-scoped projects where the current user has at least one CR-eligible
   * subtask with reviewable documents.
   */
  async listMyChangeRequestProjects(
    ctx: PmContext,
  ): Promise<CrProjectOption[]> {
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
          task: {
            deletedAt: null,
            project: {
              deletedAt: null,
            },
          },
        },
        ...(isFullAccess
          ? {}
          : {
              OR: subtaskRoleOr(ctx.userId),
            }),
        items: {
          some: {
            companyId: ctx.companyId,
            engineeringDocumentVersion: {
              isCurrent: true,
              deletedAt: null,
              status: { not: EdvStatus.DRAFT },
            },
          },
        },
      }),
      select: {
        taskDiscipline: {
          select: {
            task: {
              select: {
                project: {
                  select: {
                    id: true,
                    projectCode: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
      orderBy: {
        taskDiscipline: {
          task: {
            project: {
              projectCode: 'asc',
            },
          },
        },
      },
    });

    return Array.from(
      new Map(
        packages.map((pkg) => {
          const project = pkg.taskDiscipline.task.project;
          return [
            project.id,
            {
              id: project.id,
              projectCode: project.projectCode,
              name: project.name,
            },
          ];
        }),
      ).values(),
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
    return this.enrichChangeRequest(row);
  }

  /**
   * Creates a change request in DRAFT with package scope, EDV snapshot, and folder.
   */
  async createChangeRequest(
    ctx: PmContext,
    projectId: string,
    dto: CreateChangeRequestDto,
  ): Promise<MappedProjectChangeRequest> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: dto.linkedDesignPackageId,
        companyId: ctx.companyId,
      }),
      select: {
        id: true,
        designerUserId: true,
        supportingDesignerUserId: true,
        reviewerUserId: true,
        disciplinaryLeaderUserId: true,
        deptDeputyChiefUserId: true,
        instituteChiefUserId: true,
        ...DESIGN_PACKAGE_FULL_CODE_SELECT,
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

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    const isFullAccess = hasFullProjectDataAccess(roleNames);
    const assignedUserIds = [
      pkg.designerUserId,
      pkg.supportingDesignerUserId,
      pkg.reviewerUserId,
      pkg.disciplinaryLeaderUserId,
      pkg.deptDeputyChiefUserId,
      pkg.instituteChiefUserId,
    ].filter((id): id is string => Boolean(id));

    if (!isFullAccess && !assignedUserIds.includes(ctx.userId)) {
      throw new ForbiddenException('You are not assigned to this subtask');
    }

    await this.assertPackageHasReviewableEdvs(
      ctx.companyId,
      dto.linkedDesignPackageId,
    );

    const originEntityId = this.resolveOriginEntityId(dto);
    if (dto.sourceEntityType && originEntityId) {
      await validateSourceEntity(
        this.prisma,
        projectId,
        dto.sourceEntityType,
        originEntityId,
      );
    }

    const { affectedEdvSnapshot } = await this.validateAffectedEdvs(
      ctx.companyId,
      dto.linkedDesignPackageId,
      dto.affectedEdvIds,
    );

    const existingCount = await this.prisma.projectChangeRequest.count({
      where: {
        linkedDesignPackageId: dto.linkedDesignPackageId,
        deletedAt: null,
      },
    });
    const seq = String(existingCount + 1).padStart(3, '0');
    const fullCode = formatDesignPackageFullCode(
      pkg.taskDiscipline.task.overseasTaskNumber,
      pkg.taskDiscipline.disciplineIndex,
      pkg.subtaskIndex,
    );
    const changeNumber = `CR-${fullCode}-${seq}`;

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.projectChangeRequest.create({
        data: {
          companyId: ctx.companyId,
          projectId,
          changeNumber,
          title: dto.title,
          description: dto.description,
          status: ProjectChangeRequestStatus.DRAFT,
          changeReason: dto.changeReason,
          linkedDesignPackageId: dto.linkedDesignPackageId,
          affectedEdvIds: dto.affectedEdvIds,
          affectedEdvSnapshot:
            affectedEdvSnapshot as unknown as Prisma.InputJsonValue,
          sourceType: dto.sourceType ?? ProjectChangeRequestSource.MANUAL,
          sourceEntityId: dto.sourceEntityId,
          originEntityType: dto.sourceEntityType,
          originEntityId,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      const folder =
        await this.engineeringDocumentFolderService.ensureChangeRequestFolder(
          ctx,
          projectId,
          created.id,
          created.changeNumber,
        );

      return tx.projectChangeRequest.update({
        where: { id: created.id },
        data: {
          attachmentFolderId: folder.id,
          updatedBy: ctx.userId,
        },
      });
    });

    return this.enrichChangeRequest(row);
  }

  /**
   * Submits a DRAFT change request to the subtask Discipline Lead.
   */
  async submitChangeRequest(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
  ): Promise<MappedProjectChangeRequest> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const cr = await this.getChangeRequestOrThrow(ctx, projectId, changeRequestId);

    if (cr.status !== ProjectChangeRequestStatus.DRAFT) {
      throw new BadRequestException('Only DRAFT CRs can be submitted');
    }

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (
      cr.createdBy !== ctx.userId &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException();
    }

    if (!cr.linkedDesignPackageId) {
      throw new BadRequestException(
        'Change request must be linked to a subtask before submit',
      );
    }
    if (!cr.changeReason || cr.affectedEdvIds.length === 0 || !cr.title.trim()) {
      throw new BadRequestException(
        'Title, change reason, and affected documents are required to submit',
      );
    }

    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        id: cr.linkedDesignPackageId,
        companyId: ctx.companyId,
      }),
      select: { disciplinaryLeaderUserId: true },
    });

    const row = await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: ProjectChangeRequestStatus.SUBMITTED,
        assignedTo: pkg?.disciplinaryLeaderUserId ?? null,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichChangeRequest(row);
  }

  /**
   * Recalls a SUBMITTED change request back to DRAFT (creator only).
   */
  async recallChangeRequest(
    ctx: PmContext,
    projectId: string,
    changeRequestId: string,
  ): Promise<MappedProjectChangeRequest> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);
    const cr = await this.getChangeRequestOrThrow(ctx, projectId, changeRequestId);

    if (cr.status !== ProjectChangeRequestStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED CRs can be recalled');
    }
    if (cr.createdBy !== ctx.userId) {
      throw new ForbiddenException();
    }

    const row = await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: ProjectChangeRequestStatus.DRAFT,
        assignedTo: null,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichChangeRequest(row);
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

    const originEntityId = this.resolveOriginEntityId(dto);
    if (dto.sourceEntityType && originEntityId) {
      await validateSourceEntity(
        this.prisma,
        projectId,
        dto.sourceEntityType,
        originEntityId,
      );
    }

    const row = await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: {
        title: dto.title,
        description: dto.description,
        status: dto.status,
        originEntityType: dto.sourceEntityType,
        originEntityId,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichChangeRequest(row);
  }

  /**
   * Approves a change request: voids active review sessions, marks affected EDVs
   * non-current, and reopens the linked subtask for designer revision.
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

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (
      existing.assignedTo !== ctx.userId &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the Discipline Lead can approve this CR',
      );
    }

    if (existing.status !== ProjectChangeRequestStatus.SUBMITTED) {
      throw new BadRequestException('Only SUBMITTED CRs can be approved');
    }

    this.assertChangeRequestApprovable(existing.status);

    const row = await this.prisma.$transaction(async (tx) => {
      if (existing.linkedDesignPackageId) {
        const activeSessions = await tx.reviewSession.findMany({
          where: {
            designPackageId: existing.linkedDesignPackageId,
            status: ReviewSessionStatus.ACTIVE,
            deletedAt: null,
          },
          select: { id: true },
        });

        for (const session of activeSessions) {
          await this.epcReviewRepository.closeSessionAsSuperseded(
            tx,
            session.id,
            `Superseded by ${existing.changeNumber}`,
            ctx.userId,
          );
        }
      }

      if (existing.affectedEdvIds.length > 0) {
        await tx.engineeringDocumentVersion.updateMany({
          where: {
            id: { in: existing.affectedEdvIds },
            deletedAt: null,
          },
          data: {
            isCurrent: false,
            updatedBy: ctx.userId,
          },
        });
      }

      if (existing.linkedDesignPackageId) {
        await tx.designPackage.update({
          where: { id: existing.linkedDesignPackageId },
          data: {
            packageStatus: DesignPackageStatus.OPEN,
            projectedStatus: DesignPackageProjectedStatus.IN_PROGRESS,
            packageClosedAt: null,
            packageClosedBy: null,
            updatedBy: ctx.userId,
          },
        });
      }

      return tx.projectChangeRequest.update({
        where: { id: changeRequestId },
        data: {
          status: ProjectChangeRequestStatus.APPROVED,
          updatedBy: ctx.userId,
        },
      });
    });

    await this.sendChangeRequestApprovedNotifications(
      ctx,
      projectId,
      existing,
    );

    return this.enrichChangeRequest(row);
  }

  /**
   * Notifies designer and creator after a change request is approved.
   */
  private async sendChangeRequestApprovedNotifications(
    ctx: PmContext,
    projectId: string,
    cr: ProjectChangeRequest,
  ): Promise<void> {
    if (!this.notificationService || !cr.linkedDesignPackageId) {
      return;
    }

    const pkg = await this.prisma.designPackage.findFirst({
      where: {
        id: cr.linkedDesignPackageId,
        deletedAt: null,
      },
      select: {
        designerUserId: true,
        packageCode: true,
        name: true,
        taskDisciplineId: true,
      },
    });

    if (!pkg) {
      return;
    }

    const subtaskUrl =
      `/projects/${projectId}` +
      `/disciplines/${pkg.taskDisciplineId}` +
      `/packages/${cr.linkedDesignPackageId}`;

    if (pkg.designerUserId && pkg.designerUserId !== ctx.userId) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId: pkg.designerUserId,
            eventType: CR_APPROVED_REVISION_REQUIRED_EVENT,
            subject: `Revision required - ${cr.changeNumber} approved`,
            body: `Change request ${cr.changeNumber} on subtask ${pkg.packageCode} has been approved. Upload revised documents to continue. ${subtaskUrl}`,
            variables: {
              projectId,
              changeRequestId: cr.id,
              changeNumber: cr.changeNumber,
              packageCode: pkg.packageCode,
              designPackageId: cr.linkedDesignPackageId,
              link: subtaskUrl,
            },
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'CR approval notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }

    const crUrl = `/projects/${projectId}/change-requests`;
    const creatorIsDesigner = cr.createdBy === pkg.designerUserId;
    const creatorIsApprover = cr.createdBy === ctx.userId;

    if (!creatorIsDesigner && !creatorIsApprover) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId: cr.createdBy,
            eventType: CR_APPROVED_CREATOR_EVENT,
            subject: `CR ${cr.changeNumber} approved`,
            body: `Your change request ${cr.changeNumber} has been approved by the Discipline Lead. The designer has been notified to upload revised documents. ${crUrl}`,
            variables: {
              projectId,
              changeRequestId: cr.id,
              changeNumber: cr.changeNumber,
              link: crUrl,
            },
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'CR approval creator notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
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

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (
      existing.assignedTo !== ctx.userId &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the Discipline Lead can reject this CR',
      );
    }

    this.assertChangeRequestRejectable(existing.status);

    const rejectionNote = `Rejection reason: ${dto.reason.trim()}`;
    const description = existing.description
      ? `${existing.description}\n\n${rejectionNote}`
      : rejectionNote;

    const row = await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: {
        status: ProjectChangeRequestStatus.REJECTED,
        description,
        assignedTo: null,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichChangeRequest(row);
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
    const existing = await this.getChangeRequestOrThrow(
      ctx,
      projectId,
      changeRequestId,
    );

    if (
      existing.createdBy !== ctx.userId &&
      existing.status !== ProjectChangeRequestStatus.DRAFT
    ) {
      const roleNames = await this.permissionService.getUserRoleNames(
        ctx.userId,
        ctx.companyId,
      );
      if (!hasFullProjectDataAccess(roleNames)) {
        throw new ForbiddenException();
      }
    }

    await this.prisma.projectChangeRequest.update({
      where: { id: changeRequestId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /**
   * Returns current isCurrent EDVs for a design package (create-CR selector).
   */
  async listCurrentEdvs(
    ctx: PmContext,
    packageId: string,
  ): Promise<CurrentEdvOption[]> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: packageId, companyId: ctx.companyId }),
      select: { id: true },
    });
    if (!pkg) {
      throw new NotFoundException('Subtask not found');
    }

    const items = await this.prisma.designPackageItem.findMany({
      where: { companyId: ctx.companyId, designPackageId: packageId },
      select: {
        engineeringDocumentVersion: {
          select: { engineeringDocumentId: true },
        },
      },
    });
    const docIds = [
      ...new Set(
        items.map((i) => i.engineeringDocumentVersion.engineeringDocumentId),
      ),
    ];
    if (docIds.length === 0) {
      return [];
    }

    const currentEdvs = await this.prisma.engineeringDocumentVersion.findMany({
      where: {
        engineeringDocumentId: { in: docIds },
        isCurrent: true,
        deletedAt: null,
        status: { not: EdvStatus.DRAFT },
      },
      include: {
        engineeringDocument: { select: { title: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    return currentEdvs.map((edv) => ({
      id: edv.id,
      title: edv.engineeringDocument.title,
      revisionLabel: edv.revisionLabel,
      status: edv.status,
      display: `${edv.engineeringDocument.title} - Rev ${edv.revisionLabel}`,
    }));
  }

  /**
   * Previews the next CR number for a design package.
   */
  async previewNextCrNumber(
    ctx: PmContext,
    packageId: string,
  ): Promise<{ changeNumber: string }> {
    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: packageId, companyId: ctx.companyId }),
      select: DESIGN_PACKAGE_FULL_CODE_SELECT,
    });
    if (!pkg) {
      throw new NotFoundException('Subtask not found');
    }

    const existingCount = await this.prisma.projectChangeRequest.count({
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
    return { changeNumber: `CR-${fullCode}-${seq}` };
  }

  /**
   * Lists subtasks the current user may create a CR against.
   */
  async listEligibleSubtasks(
    ctx: PmContext,
    projectId: string,
  ): Promise<CrSubtaskOption[]> {
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
        items: {
          some: {
            companyId: ctx.companyId,
            engineeringDocumentVersion: {
              isCurrent: true,
              deletedAt: null,
              status: { not: EdvStatus.DRAFT },
            },
          },
        },
      }),
      select: {
        id: true,
        name: true,
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
    }));
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
      triggerType: string;
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
      input.triggerType === 'RFI'
        ? ProjectChangeRequestSource.RFI
        : input.triggerType === 'CHANGE_REQUEST'
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

  private async validateAffectedEdvs(
    companyId: string,
    designPackageId: string,
    affectedEdvIds: string[],
  ): Promise<{ affectedEdvSnapshot: AffectedEdvSnapshotItem[] }> {
    const items = await this.prisma.designPackageItem.findMany({
      where: { companyId, designPackageId },
      select: {
        engineeringDocumentVersion: {
          select: { engineeringDocumentId: true },
        },
      },
    });
    const docIds = [
      ...new Set(
        items.map((i) => i.engineeringDocumentVersion.engineeringDocumentId),
      ),
    ];

    const currentEdvs = await this.prisma.engineeringDocumentVersion.findMany({
      where: {
        engineeringDocumentId: { in: docIds },
        isCurrent: true,
        deletedAt: null,
      },
      include: {
        engineeringDocument: { select: { title: true } },
      },
    });

    const validMap = new Map(currentEdvs.map((e) => [e.id, e]));
    const invalid = affectedEdvIds.filter((id) => !validMap.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        'One or more selected documents are not current versions on this subtask',
      );
    }

    const affectedEdvSnapshot: AffectedEdvSnapshotItem[] = affectedEdvIds.map(
      (id) => {
        const edv = validMap.get(id)!;
        return {
          id,
          title: edv.engineeringDocument.title,
          revisionLabel: edv.revisionLabel,
        };
      },
    );

    return { affectedEdvSnapshot };
  }

  /**
   * Ensures the subtask has at least one current non-DRAFT EDV linked via package items.
   */
  private async assertPackageHasReviewableEdvs(
    companyId: string,
    designPackageId: string,
  ): Promise<void> {
    const reviewableItemCount = await this.prisma.designPackageItem.count({
      where: {
        companyId,
        designPackageId,
        engineeringDocumentVersion: {
          isCurrent: true,
          deletedAt: null,
          status: { not: EdvStatus.DRAFT },
        },
      },
    });
    if (reviewableItemCount === 0) {
      throw new BadRequestException(
        'This subtask has no reviewable documents. Documents must be submitted for review before a change request can be raised.',
      );
    }
  }

  private async enrichChangeRequest(
    row: ProjectChangeRequest,
  ): Promise<MappedProjectChangeRequest> {
    const mapped = mapProjectChangeRequest(row);

    let linkedDesignPackage: MappedProjectChangeRequest['linkedDesignPackage'] =
      null;
    if (row.linkedDesignPackageId) {
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({
          id: row.linkedDesignPackageId,
          companyId: row.companyId,
        }),
        select: { id: true, packageCode: true, name: true },
      });
      linkedDesignPackage = pkg
        ? { id: pkg.id, packageCode: pkg.packageCode, name: pkg.name }
        : null;
    }

    return {
      ...mapped,
      linkedDesignPackage,
      sourceEntityType: row.originEntityType,
      originEntityId: row.originEntityId,
      sourceEntitySummary: await buildSourceEntitySummary(
        this.prisma,
        row.projectId,
        row.originEntityType,
        row.originEntityId,
      ),
    };
  }

  private resolveOriginEntityId(dto: {
    sourceEntityType?: string;
    originEntityId?: string;
  }): string | undefined {
    if (!dto.sourceEntityType) {
      return undefined;
    }
    return dto.originEntityId;
  }

  private buildCompanyListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Prisma.ProjectChangeRequestWhereInput {
    const where: Prisma.ProjectChangeRequestWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

    if (query.projectId) {
      where.projectId = query.projectId;
    }

    const statusFilter = parseStatusFilter<ProjectChangeRequestStatus>(
      query.status,
    );
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { changeNumber: { contains: term, mode: 'insensitive' } },
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

  private buildListWhere(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.ProjectChangeRequestWhereInput {
    const where: Prisma.ProjectChangeRequestWhereInput = activeOnly({
      companyId: ctx.companyId,
      projectId,
    });

    const statusFilter = parseStatusFilter<ProjectChangeRequestStatus>(
      query.status,
    );
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.linkedDesignPackageId) {
      where.linkedDesignPackageId = query.linkedDesignPackageId;
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

  private buildMyListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Prisma.ProjectChangeRequestWhereInput {
    const assignedPackageWhere: Prisma.DesignPackageWhereInput = activeOnly({
      companyId: ctx.companyId,
      OR: subtaskRoleOr(ctx.userId),
    });

    const where: Prisma.ProjectChangeRequestWhereInput = activeOnly({
      companyId: ctx.companyId,
      OR: [
        { createdBy: ctx.userId },
        { assignedTo: ctx.userId },
        { linkedDesignPackage: assignedPackageWhere },
      ],
    });

    const statusFilter = parseStatusFilter<ProjectChangeRequestStatus>(
      query.status,
    );
    if (statusFilter) {
      where.status = statusFilter;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { changeNumber: { contains: term, mode: 'insensitive' } },
            { title: { contains: term, mode: 'insensitive' } },
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
          ],
        },
      ];
    }

    return where;
  }

  private mapMyChangeRequestRow(
    row: ProjectChangeRequest & {
      project: { id: string; name: string; projectCode: string };
      linkedDesignPackage: {
        id: string;
        packageCode: string;
        name: string;
      } | null;
    },
  ): MappedMyChangeRequest {
    const mapped = mapProjectChangeRequest(row);
    return {
      ...mapped,
      projectName: row.project.name,
      projectCode: row.project.projectCode,
      linkedDesignPackage: row.linkedDesignPackage
        ? {
            id: row.linkedDesignPackage.id,
            packageCode: row.linkedDesignPackage.packageCode,
            name: row.linkedDesignPackage.name,
          }
        : null,
    };
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

  private assertChangeRequestApprovable(status: ProjectChangeRequestStatus): void {
    const currentStatus = status as string;

    if (currentStatus === ProjectChangeRequestStatus.APPROVED) {
      throw new ConflictException('Change request is already approved.');
    }
    if (currentStatus === ProjectChangeRequestStatus.REJECTED) {
      throw new ConflictException(
        'A rejected change request cannot be approved. Create a new one.',
      );
    }
    if (currentStatus === 'CANCELLED') {
      throw new ConflictException(
        'A cancelled change request cannot be approved.',
      );
    }
    if (currentStatus === ProjectChangeRequestStatus.CLOSED) {
      throw new ConflictException('A closed change request cannot be approved.');
    }
    if (!CHANGE_REQUEST_APPROVABLE_STATUSES.has(currentStatus)) {
      throw new ConflictException(
        'Only submitted or under-review change requests can be approved.',
      );
    }
  }

  private assertChangeRequestRejectable(status: ProjectChangeRequestStatus): void {
    const currentStatus = status as string;

    if (currentStatus === ProjectChangeRequestStatus.APPROVED) {
      throw new ConflictException(
        'An approved change request cannot be rejected.',
      );
    }
    if (currentStatus === ProjectChangeRequestStatus.REJECTED) {
      throw new ConflictException('Change request is already rejected.');
    }
    if (currentStatus === 'CANCELLED') {
      throw new ConflictException(
        'Cannot reject a cancelled change request.',
      );
    }
  }
}
