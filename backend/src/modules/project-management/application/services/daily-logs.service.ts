import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
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
  CreateDailyLogEquipmentDto,
  CreateDailyLogIncidentDto,
  CreateDailyLogVisitorDto,
  CreateDailyLogWorkforceDto,
  DailyLogListQueryDto,
  UpdateDailyLogDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapDailyLog,
  mapDailyLogDetail,
  mapDailyLogEquipment,
  mapDailyLogIncident,
  mapDailyLogVisitor,
  mapDailyLogWorkforce,
  MappedDailyLog,
  MappedDailyLogDetail,
  MappedDailyLogEquipment,
  MappedDailyLogIncident,
  MappedDailyLogVisitor,
  MappedDailyLogWorkforce,
  parseOptionalDecimal,
  toDateString,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { enrichRowsWithUserDisplayNames, enrichWithUserDisplayNames } from '../utils/pm-user-names.util';
import { PM_SITE_ENGINEER_NAME } from '../utils/pm-user-name-fields.const';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
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

const DAILY_LOG_LIST_INCLUDE = {
  workforce: { select: { workerCount: true } },
};

const IMMUTABLE_DAILY_LOG_STATUSES = new Set(['SUBMITTED', 'APPROVED']);

const DAILY_LOG_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ['SUBMITTED'],
  SUBMITTED: ['APPROVED'],
  APPROVED: [],
};

const DAILY_LOG_DATA_FIELDS = [
  'logDate',
  'shift',
  'weatherCondition',
  'temperatureC',
  'rainfallMm',
  'workSummary',
] as const satisfies ReadonlyArray<keyof UpdateDailyLogDto>;

function hasDailyLogDataChanges(dto: UpdateDailyLogDto): boolean {
  return DAILY_LOG_DATA_FIELDS.some((field) => dto[field] !== undefined);
}

@Injectable()
export class DailyLogsService {
  private readonly logger = new Logger(DailyLogsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
  ) {}

