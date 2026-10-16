import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  IssueStatus,
  Prisma,
  ProjectStatus,
  PunchItemStatus,
  RfiStatus,
} from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { averageProjectProgressPct } from '../../../project-management/application/utils/project-progress.util';
import {
  buildOrderBy,
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateReportDefinitionDto,
  CreateReportScheduleDto,
  UpdateReportDefinitionDto,
  UpdateReportScheduleDto,
} from '../dtos/reporting.dtos';
import { ReportExecutorService } from './report-executor.service';

type RequestContext = { companyId: string; userId: string };

export interface PortfolioSummary {
  generatedAt: string;
  companyName: string;
  baseCurrency: string;
  completionRate: number;
  projects: {
    total: number;
    notStarted: number;
    inProgress: number;
    onHold: number;
    cancelled: number;
    completed: number;
    /** @deprecated Use inProgress - kept for older clients */
    active: number;
    averageProgressPct: number | null;
    totalBudget: string | null;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
  };
  users: {
    total: number;
    active: number;
    inactive: number;
  };
  organization: {
    branches: number;
    departments: number;
  };
  audit: {
    last30Days: number;
    total: number;
    topModules: readonly { module: string; count: number }[];
  };
  siteOps: {
    openRfis: number;
    overdueRfis: number;
    openIssues: number;
    openPunchItems: number;
    totalOpen: number;
  };
}

