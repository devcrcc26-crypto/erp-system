import { Injectable, NotFoundException } from '@nestjs/common';
import { IssueStatus, Prisma } from '@prisma/client';
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
import { DocumentNumberService } from './document-number.service';
import { ProjectScopeService } from './project-scope.service';

const ISSUE_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'issueNumber',
  'severity',
  'status',
  'dueDate',
]);

@Injectable()
export class IssuesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly documentNumberService: DocumentNumberService,
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

    const where = this.buildIssueListWhere(projectId, query);
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

    return buildPaginatedResult(
      rows.map(mapIssue),
      total,
      query.page,
      query.limit,
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
    return mapIssue(issue);
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

    const issueNumber = await this.documentNumberService.getNextNumber(
      ctx,
      'ISSUE',
    );

    const issue = await this.prisma.issue.create({
      data: {
        projectId,
        raisedBy: ctx.userId,
        assignedTo: dto.assignedTo,
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

    return mapIssue(issue);
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
    await this.getIssueOrThrow(projectId, issueId);

    if (dto.assignedTo) {
      await this.assertUserInCompany(ctx, dto.assignedTo);
    }

    const issue = await this.prisma.issue.update({
      where: { id: issueId },
      data: {
        issueType: dto.issueType,
        description: dto.description,
        location: dto.location,
        severity: dto.severity,
        assignedTo: dto.assignedTo,
        dueDate: parseOptionalDate(dto.dueDate),
        status: dto.status,
        updatedBy: ctx.userId,
      },
    });

    return mapIssue(issue);
  }

  /**
   * Soft-deletes an issue scoped to a project.
   */
  async deleteIssue(
    ctx: PmContext,
    projectId: string,
    issueId: string,
  ): Promise<void> {
    await this.getIssueOrThrow(projectId, issueId);
    await this.prisma.issue.update({
      where: { id: issueId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private buildIssueListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.IssueWhereInput {
    const where: Prisma.IssueWhereInput = activeOnly({ projectId });

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
      ];
    }

    return where;
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