  /**
   * Returns a paginated list of daily logs for a project.
   */
  async listDailyLogs(
    ctx: PmContext,
    projectId: string,
    query: DailyLogListQueryDto,
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
      this.prisma.dailyLog.findMany({
        where,
        skip,
        take,
        orderBy,
        include: DAILY_LOG_LIST_INCLUDE,
      }),
      this.prisma.dailyLog.count({ where }),
    ]);

    const data = await enrichRowsWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      rows.map(mapDailyLog),
      PM_SITE_ENGINEER_NAME,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
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
    return this.enrichDailyLogDetail(ctx, projectId, row);
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

    try {
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

      const folder =
        await this.engineeringDocumentFolderService.ensureDailyLogFolder(
          ctx,
          projectId,
          row.id,
          toDateString(row.logDate)!,
        );

      return mapDailyLogDetail(row, folder.id);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'A daily log already exists for this project, date, and shift.',
        );
      }
      throw error;
    }
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
    const existing = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);

    if (
      IMMUTABLE_DAILY_LOG_STATUSES.has(existing.status) &&
      hasDailyLogDataChanges(dto)
    ) {
      throw new BadRequestException(
        'Daily log data fields cannot be modified after submission. Only status advancement is permitted.',
      );
    }

    if (dto.status !== undefined && dto.status !== existing.status) {
      const allowed = DAILY_LOG_STATUS_TRANSITIONS[existing.status] ?? [];
      if (!allowed.includes(dto.status)) {
        throw new BadRequestException(
          `Invalid daily log status transition from ${existing.status} to ${dto.status}.`,
        );
      }
    }

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

    return this.enrichDailyLogDetail(ctx, projectId, row);
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

  /**
   * Adds a workforce entry to a daily log.
   */
  async addWorkforce(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    dto: CreateDailyLogWorkforceDto,
  ): Promise<MappedDailyLogWorkforce> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);

    const row = await this.prisma.dailyLogWorkforce.create({
      data: {
        dailyLogId,
        trade: dto.trade,
        contractor: dto.contractor,
        workerCount: dto.workerCount,
        createdBy: ctx.userId,
      },
    });

    return mapDailyLogWorkforce(row);
  }

  /**
   * Removes a workforce entry from a daily log.
   */
  async removeWorkforce(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    workforceId: string,
  ): Promise<void> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.deleteChildOrThrow(
      this.prisma.dailyLogWorkforce,
      workforceId,
      dailyLogId,
      'Workforce entry not found',
    );
  }

  /**
   * Adds an equipment entry to a daily log.
   */
  async addEquipment(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    dto: CreateDailyLogEquipmentDto,
  ): Promise<MappedDailyLogEquipment> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);

    const row = await this.prisma.dailyLogEquipment.create({
      data: {
        dailyLogId,
        equipmentType: dto.equipmentType,
        quantity: dto.quantity ?? 1,
        hoursUsed: parseOptionalDecimal(dto.hoursUsed),
        hoursDowntime: parseOptionalDecimal(dto.hoursDowntime),
        createdBy: ctx.userId,
      },
    });

    return mapDailyLogEquipment(row);
  }

  /**
   * Removes an equipment entry from a daily log.
   */
  async removeEquipment(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    equipmentId: string,
  ): Promise<void> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.deleteChildOrThrow(
      this.prisma.dailyLogEquipment,
      equipmentId,
      dailyLogId,
      'Equipment entry not found',
    );
  }

  /**
   * Adds a visitor entry to a daily log.
   */
  async addVisitor(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    dto: CreateDailyLogVisitorDto,
  ): Promise<MappedDailyLogVisitor> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);

    const row = await this.prisma.dailyLogVisitor.create({
      data: {
        dailyLogId,
        visitorName: dto.visitorName,
        company: dto.company,
        purpose: dto.purpose,
        createdBy: ctx.userId,
      },
    });

    return mapDailyLogVisitor(row);
  }

  /**
   * Removes a visitor entry from a daily log.
   */
  async removeVisitor(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    visitorId: string,
  ): Promise<void> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.deleteChildOrThrow(
      this.prisma.dailyLogVisitor,
      visitorId,
      dailyLogId,
      'Visitor entry not found',
    );
  }

  /**
   * Adds an incident entry to a daily log.
   */
  async addIncident(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    dto: CreateDailyLogIncidentDto,
  ): Promise<MappedDailyLogIncident> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);

    const row = await this.prisma.dailyLogIncident.create({
      data: {
        dailyLogId,
        incidentType: dto.incidentType,
        description: dto.description,
        severity: dto.severity,
        createdBy: ctx.userId,
      },
    });

    return mapDailyLogIncident(row);
  }

  /**
   * Removes an incident entry from a daily log.
   */
  async removeIncident(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    incidentId: string,
  ): Promise<void> {
    await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.deleteChildOrThrow(
      this.prisma.dailyLogIncident,
      incidentId,
      dailyLogId,
      'Incident entry not found',
    );
  }

  private buildListWhere(
    projectId: string,
    query: DailyLogListQueryDto,
  ): Prisma.DailyLogWhereInput {
    const where: Prisma.DailyLogWhereInput = activeOnly({ projectId });

    if (query.status) {
      where.status = query.status;
    }

    if (query.logDateFrom || query.logDateTo) {
      where.logDate = {};
      if (query.logDateFrom) {
        where.logDate.gte = new Date(query.logDateFrom);
      }
      if (query.logDateTo) {
        where.logDate.lte = new Date(query.logDateTo);
      }
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

  private async enrichDailyLogDetail(
    ctx: PmContext,
    projectId: string,
    row: Prisma.DailyLogGetPayload<{ include: typeof DAILY_LOG_DETAIL_INCLUDE }>,
  ): Promise<MappedDailyLogDetail> {
    let attachmentFolderId: string | null = null;

    try {
      const folder =
        await this.engineeringDocumentFolderService.ensureDailyLogFolder(
          ctx,
          projectId,
          row.id,
          toDateString(row.logDate)!,
        );
      attachmentFolderId = folder.id;
    } catch (error) {
      this.logger.warn(
        `Daily log ${row.id} attachment folder could not be ensured`,
        error instanceof Error ? error.message : String(error),
      );
    }

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapDailyLogDetail(row, attachmentFolderId),
      PM_SITE_ENGINEER_NAME,
    );
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

  private async deleteChildOrThrow(
    delegate: {
      findFirst: (args: {
        where: { id: string; dailyLogId: string };
      }) => Promise<{ id: string } | null>;
      delete: (args: { where: { id: string } }) => Promise<unknown>;
    },
    childId: string,
    dailyLogId: string,
    notFoundMessage: string,
  ): Promise<void> {
    const existing = await delegate.findFirst({
      where: { id: childId, dailyLogId },
    });
    if (!existing) {
      throw new NotFoundException(notFoundMessage);
    }
    await delegate.delete({ where: { id: childId } });
  }
}