@Injectable()
export class ReportingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportExecutor: ReportExecutorService,
  ) {}

  async listReports(
    ctx: RequestContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.ReportDefinitionWhereInput = {
      companyId: ctx.companyId,
      deletedAt: null,
      OR: [{ isShared: true }, { createdBy: ctx.userId }],
    };
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.reportDefinition.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
      }),
      this.prisma.reportDefinition.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getReport(ctx: RequestContext, id: string): Promise<unknown> {
    return this.findReportOrThrow(id, ctx);
  }

  async createReport(
    ctx: RequestContext,
    dto: CreateReportDefinitionDto,
  ): Promise<unknown> {
    return this.prisma.reportDefinition.create({
      data: {
        companyId: ctx.companyId,
        createdBy: ctx.userId,
        name: dto.name,
        dataSource: dto.dataSource,
        fields: (dto.fields ?? []) as Prisma.InputJsonValue,
        filters: (dto.filters ?? []) as Prisma.InputJsonValue,
        grouping: (dto.grouping ?? []) as Prisma.InputJsonValue,
        sorting: (dto.sorting ?? []) as Prisma.InputJsonValue,
        isShared: dto.isShared ?? false,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateReport(
    ctx: RequestContext,
    id: string,
    dto: UpdateReportDefinitionDto,
  ): Promise<unknown> {
    const report = await this.findReportOrThrow(id, ctx);
    this.assertCanEdit(report, ctx);

    const { fields, filters, grouping, sorting, ...rest } = dto;
    return this.prisma.reportDefinition.update({
      where: { id },
      data: {
        ...rest,
        ...(fields !== undefined
          ? { fields: fields as Prisma.InputJsonValue }
          : {}),
        ...(filters !== undefined
          ? { filters: filters as Prisma.InputJsonValue }
          : {}),
        ...(grouping !== undefined
          ? { grouping: grouping as Prisma.InputJsonValue }
          : {}),
        ...(sorting !== undefined
          ? { sorting: sorting as Prisma.InputJsonValue }
          : {}),
        updatedBy: ctx.userId,
      },
    });
  }

  async deleteReport(ctx: RequestContext, id: string): Promise<void> {
    const report = await this.findReportOrThrow(id, ctx);
    this.assertCanEdit(report, ctx);

    await this.prisma.reportDefinition.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async executeReport(ctx: RequestContext, id: string): Promise<unknown> {
    const report = await this.findReportOrThrow(id, ctx);
    return this.reportExecutor.execute(
      ctx.companyId,
      report.dataSource,
      report.fields,
      report.filters,
      report.sorting,
    );
  }

  async exportReport(
    ctx: RequestContext,
    id: string,
    format: 'json' | 'csv',
  ): Promise<{ filename: string; format: string; content: unknown }> {
    const report = await this.findReportOrThrow(id, ctx);
    const result = await this.reportExecutor.execute(
      ctx.companyId,
      report.dataSource,
      report.fields,
      report.filters,
      report.sorting,
    );

    const safeName = report.name.replace(/[^a-zA-Z0-9-_]/g, '_').toLowerCase();
    if (format === 'csv') {
      return {
        filename: `${safeName}.csv`,
        format: 'csv',
        content: this.reportExecutor.toCsv(result),
      };
    }

    return {
      filename: `${safeName}.json`,
      format: 'json',
      content: result,
    };
  }

  async listSchedules(
    ctx: RequestContext,
    reportId: string,
  ): Promise<unknown[]> {
    await this.findReportOrThrow(reportId, ctx);
    return this.prisma.reportSchedule.findMany({
      where: activeOnly({ reportId }),
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSchedule(
    ctx: RequestContext,
    reportId: string,
    dto: CreateReportScheduleDto,
  ): Promise<unknown> {
    const report = await this.findReportOrThrow(reportId, ctx);
    this.assertCanEdit(report, ctx);

    return this.prisma.reportSchedule.create({
      data: {
        reportId,
        cronExpression: dto.cronExpression,
        format: dto.format ?? 'PDF',
        recipients: dto.recipients ?? [],
        isActive: dto.isActive ?? true,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateSchedule(
    ctx: RequestContext,
    reportId: string,
    scheduleId: string,
    dto: UpdateReportScheduleDto,
  ): Promise<unknown> {
    const report = await this.findReportOrThrow(reportId, ctx);
    this.assertCanEdit(report, ctx);
    await this.findScheduleOrThrow(reportId, scheduleId);

    return this.prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteSchedule(
    ctx: RequestContext,
    reportId: string,
    scheduleId: string,
  ): Promise<void> {
    const report = await this.findReportOrThrow(reportId, ctx);
    this.assertCanEdit(report, ctx);
    await this.findScheduleOrThrow(reportId, scheduleId);

    await this.prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private async findReportOrThrow(
    id: string,
    ctx: RequestContext,
  ): Promise<{
    id: string;
    companyId: string;
    createdBy: string;
    isSystem: boolean;
    isShared: boolean;
    dataSource: string;
    fields: Prisma.JsonValue;
    filters: Prisma.JsonValue;
    sorting: Prisma.JsonValue;
    name: string;
  }> {
    const report = await this.prisma.reportDefinition.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
    });
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    if (!report.isShared && report.createdBy !== ctx.userId) {
      throw new ForbiddenException('You do not have access to this report');
    }
    return report;
  }

  /**
   * Returns company-wide portfolio metrics for the system reports page.
   */
  async getPortfolioSummary(ctx: RequestContext): Promise<PortfolioSummary> {
    const { companyId } = ctx;
    const companyProjects = activeOnly({ companyId });
    const projectScope = {
      deletedAt: null,
      project: companyProjects,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thirtyDaysAgo = new Date(today);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [
      company,
      statusGroups,
      typeGroups,
      notStartedProjects,
      inProgressProjects,
      onHoldProjects,
      cancelledProjects,
      completedProjects,
      taskProgressGroups,
      budgetRows,
      usersTotal,
      usersActive,
      branches,
      departments,
      auditTotal,
      auditLast30Days,
      auditModuleGroups,
      openRfis,
      overdueRfis,
      openIssues,
      openPunchItems,
      completionRate,
    ] = await Promise.all([
      this.prisma.company.findFirst({
        where: { id: companyId },
        select: { legalName: true, baseCurrency: true },
      }),
      this.prisma.project.groupBy({
        by: ['status'],
        where: companyProjects,
        _count: { _all: true },
      }),
      this.prisma.project.groupBy({
        by: ['projectType'],
        where: companyProjects,
        _count: { _all: true },
      }),
      this.prisma.project.count({
        where: { ...companyProjects, status: ProjectStatus.NOT_STARTED },
      }),
      this.prisma.project.count({
        where: { ...companyProjects, status: ProjectStatus.IN_PROGRESS },
      }),
      this.prisma.project.count({
        where: { ...companyProjects, status: ProjectStatus.ON_HOLD },
      }),
      this.prisma.project.count({
        where: { ...companyProjects, status: ProjectStatus.CANCELLED },
      }),
      this.prisma.project.count({
        where: { ...companyProjects, status: ProjectStatus.COMPLETED },
      }),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: activeOnly({ project: companyProjects }),
        _avg: { progressPct: true },
      }),
      this.prisma.project.findMany({
        where: companyProjects,
        select: { budget: true },
      }),
      this.prisma.user.count({ where: activeOnly({ companyId }) }),
      this.prisma.user.count({
        where: activeOnly({ companyId, isActive: true }),
      }),
      this.prisma.branch.count({ where: activeOnly({ companyId }) }),
      this.prisma.department.count({ where: activeOnly({ companyId }) }),
      this.prisma.auditLog.count({ where: { companyId } }),
      this.prisma.auditLog.count({
        where: { companyId, createdAt: { gte: thirtyDaysAgo } },
      }),
      this.prisma.auditLog.groupBy({
        by: ['module'],
        where: { companyId, createdAt: { gte: thirtyDaysAgo } },
        _count: { _all: true },
      }),
      this.prisma.rfi.count({
        where: {
          ...projectScope,
          status: { not: RfiStatus.CLOSED },
        },
      }),
      this.prisma.rfi.count({
        where: {
          ...projectScope,
          dueDate: { lt: today },
          status: { notIn: [RfiStatus.CLOSED, RfiStatus.ANSWERED] },
        },
      }),
      this.prisma.issue.count({
        where: {
          ...projectScope,
          status: { not: IssueStatus.CLOSED },
        },
      }),
      this.prisma.punchItem.count({
        where: {
          ...projectScope,
          status: { not: PunchItemStatus.CLOSED },
        },
      }),
      this.getPortfolioCompletionRate(ctx),
    ]);

    const byStatus: Record<string, number> = {};
    for (const group of statusGroups) {
      byStatus[group.status] = group._count._all;
    }

    const byType: Record<string, number> = {};
    for (const group of typeGroups) {
      const key = group.projectType ?? 'UNSPECIFIED';
      byType[key] = group._count._all;
    }

    const totalProjects = statusGroups.reduce(
      (sum, group) => sum + group._count._all,
      0,
    );

    const budgetTotal = budgetRows.reduce((sum, row) => {
      if (row.budget == null) {
        return sum;
      }
      return sum + Number(row.budget);
    }, 0);

    const averageProgressPct = averageProjectProgressPct(
      taskProgressGroups
        .map((group) => group._avg.progressPct)
        .filter((value): value is number => value != null),
    );

    const topModules = auditModuleGroups
      .sort((a, b) => b._count._all - a._count._all)
      .slice(0, 6)
      .map((group) => ({
        module: group.module,
        count: group._count._all,
      }));

    const totalOpenSiteOps =
      openRfis + overdueRfis + openIssues + openPunchItems;

    return {
      generatedAt: new Date().toISOString(),
      companyName: company?.legalName ?? 'Company',
      baseCurrency: company?.baseCurrency ?? 'USD',
      completionRate: completionRate.rate,
      projects: {
        total: totalProjects,
        notStarted: notStartedProjects,
        inProgress: inProgressProjects,
        onHold: onHoldProjects,
        cancelled: cancelledProjects,
        completed: completedProjects,
        active: inProgressProjects,
        averageProgressPct,
        totalBudget:
          budgetTotal > 0 ? budgetTotal.toFixed(2) : null,
        byStatus,
        byType,
      },
      users: {
        total: usersTotal,
        active: usersActive,
        inactive: Math.max(0, usersTotal - usersActive),
      },
      organization: {
        branches,
        departments,
      },
      audit: {
        last30Days: auditLast30Days,
        total: auditTotal,
        topModules,
      },
      siteOps: {
        openRfis,
        overdueRfis,
        openIssues,
        openPunchItems,
        totalOpen: totalOpenSiteOps,
      },
    };
  }

  /**
   * Returns portfolio completion rate (% of projects completed or closed).
   */
  async getPortfolioCompletionRate(
    ctx: RequestContext,
  ): Promise<{ rate: number }> {
    const where = activeOnly({ companyId: ctx.companyId });
    const [total, completed] = await Promise.all([
      this.prisma.project.count({ where }),
      this.prisma.project.count({
        where: {
          ...where,
          status: { in: [ProjectStatus.COMPLETED] },
        },
      }),
    ]);

    const rate =
      total === 0 ? 0 : Math.round((completed / total) * 100);

    return { rate };
  }

  private async findScheduleOrThrow(
    reportId: string,
    scheduleId: string,
  ): Promise<void> {
    const schedule = await this.prisma.reportSchedule.findFirst({
      where: activeOnly({ id: scheduleId, reportId }),
    });
    if (!schedule) {
      throw new NotFoundException('Report schedule not found');
    }
  }

  private assertCanEdit(
    report: { createdBy: string; isSystem: boolean },
    ctx: RequestContext,
  ): void {
    if (report.isSystem) {
      throw new ForbiddenException('System reports cannot be modified');
    }
    if (report.createdBy !== ctx.userId) {
      throw new ForbiddenException('Only the report owner can modify it');
    }
  }
}
