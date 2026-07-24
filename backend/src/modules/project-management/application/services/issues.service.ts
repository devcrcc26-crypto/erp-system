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
  Issue,
  IssueResponse,
  IssueStatus,
  Prisma,
  ExternalReviewTriggerType,
} from '@prisma/client';
import { formatDesignPackageFullCode } from '../../../../shared/discipline-number.util';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  CreateIssueDto,
  CreateIssueResponseDto,
  PmListQueryDto,
  ReopenIssueDto,
  ResolveIssueDto,
  StartIssueDto,
  UpdateIssueDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapIssue,
  mapIssueResponse,
  MappedIssue,
  MappedIssueResponse,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import {
  buildSourceEntitySummary,
  validateSourceEntity,
} from '../utils/source-entity.util';
import {
  enrichWithUserDisplayNames,
  enrichRowsWithUserDisplayNames,
} from '../utils/pm-user-names.util';
import {
  PM_ISSUE_USER_NAMES,
  PM_RESPONDED_BY_NAME,
} from '../utils/pm-user-name-fields.const';
import { DisciplineScopeService } from './discipline-scope.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';
import { EpcSubmittalRepository } from '../../infrastructure/repositories/epc-submittal.repository';

const ISSUE_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'issueNumber',
  'severity',
  'status',
  'dueDate',
]);

const ISSUE_STATUS_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
};

const DESIGN_PACKAGE_FULL_CODE_SELECT = {
  packageCode: true,
  subtaskIndex: true,
  taskDiscipline: {
    select: {
      disciplineIndex: true,
      task: { select: { overseasTaskNumber: true } },
    },
  },
} as const;

const ISSUE_ASSIGNED_EVENT = 'issue.assigned';
const ISSUE_RESOLVED_EVENT = 'issue.resolved';
const ISSUE_CLOSED_EVENT = 'issue.closed';
const ISSUE_REOPENED_EVENT = 'issue.reopened';
const ISSUE_RESPONSE_EVENT = 'issue.response';

export interface IssueProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

