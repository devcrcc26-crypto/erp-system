import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateDailyLogDto,
  PmListQueryDto,
  UpdateDailyLogDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapDailyLog,
  mapDailyLogDetail,
  MappedDailyLog,
  MappedDailyLogDetail,
  parseOptionalDate,
  parseOptionalDecimal,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { ProjectScopeService } from './project-scope.service';

const DAILY_LOG_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'logDate',
  'status',
]);

const DAILY_LOG_DETAIL_INCLUDE = {
  workforce: { orderBy: { createdAt: 'asc' as const } },
  equipment: { orderBy: { createdAt: 'asc' as const } },
  visitors: { orderBy: { createdAt: 'asc' as const } },
  incidents: { orderBy: { createdAt: 'asc' as const } },
};

@Injectable()
export class DailyLogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
  ) {}

  /**
   * Returns a paginated list of daily logs for a project.
   */
  async listDailyLogs(
    ctx: PmContext,
    projectId: string,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedDailyLog>> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const where = this.buildListWhere(projectId, query);
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const orderBy = buildPmOrderBy(
      query.sortBy,
      query.sortOrder,
      DAILY_LOG_SORT_FIELDS,
    );

    const [rows, total] = await Promise.all([
      this.prisma.dailyLog.findMany({ where, skip, take, orderBy }),
      this.prisma.dailyLog.count({ where }),
    ]);

    return buildPaginatedResult(
      rows.map(mapDailyLog),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Returns a daily log with workforce, equipment, visitors, and incidents.
   */
  async getDailyLog(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
  ): Promise<MappedDailyLogDetail> {
    const row = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    return mapDailyLogDetail(row);
  }

  /**
   * Creates a daily log for the current site engineer.
   */
  async createDailyLog(
    ctx: PmContext,
    projectId: string,
    dto: CreateDailyLogDto,
  ): Promise<MappedDailyLogDetail> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const row = await this.prisma.dailyLog.create({
      data: {
        projectId,
        siteEngineerId: ctx.userId,
        logDate: new Date(dto.logDate),
        shift: dto.shift,
        weatherCondition: dto.weatherCondition,
        temperatureC: parseOptionalDecimal(dto.temperatureC),
        rainfallMm: parseOptionalDecimal(dto.rainfallMm),
        workSummary: dto.workSummary,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: DAILY_LOG_DETAIL_INCLUDE,
    });

    return mapDailyLogDetail(row);
  }

  /**
   * Updates an existing daily log scoped to a project.
   */
  async updateDailyLog(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    dto: UpdateDailyLogDto,
  ): Promise<MappedDailyLogDetail> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);

    const row = await this.prisma.dailyLog.update({
      where: { id: dailyLogId },
      data: {
        logDate: dto.logDate ? new Date(dto.logDate) : undefined,
        shift: dto.shift,
        weatherCondition: dto.weatherCondition,
        temperatureC: parseOptionalDecimal(dto.temperatureC),
        rainfallMm: parseOptionalDecimal(dto.rainfallMm),
        workSummary: dto.workSummary,
        status: dto.status,
        updatedBy: ctx.userId,
      },
      include: DAILY_LOG_DETAIL_INCLUDE,
    });

    return mapDailyLogDetail(row);
  }

  /**
   * Soft-deletes a daily log scoped to a project.
   */
  async deleteDailyLog(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
  ): Promise<void> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.prisma.dailyLog.update({
      where: { id: dailyLogId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private buildListWhere(
    projectId: string,
    query: PmListQueryDto,
  ): Prisma.DailyLogWhereInput {
    const where: Prisma.DailyLogWhereInput = activeOnly({ projectId });

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { workSummary: { contains: term, mode: 'insensitive' } },
        { shift: { contains: term, mode: 'insensitive' } },
        { weatherCondition: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private async getDailyLogDetailOrThrow(projectId: string, dailyLogId: string) {
    const row = await this.prisma.dailyLog.findFirst({
      where: activeOnly({ id: dailyLogId, projectId }),
      include: DAILY_LOG_DETAIL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Daily log not found');
    }
    return row;
  }
}
