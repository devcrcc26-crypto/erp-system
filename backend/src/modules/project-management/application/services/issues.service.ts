import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolderContextType, Issue, IssueStatus, Prisma, ExternalReviewTriggerType } from '@prisma/client';
import { formatDesignPackageFullCode } from '../../../../shared/discipline-number.util';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateIssueDto,
  PmListQueryDto,
  UpdateIssueDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapIssue,
  MappedIssue,
  parseOptionalDate,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import {
  buildSourceEntitySummary,
  validateSourceEntity,
} from '../utils/source-entity.util';
import {
  enrichWithUserDisplayNames,
} from '../utils/pm-user-names.util';
import { PM_ISSUE_USER_NAMES } from '../utils/pm-user-name-fields.const';
import { DisciplineScopeService } from './discipline-scope.service';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';
import { TaskAccessScopeService } from './task-access-scope.service';
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
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'ASSIGNED', 'CLOSED'],
  RESOLVED: ['VERIFIED', 'IN_PROGRESS', 'CLOSED'],
  VERIFIED: ['CLOSED', 'RESOLVED'],
  CLOSED: [],
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
    private readonly taskAccessScopeService: TaskAccessScopeService,
    private readonly permissionService: PermissionService,
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
        projectId,
        raisedBy: ctx.userId,
        assignedTo: dto.assignedTo ?? null,
        linkedDesignPackageId: dto.linkedDesignPackageId ?? null,
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
   * Updates an existing issue scoped to a project.
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

    if (dto.status !== undefined && dto.status !== existing.status) {
      const allowed = ISSUE_STATUS_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid issue status transition from ${existing.status} to ${dto.status}.`,
        );
      }
    }

    if (dto.status === IssueStatus.VERIFIED) {
      this.assertVerifierIsNotRaiser(existing, ctx.userId);
    }

    let resolvedAt: Date | null | undefined;
    let resolvedBy: string | null | undefined;
    let verifiedAt: Date | null | undefined;
    let verifiedBy: string | null | undefined;

    if (dto.status !== undefined && dto.status !== existing.status) {
      if (dto.status === IssueStatus.RESOLVED) {
        resolvedAt = new Date();
        resolvedBy = ctx.userId;
      }
      if (dto.status === IssueStatus.VERIFIED) {
        verifiedAt = new Date();
        verifiedBy = ctx.userId;
      }
      if (
        existing.status === IssueStatus.RESOLVED &&
        dto.status === IssueStatus.IN_PROGRESS
      ) {
        resolvedAt = null;
        resolvedBy = null;
      }
      if (
        existing.status === IssueStatus.VERIFIED &&
        dto.status === IssueStatus.RESOLVED
      ) {
        verifiedAt = null;
        verifiedBy = null;
      }
    }

    const issue = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
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
          status: dto.status,
          resolvedAt,
          resolvedBy,
          verifiedAt,
          verifiedBy,
          sourceEntityType: dto.sourceEntityType,
          sourceEntityId: dto.sourceEntityId,
          updatedBy: ctx.userId,
        },
      });

      if (
        dto.status === IssueStatus.VERIFIED &&
        existing.status !== IssueStatus.VERIFIED &&
        existing.linkedDesignPackageId
      ) {
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

    return this.enrichIssue(ctx, issue);
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
   * Full access bypass, RBAC module perms, raiser/assignee, linked-package
   * FK roles, or any project the caller can otherwise see.
   */
  private async assertCanAccessIssue(
    ctx: PmContext,
    issue: {
      projectId: string;
      raisedBy: string;
      assignedTo: string | null;
      linkedDesignPackageId?: string | null;
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

    if (issue.raisedBy === ctx.userId || issue.assignedTo === ctx.userId) {
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

    // Issues are visible company-wide to anyone who can otherwise see the project.
    const visibleProjectIds =
      await this.taskAccessScopeService.getVisibleProjectIds(ctx);
    if (
      visibleProjectIds === null ||
      visibleProjectIds.includes(issue.projectId)
    ) {
      return;
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

  private assertVerifierIsNotRaiser(
    issue: { raisedBy: string },
    userId: string,
  ): void {
    if (userId === issue.raisedBy) {
      throw new ForbiddenException(
        'The person who raised an issue cannot verify their own issue. A second person must verify.',
      );
    }
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
}