export type MappedMyIssue = MappedIssue & {
  projectName: string;
  projectCode: string;
};

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
    private readonly permissionService: PermissionService,
    @Optional() private readonly notificationService?: NotificationService,
  ) {}

  /**
   * Returns a paginated list of issues for a project.
   */
  async listIssues(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedIssue>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = await this.buildIssueListWhere(ctx, projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      ISSUE_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.issue.findMany({ where, skip, take, orderBy }),
      this.prisma.issue.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map((row) => this.enrichIssue(ctx, row)),
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Issues relevant to the current user across projects: raiser, assignee,
   * or FK role on the linked design package.
   */
  async listMyIssues(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyIssue>> {
    const where = this.buildMyIssueListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      ISSUE_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.issue.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.issue.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map((row) => this.mapMyIssueRow(ctx, row)),
    );
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-wide issues (portfolio / admin users).
   */
  async listAllIssues(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyIssue>> {
    const where = this.buildCompanyIssueListWhere(ctx, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      ISSUE_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.issue.findMany({
        where,
        skip,
        take,
        orderBy,
        include: {
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.issue.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map((row) => this.mapMyIssueRow(ctx, row)),
    );
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Distinct projects with issues relevant to the current user.
   */
  async listMyIssueProjects(ctx: PmContext): Promise<IssueProjectOption[]> {
    const where = this.buildMyIssueListWhere(ctx, {});
    const rows = await this.prisma.issue.findMany({
      where,
      select: {
        project: { select: { id: true, projectCode: true, name: true } },
      },
    });

    const byId = new Map<string, IssueProjectOption>();
    for (const row of rows) {
      if (!byId.has(row.project.id)) {
        byId.set(row.project.id, {
          id: row.project.id,
          projectCode: row.project.projectCode,
          name: row.project.name,
        });
      }
    }

    return [...byId.values()].sort((a, b) =>
      a.projectCode.localeCompare(b.projectCode),
    );
  }

  /**
   * Returns a single issue by id scoped to a project.
   */
  async getIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
  ): Promise<MappedIssue> {
    const issue = await this.getIssueOrThrow(projectId, issueId);
    await this.assertCanAccessIssue(ctx, issue, 'view');
    return this.enrichIssue(ctx, issue);
  }

  /**
   * Creates an issue with an auto-generated issue number: subtask-chain
   * numbering when linked to a design package, otherwise a project-level
   * sequence.
   */
  async createIssue(
    ctx: PmContext,
    projectId: string,
    dto: CreateIssueDto,
  ): Promise<MappedIssue> {
    const project = await this.projectScopeService.getProjectOrThrow(
      ctx,
      projectId,
    );

    await this.assertCanAccessIssue(
      ctx,
      {
        raisedBy: ctx.userId,
        assignedTo: dto.assignedTo ?? null,
        linkedDesignPackageId: dto.linkedDesignPackageId ?? null,
        taskDisciplineId: dto.taskDisciplineId ?? null,
      },
      'create',
    );

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

    const issueNumber = await this.nextIssueNumber(
      ctx,
      project,
      dto.linkedDesignPackageId,
    );

    const issue = await this.prisma.issue.create({
      data: {
        companyId: ctx.companyId,
        projectId,
        raisedBy: ctx.userId,
        assignedTo: dto.assignedTo,
        taskDisciplineId: dto.taskDisciplineId,
        linkedDesignPackageId: dto.linkedDesignPackageId,
        issueNumber,
        issueType: dto.issueType,
        description: dto.description,
        location: dto.location,
        severity: dto.severity,
        dueDate: parseOptionalDate(dto.dueDate),
        sourceEntityType: dto.sourceEntityType,
        sourceEntityId: dto.sourceEntityId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    await this.engineeringDocumentFolderService.ensureIssueFolder(
      ctx,
      projectId,
      issue.id,
      issue.issueNumber,
    );

    if (dto.assignedTo && dto.assignedTo !== ctx.userId) {
      await this.sendIssueAssignedNotification(ctx, issue);
    }

    return this.enrichIssue(ctx, issue);
  }

  /**
   * ISS-{overseas}-{discipline:02}-{subtask:03}-{seq:03} when linked to a
   * subtask, else ISS-{projectCode}-{seq:03}.
   */
  private async nextIssueNumber(
    ctx: PmContext,
    project: { id: string; projectCode: string | null },
    linkedDesignPackageId: string | undefined,
  ): Promise<string> {
    if (linkedDesignPackageId) {
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({
          id: linkedDesignPackageId,
          companyId: ctx.companyId,
        }),
        select: {
          subtaskIndex: true,
          taskDiscipline: {
            select: {
              disciplineIndex: true,
              task: { select: { overseasTaskNumber: true, projectId: true } },
            },
          },
        },
      });
      if (!pkg || pkg.taskDiscipline.task.projectId !== project.id) {
        throw new NotFoundException('Subtask not found');
      }

      const count = await this.prisma.issue.count({
        where: { linkedDesignPackageId, deletedAt: null },
      });
      const seq = String(count + 1).padStart(3, '0');
      const fullCode = formatDesignPackageFullCode(
        pkg.taskDiscipline.task.overseasTaskNumber,
        pkg.taskDiscipline.disciplineIndex,
        pkg.subtaskIndex,
      );
      return `ISS-${fullCode}-${seq}`;
    }

    const count = await this.prisma.issue.count({
      where: { projectId: project.id, linkedDesignPackageId: null, deletedAt: null },
    });
    const seq = String(count + 1).padStart(3, '0');
    const projectCode = project.projectCode ?? 'PRJ';
    return `ISS-${projectCode}-${seq}`;
  }

  /**
   * Updates non-status fields of an existing issue.
   */
  async updateIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
    dto: UpdateIssueDto,
  ): Promise<MappedIssue> {
    const existing = await this.getIssueOrThrow(projectId, issueId);
    await this.assertCanAccessIssue(ctx, existing, 'edit');

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

    const issue = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        issueType: dto.issueType,
        description: dto.description,
        location: dto.location,
        severity: dto.severity,
        assignedTo: dto.assignedTo,
        taskDisciplineId: dto.taskDisciplineId,
        linkedDesignPackageId: dto.linkedDesignPackageId,
        dueDate: parseOptionalDate(dto.dueDate),
        sourceEntityType: dto.sourceEntityType,
        sourceEntityId: dto.sourceEntityId,
        updatedBy: ctx.userId,
      },
    });

    return this.enrichIssue(ctx, issue);
  }

  /**
   * Transitions an issue from OPEN to IN_PROGRESS and optionally reassigns it.
   */
  async startIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
    dto: StartIssueDto,
  ): Promise<MappedIssue> {
    const existing = await this.getIssueOrThrow(projectId, issueId);
    await this.assertCanAccessIssue(ctx, existing, 'edit');

    if (existing.status !== IssueStatus.OPEN) {
      throw new BadRequestException(
        `Issue must be in OPEN status to start. Current status: ${existing.status}.`,
      );
    }
    this.assertAllowedTransition(existing.status, IssueStatus.IN_PROGRESS);

    const assignedTo = dto.assignedTo ?? existing.assignedTo ?? ctx.userId;

    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }

    const issue = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        status: IssueStatus.IN_PROGRESS,
        assignedTo,
        updatedBy: ctx.userId,
      },
    });

    const assigneeChanged =
      assignedTo !== existing.assignedTo && assignedTo !== ctx.userId;
    if (assigneeChanged) {
      await this.sendIssueAssignedNotification(ctx, issue);
    }

    return this.enrichIssue(ctx, issue);
  }

  /**
   * Transitions an issue from IN_PROGRESS to RESOLVED with a resolution note.
   */
  async resolveIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
    dto: ResolveIssueDto,
  ): Promise<MappedIssue> {
    const existing = await this.getIssueOrThrow(projectId, issueId);
    await this.assertCanAccessIssue(ctx, existing, 'edit');

    if (existing.status !== IssueStatus.IN_PROGRESS) {
      throw new BadRequestException(
        `Issue must be IN_PROGRESS to resolve. Current status: ${existing.status}.`,
      );
    }
    this.assertAllowedTransition(existing.status, IssueStatus.RESOLVED);

    const roleNames = await this.getRoleNames(ctx);
    if (
      ctx.userId !== existing.assignedTo &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the assigned user or a project admin can resolve this issue.',
      );
    }

    const resolutionNote = dto.resolutionNote.trim();
    if (!resolutionNote) {
      throw new BadRequestException('Resolution note cannot be empty.');
    }

    const issue = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        status: IssueStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedBy: ctx.userId,
        resolutionNote,
        updatedBy: ctx.userId,
      },
    });

    if (existing.raisedBy) {
      await this.sendIssueResolvedNotification(ctx, issue, existing.raisedBy);
    }

    return this.enrichIssue(ctx, issue);
  }

  /**
   * Transitions an issue from RESOLVED to CLOSED and optionally triggers
   * the EPC external-review pipeline if linked to a design package.
   */
  async closeIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
  ): Promise<MappedIssue> {
    const existing = await this.getIssueOrThrow(projectId, issueId);
    await this.assertCanAccessIssue(ctx, existing, 'edit');

    if (existing.status !== IssueStatus.RESOLVED) {
      throw new BadRequestException(
        `Issue must be RESOLVED to close. Current status: ${existing.status}.`,
      );
    }
    this.assertAllowedTransition(existing.status, IssueStatus.CLOSED);

    const roleNames = await this.getRoleNames(ctx);
    if (
      ctx.userId !== existing.raisedBy &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the person who raised this issue or a project admin can close it.',
      );
    }

    const issue = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issueId },
        data: {
          status: IssueStatus.CLOSED,
          updatedBy: ctx.userId,
        },
      });

      if (existing.linkedDesignPackageId) {
        await this.epcSubmittalRepository.createLinkedEntityTrigger(tx, {
          companyId: ctx.companyId,
          projectId,
          triggerType: ExternalReviewTriggerType.ISSUE,
          sourceEntityType: 'ISSUE',
          sourceEntityId: issueId,
          linkedDesignPackageId: existing.linkedDesignPackageId,
          createdBy: ctx.userId,
        });
      }

      return updated;
    });

    if (existing.assignedTo) {
      await this.sendIssueClosedNotification(ctx, issue, existing.assignedTo);
    }

    return this.enrichIssue(ctx, issue);
  }

  /**
   * Transitions an issue from RESOLVED or CLOSED back to IN_PROGRESS,
   * recording a reopen reason as an issue response.
   */
  async reopenIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
    dto: ReopenIssueDto,
  ): Promise<MappedIssue> {
    const existing = await this.getIssueOrThrow(projectId, issueId);
    await this.assertCanAccessIssue(ctx, existing, 'edit');

    if (
      existing.status !== IssueStatus.RESOLVED &&
      existing.status !== IssueStatus.CLOSED
    ) {
      throw new BadRequestException(
        `Issue must be RESOLVED or CLOSED to reopen. Current status: ${existing.status}.`,
      );
    }
    this.assertAllowedTransition(existing.status, IssueStatus.IN_PROGRESS);

    const roleNames = await this.getRoleNames(ctx);
    if (
      ctx.userId !== existing.raisedBy &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the person who raised this issue or a project admin can reopen it.',
      );
    }

    const reason = dto.reason.trim();
    if (!reason) {
      throw new BadRequestException('Reopen reason cannot be empty.');
    }

    const issue = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id: issueId },
        data: {
          status: IssueStatus.IN_PROGRESS,
          resolvedAt: null,
          resolvedBy: null,
          resolutionNote: null,
          reopenedAt: new Date(),
          reopenedBy: ctx.userId,
          updatedBy: ctx.userId,
        },
      });

      await tx.issueResponse.create({
        data: {
          issueId,
          respondedBy: ctx.userId,
          responseText: `Reopened: ${reason}`,
        },
      });

      return updated;
    });

    if (existing.assignedTo) {
      await this.sendIssueReopenedNotification(
        ctx,
        issue,
        existing.assignedTo,
        reason,
      );
    }

    return this.enrichIssue(ctx, issue);
  }

  /**
   * Lists all responses for a given issue, ordered by respondedAt ascending.
   */
  async listIssueResponses(
    ctx: PmContext,
    projectId: string,
    issueId: string,
  ): Promise<MappedIssueResponse[]> {
    const issue = await this.getIssueOrThrow(projectId, issueId);
    await this.assertCanAccessIssue(ctx, issue, 'view');

    const rows = await this.prisma.issueResponse.findMany({
      where: { issueId },
      include: {
        responseDocument: { select: { name: true } },
      },
      orderBy: { respondedAt: 'asc' },
    });

    const mapped = rows.map((row) => mapIssueResponse(row));
    return enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapped,
      PM_RESPONDED_BY_NAME,
    );
  }

  /**
   * Adds a response to an issue thread.
   */
  async addIssueResponse(
    ctx: PmContext,
    projectId: string,
    issueId: string,
    dto: CreateIssueResponseDto,
  ): Promise<MappedIssueResponse> {
    const issue = await this.getIssueOrThrow(projectId, issueId);
    await this.assertCanAccessIssue(ctx, issue, 'edit');

    if (issue.status === IssueStatus.CLOSED) {
      throw new BadRequestException(
        'Cannot add a response to a closed issue.',
      );
    }

    const roleNames = await this.getRoleNames(ctx);
    if (
      ctx.userId !== issue.raisedBy &&
      ctx.userId !== issue.assignedTo &&
      !hasFullProjectDataAccess(roleNames)
    ) {
      throw new ForbiddenException(
        'Only the raiser, the assignee, or a project admin can respond to this issue.',
      );
    }

    const responseText = dto.responseText.trim();
    if (!responseText) {
      throw new BadRequestException('Response text cannot be empty.');
    }

    if (dto.responseDocumentId) {
      await this.assertResponseDocumentBelongsToIssue(
        ctx,
        issueId,
        dto.responseDocumentId,
      );
    }

    const row = await this.prisma.issueResponse.create({
      data: {
        issueId,
        respondedBy: ctx.userId,
        responseText,
        responseDocumentId: dto.responseDocumentId,
      },
      include: {
        responseDocument: { select: { name: true } },
      },
    });

    await this.sendIssueResponseNotification(ctx, issue, ctx.userId);

    const mapped = mapIssueResponse(row);
    return enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      [mapped],
      PM_RESPONDED_BY_NAME,
    ).then((rows) => rows[0]!);
  }

  /**
   * Soft-deletes an issue scoped to a project.
   */
  async deleteIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
  ): Promise<void> {
    const issue = await this.getIssueOrThrow(projectId, issueId);
    await this.assertIssueVisible(ctx, projectId, issue);
    await this.prisma.issue.update({
      where: { id: issueId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private buildMyIssueListWhere(
    ctx: PmContext,
    query: Partial<PmListQueryDto>,
  ): Prisma.IssueWhereInput {
    const assignedPackageWhere: Prisma.DesignPackageWhereInput = activeOnly({
      companyId: ctx.companyId,
      OR: [
        { designerUserId: ctx.userId },
        { disciplinaryLeaderUserId: ctx.userId },
        { reviewerUserId: ctx.userId },
        { supportingDesignerUserId: ctx.userId },
        { deptDeputyChiefUserId: ctx.userId },
        { instituteChiefUserId: ctx.userId },
      ],
    });

    const where: Prisma.IssueWhereInput = activeOnly({
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
    if (query.status) {
      where.status = query.status as IssueStatus;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { issueNumber: { contains: term, mode: 'insensitive' } },
            { issueType: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { location: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private buildCompanyIssueListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Prisma.IssueWhereInput {
    const where: Prisma.IssueWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.status) {
      where.status = query.status as IssueStatus;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { issueNumber: { contains: term, mode: 'insensitive' } },
        { issueType: { contains: term, mode: 'insensitive' } },
        { description: { contains: term, mode: 'insensitive' } },
        { location: { contains: term, mode: 'insensitive' } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { project: { projectCode: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private async mapMyIssueRow(
    ctx: PmContext,
    row: Issue & {
      project: { id: string; name: string; projectCode: string };
    },
  ): Promise<MappedMyIssue> {
    const enriched = await this.enrichIssue(ctx, row);
    return {
      ...enriched,
      projectName: row.project.name,
      projectCode: row.project.projectCode,
    };
  }

  private async buildIssueListWhere(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<Prisma.IssueWhereInput> {
    const where: Prisma.IssueWhereInput = activeOnly({ projectId });

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
      ];
    }

    if (query.status) {
      where.status = query.status as IssueStatus;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        {
          OR: [
            { issueNumber: { contains: term, mode: 'insensitive' } },
            { issueType: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { location: { contains: term, mode: 'insensitive' } },
          ],
        },
      ];
    }

    return where;
  }

  private async enrichIssue(
    ctx: PmContext,
    issue: Parameters<typeof mapIssue>[0],
  ): Promise<MappedIssue> {
    const [folder, linkedDesignPackage] = await Promise.all([
      this.engineeringDocumentFolderService.findEntityFolder(
        ctx,
        FolderContextType.ISSUE,
        issue.id,
      ),
      this.resolveLinkedDesignPackage(ctx, issue.linkedDesignPackageId),
    ]);
    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      {
        ...mapIssue(issue),
        attachmentFolderId: folder?.id ?? null,
        linkedDesignPackage,
        sourceEntitySummary: await buildSourceEntitySummary(
          this.prisma,
          issue.projectId,
          issue.sourceEntityType,
          issue.sourceEntityId,
        ),
      },
      PM_ISSUE_USER_NAMES,
    );
  }

  private async resolveLinkedDesignPackage(
    ctx: PmContext,
    linkedDesignPackageId: string | null,
  ): Promise<MappedIssue['linkedDesignPackage']> {
    if (!linkedDesignPackageId) {
      return null;
    }

    const pkg = await this.prisma.designPackage.findFirst({
      where: activeOnly({ id: linkedDesignPackageId, companyId: ctx.companyId }),
      select: { id: true, name: true, ...DESIGN_PACKAGE_FULL_CODE_SELECT },
    });
    if (!pkg) {
      return null;
    }

    return {
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

  /**
   * Full access bypass, RBAC module perms, raiser/assignee (existing issues
   * only — creation can't bootstrap off its own raiser), linked-subtask FK
   * roles, or discipline lead/designer on the linked discipline.
   */
  private async assertCanAccessIssue(
    ctx: PmContext,
    issue: {
      raisedBy: string | null;
      assignedTo: string | null;
      linkedDesignPackageId?: string | null;
      taskDisciplineId?: string | null;
    },
    action: 'view' | 'create' | 'edit',
  ): Promise<void> {
    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (hasFullProjectDataAccess(roleNames)) {
      return;
    }

    const pmPerms = await this.permissionService.getUserModulePermissions(
      ctx.userId,
      ctx.companyId,
      'issues',
    );
    if (action === 'view' && pmPerms.canView) {
      return;
    }
    if (action === 'create' && pmPerms.canCreate) {
      return;
    }
    if (action === 'edit' && pmPerms.canEdit) {
      return;
    }

    if (
      action !== 'create' &&
      (issue.raisedBy === ctx.userId || issue.assignedTo === ctx.userId)
    ) {
      return;
    }

    if (issue.linkedDesignPackageId) {
      const pkg = await this.prisma.designPackage.findFirst({
        where: activeOnly({
          id: issue.linkedDesignPackageId,
          companyId: ctx.companyId,
          OR: [
            { designerUserId: ctx.userId },
            { disciplinaryLeaderUserId: ctx.userId },
            { reviewerUserId: ctx.userId },
            { supportingDesignerUserId: ctx.userId },
            { deptDeputyChiefUserId: ctx.userId },
            { instituteChiefUserId: ctx.userId },
          ],
        }),
        select: { id: true },
      });
      if (pkg) {
        return;
      }
    }

    if (issue.taskDisciplineId) {
      const disc = await this.prisma.taskDiscipline.findFirst({
        where: activeOnly({
          id: issue.taskDisciplineId,
          companyId: ctx.companyId,
          OR: [
            { disciplineLeadUserId: ctx.userId },
            { designerUserId: ctx.userId },
          ],
        }),
        select: { id: true },
      });
      if (disc) {
        return;
      }
    }

    throw new ForbiddenException('Access denied');
  }

  private async assertIssueVisible(
    ctx: PmContext,
    projectId: string,
    issue: { taskDisciplineId: string | null; raisedBy: string },
  ): Promise<void> {
    const bypass = await this.disciplineScopeService.hasDisciplineScopeBypass(
      ctx,
      projectId,
    );
    if (bypass || issue.raisedBy === ctx.userId || issue.taskDisciplineId === null) {
      return;
    }

    const assignedIds =
      await this.disciplineScopeService.getAssignedDisciplineIds(ctx, projectId);
    if (
      issue.taskDisciplineId !== null &&
      assignedIds.includes(issue.taskDisciplineId)
    ) {
      return;
    }

    throw new ForbiddenException('You do not have access to this issue');
  }

  private async getIssueOrThrow(projectId: string, issueId: string) {
    const issue = await this.prisma.issue.findFirst({
      where: activeOnly({ id: issueId, projectId }),
    });
    if (!issue) {
      throw new NotFoundException('Issue not found');
    }
    return issue;
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

  /**
   * Ensures the response attachment document lives in this issue's folder.
   */
  private async assertResponseDocumentBelongsToIssue(
    ctx: PmContext,
    issueId: string,
    documentId: string,
  ): Promise<void> {
    const folder =
      await this.engineeringDocumentFolderService.findEntityFolder(
        ctx,
        FolderContextType.ISSUE,
        issueId,
      );
    if (!folder) {
      throw new BadRequestException(
        'Issue has no attachment folder for response files',
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
        'Response attachment must be a document in this issue folder',
      );
    }
  }

  private assertAllowedTransition(from: IssueStatus, to: IssueStatus): void {
    const allowed = ISSUE_STATUS_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw new BadRequestException(
        `Invalid issue status transition from ${from} to ${to}.`,
      );
    }
  }

  private async getRoleNames(ctx: PmContext): Promise<string[]> {
    return this.permissionService.getUserRoleNames(ctx.userId, ctx.companyId);
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

  private async sendIssueAssignedNotification(
    ctx: PmContext,
    issue: Issue,
  ): Promise<void> {
    if (!this.notificationService || !issue.assignedTo) {
      return;
    }

    const raisedByName = await this.resolveUserName(ctx, issue.raisedBy);
    const link = `/projects/${issue.projectId}/issues`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: issue.assignedTo,
          eventType: ISSUE_ASSIGNED_EVENT,
          subject: `Issue assigned — ${issue.issueNumber}`,
          body: `${raisedByName} assigned issue ${issue.issueNumber} to you. Please start working on it.`,
          variables: {
            projectId: issue.projectId,
            issueId: issue.id,
            issueNumber: issue.issueNumber,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Issue assigned notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async sendIssueResolvedNotification(
    ctx: PmContext,
    issue: Issue,
    raisedBy: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const resolverName = await this.resolveUserName(ctx, ctx.userId);
    const link = `/projects/${issue.projectId}/issues`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: raisedBy,
          eventType: ISSUE_RESOLVED_EVENT,
          subject: `Issue resolved — ${issue.issueNumber}: ${issue.resolutionNote ?? ''}`,
          body: `${resolverName} resolved issue ${issue.issueNumber}: ${issue.resolutionNote ?? ''}`,
          variables: {
            projectId: issue.projectId,
            issueId: issue.id,
            issueNumber: issue.issueNumber,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Issue resolved notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async sendIssueClosedNotification(
    ctx: PmContext,
    issue: Issue,
    assignedTo: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const closedByName = await this.resolveUserName(ctx, ctx.userId);
    const link = `/projects/${issue.projectId}/issues`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: assignedTo,
          eventType: ISSUE_CLOSED_EVENT,
          subject: `Issue closed — ${issue.issueNumber}`,
          body: `${closedByName} has closed issue ${issue.issueNumber}.`,
          variables: {
            projectId: issue.projectId,
            issueId: issue.id,
            issueNumber: issue.issueNumber,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Issue closed notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async sendIssueReopenedNotification(
    ctx: PmContext,
    issue: Issue,
    assignedTo: string,
    reason: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const reopenerName = await this.resolveUserName(ctx, ctx.userId);
    const link = `/projects/${issue.projectId}/issues`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: assignedTo,
          eventType: ISSUE_REOPENED_EVENT,
          subject: `Issue reopened — ${issue.issueNumber}: ${reason}`,
          body: `${reopenerName} reopened issue ${issue.issueNumber}: ${reason}`,
          variables: {
            projectId: issue.projectId,
            issueId: issue.id,
            issueNumber: issue.issueNumber,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Issue reopened notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async sendIssueResponseNotification(
    ctx: PmContext,
    issue: Issue,
    respondedBy: string,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    let recipientIds: (string | null)[];
    if (respondedBy === issue.assignedTo) {
      recipientIds = [issue.raisedBy];
    } else if (respondedBy === issue.raisedBy) {
      recipientIds = [issue.assignedTo];
    } else {
      recipientIds = [issue.raisedBy, issue.assignedTo];
    }

    const uniqueRecipientIds = [...new Set(recipientIds)].filter(
      (recipientId): recipientId is string =>
        recipientId != null && recipientId !== respondedBy,
    );

    if (uniqueRecipientIds.length === 0) {
      return;
    }

    const responderName = await this.resolveUserName(ctx, respondedBy);
    const link = `/projects/${issue.projectId}/issues`;

    for (const recipientId of uniqueRecipientIds) {
      try {
        await this.notificationService.send(
          { companyId: ctx.companyId, userId: ctx.userId },
          {
            recipientId,
            eventType: ISSUE_RESPONSE_EVENT,
            subject: `New response — ${issue.issueNumber}`,
            body: `${responderName} added a response to issue ${issue.issueNumber}.`,
            variables: {
              projectId: issue.projectId,
              issueId: issue.id,
              issueNumber: issue.issueNumber,
              link,
            },
          },
        );
      } catch (error: unknown) {
        this.logger.warn(
          'Issue response notification failed',
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }
}
