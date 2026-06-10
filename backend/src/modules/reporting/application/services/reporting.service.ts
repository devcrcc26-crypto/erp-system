import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
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
