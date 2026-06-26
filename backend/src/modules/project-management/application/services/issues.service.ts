import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolderContextType, IssueStatus, Prisma, ExternalReviewTriggerType } from '@prisma/client';
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
import { DisciplineScopeService } from './discipline-scope.service';
import { DocumentNumberService } from './document-number.service';
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
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CLOSED'],
  ASSIGNED: ['IN_PROGRESS', 'OPEN', 'CLOSED'],
  IN_PROGRESS: ['RESOLVED', 'ASSIGNED', 'CLOSED'],
  RESOLVED: ['VERIFIED', 'IN_PROGRESS', 'CLOSED'],
  VERIFIED: ['CLOSED', 'RESOLVED'],
  CLOSED: [],
};

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
    private readonly disciplineScopeService: DisciplineScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly epcSubmittalRepository: EpcSubmittalRepository,
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
   * Returns a single issue by id scoped to a project.
   */
  async getIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
  ): Promise<MappedIssue> {
    const issue = await this.getIssueOrThrow(projectId, issueId);
    await this.assertIssueVisible(ctx, projectId, issue);
    return this.enrichIssue(ctx, issue);
  }

  /**
   * Creates an issue with an auto-generated document number.
   */
  async createIssue(
    ctx: PmContext,
    projectId: string,
    dto: CreateIssueDto,
  ): Promise<MappedIssue> {
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

    const issueNumber = await this.documentNumberService.getNextNumber(
      ctx,
      'ISSUE',
    );

    const issue = await this.prisma.issue.create({
      data: {
        projectId,
        raisedBy: ctx.userId,
        assignedTo: dto.assignedTo,
        taskDisciplineId: dto.taskDisciplineId,
        issueNumber,
        issueType: dto.issueType,
        description: dto.description,
        location: dto.location,
        severity: dto.severity,
        dueDate: parseOptionalDate(dto.dueDate),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    const folder = await this.engineeringDocumentFolderService.ensureIssueFolder(
      ctx,
      projectId,
      issue.id,
      issue.issueNumber,
    );

    return { ...mapIssue(issue), attachmentFolderId: folder.id };
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
    await this.assertIssueVisible(ctx, projectId, existing);

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
          dueDate: parseOptionalDate(dto.dueDate),
          status: dto.status,
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
    const folder = await this.engineeringDocumentFolderService.findEntityFolder(
      ctx,
      FolderContextType.ISSUE,
      issue.id,
    );
    return {
      ...mapIssue(issue),
      attachmentFolderId: folder?.id ?? null,
    };
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
