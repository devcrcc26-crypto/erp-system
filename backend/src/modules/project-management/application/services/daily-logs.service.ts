import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DailyLog, Prisma } from '@prisma/client';
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
  CreateDailyLogDto,
  CreateDailyLogEquipmentDto,
  CreateDailyLogIncidentDto,
  CreateDailyLogVisitorDto,
  CreateDailyLogWorkforceDto,
  DailyLogListQueryDto,
  PmListQueryDto,
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
import {
  enrichRowsWithUserDisplayNames,
  enrichWithUserDisplayNames,
} from '../utils/pm-user-names.util';
import {
  PM_DAILY_LOG_USER_NAMES,
} from '../utils/pm-user-name-fields.const';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';

const DAILY_LOG_SORT_FIELDS = new Set([
  'createdAt',
  'updatedAt',
  'logDate',
  'status',
  'logNumber',
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
  'humidity',
  'workSummary',
  'workforceCount',
  'contractorName',
  'issues',
  'delays',
  'equipment',
  'materials',
  'supervisorId',
] as const satisfies ReadonlyArray<keyof UpdateDailyLogDto>;

function hasDailyLogDataChanges(dto: UpdateDailyLogDto): boolean {
  return DAILY_LOG_DATA_FIELDS.some((field) => dto[field] !== undefined);
}

export type MappedMyDailyLog = MappedDailyLog & {
  projectName: string;
  projectCode: string;
};

export interface DailyLogProjectOption {
  id: string;
  projectCode: string;
  name: string;
}

@Injectable()
export class DailyLogsService {
  private readonly logger = new Logger(DailyLogsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
    private readonly engineeringDocumentFolderService: EngineeringDocumentFolderService,
    private readonly permissionService: PermissionService,
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
    await this.assertCanAccessDailyLog(ctx, { projectId }, 'view');

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
      PM_DAILY_LOG_USER_NAMES,
    );

    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-scoped daily logs relevant to the current user.
   */
  async listMyDailyLogs(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyDailyLog>> {
    const where = this.buildMyDailyLogListWhere(ctx, query);
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
        include: {
          ...DAILY_LOG_LIST_INCLUDE,
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.dailyLog.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map((row) => this.mapMyDailyLogRow(ctx, row)),
    );
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Company-wide daily logs for portfolio / admin users.
   */
  async listAllDailyLogs(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Promise<PaginatedResult<MappedMyDailyLog>> {
    const where = this.buildCompanyDailyLogListWhere(ctx, query);
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
        include: {
          ...DAILY_LOG_LIST_INCLUDE,
          project: { select: { id: true, name: true, projectCode: true } },
        },
      }),
      this.prisma.dailyLog.count({ where }),
    ]);

    const data = await Promise.all(
      rows.map((row) => this.mapMyDailyLogRow(ctx, row)),
    );
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  /**
   * Distinct projects with daily logs relevant to the current user.
   */
  async listMyDailyLogProjects(
    ctx: PmContext,
  ): Promise<DailyLogProjectOption[]> {
    const where = this.buildMyDailyLogListWhere(ctx, {});
    const rows = await this.prisma.dailyLog.findMany({
      where,
      select: {
        project: { select: { id: true, projectCode: true, name: true } },
      },
    });

    const byId = new Map<string, DailyLogProjectOption>();
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
   * Returns a daily log with workforce, equipment, visitors, and incidents.
   */
  async getDailyLog(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
  ): Promise<MappedDailyLogDetail> {
    const row = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, row, 'view');
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
    const project = await this.projectScopeService.getProjectOrThrow(
      ctx,
      projectId,
    );
    await this.assertCanAccessDailyLog(ctx, { projectId }, 'create');

    if (dto.supervisorId) {
      await this.assertUserInCompany(ctx, dto.supervisorId);
    }

    const count = await this.prisma.dailyLog.count({
      where: activeOnly({ projectId }),
    });
    const seq = String(count + 1).padStart(3, '0');
    const logNumber = `DL-${project.projectCode}-${seq}`;

    try {
      const row = await this.prisma.dailyLog.create({
        data: {
          companyId: project.companyId,
          projectId,
          siteEngineerId: ctx.userId,
          logNumber,
          logDate: new Date(dto.logDate),
          shift: dto.shift,
          weatherCondition: dto.weatherCondition,
          temperatureC: parseOptionalDecimal(dto.temperatureC),
          rainfallMm: parseOptionalDecimal(dto.rainfallMm),
          humidity: parseOptionalDecimal(dto.humidity),
          workSummary: dto.workSummary,
          workforceCount: dto.workforceCount,
          contractorName: dto.contractorName,
          issues: dto.issues,
          delays: dto.delays,
          equipmentNotes: dto.equipment,
          materials: dto.materials,
          supervisorId: dto.supervisorId,
          supervisedAt: dto.supervisorId ? new Date() : undefined,
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

      return this.enrichDailyLogDetail(ctx, projectId, row, folder.id);
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
    await this.assertCanAccessDailyLog(ctx, existing, 'edit');

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

    if (dto.supervisorId) {
      await this.assertUserInCompany(ctx, dto.supervisorId);
    }

    const supervisorChanged =
      dto.supervisorId !== undefined &&
      dto.supervisorId !== existing.supervisorId;

    const row = await this.prisma.dailyLog.update({
      where: { id: dailyLogId },
      data: {
        logDate: dto.logDate ? new Date(dto.logDate) : undefined,
        shift: dto.shift,
        weatherCondition: dto.weatherCondition,
        temperatureC: parseOptionalDecimal(dto.temperatureC),
        rainfallMm: parseOptionalDecimal(dto.rainfallMm),
        humidity: parseOptionalDecimal(dto.humidity),
        workSummary: dto.workSummary,
        workforceCount: dto.workforceCount,
        contractorName: dto.contractorName,
        issues: dto.issues,
        delays: dto.delays,
        equipmentNotes: dto.equipment,
        materials: dto.materials,
        supervisorId: dto.supervisorId,
        supervisedAt: supervisorChanged
          ? dto.supervisorId
            ? new Date()
            : null
          : undefined,
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
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, log, 'edit');

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
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, log, 'edit');
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
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, log, 'edit');

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
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, log, 'edit');
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
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, log, 'edit');

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
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, log, 'edit');
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
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, log, 'edit');

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
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanAccessDailyLog(ctx, log, 'edit');
    await this.deleteChildOrThrow(
      this.prisma.dailyLogIncident,
      incidentId,
      dailyLogId,
      'Incident entry not found',
    );
  }

  /**
   * Asserts the user may view/create/edit a daily log via PM permission,
   * project membership, creator/supervisor ownership, or FK package roles.
   */
  async assertCanAccessDailyLog(
    ctx: PmContext,
    log: {
      projectId: string;
      createdBy?: string | null;
      supervisorId?: string | null;
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
      'daily_logs',
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
      (log.createdBy === ctx.userId || log.supervisorId === ctx.userId)
    ) {
      return;
    }

    const projectMember = await this.prisma.projectTeam.findFirst({
      where: activeOnly({
        projectId: log.projectId,
        userId: ctx.userId,
      }),
      select: { id: true },
    });
    if (projectMember && (action === 'view' || action === 'create')) {
      return;
    }

    const hasFkRole = await this.prisma.designPackage.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        taskDiscipline: {
          task: {
            projectId: log.projectId,
          },
        },
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
    if (hasFkRole) {
      return;
    }

    throw new ForbiddenException('Access denied');
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
        { logNumber: { contains: term, mode: 'insensitive' } },
        { contractorName: { contains: term, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private buildMyDailyLogListWhere(
    ctx: PmContext,
    query: Partial<PmListQueryDto>,
  ): Prisma.DailyLogWhereInput {
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

    const where: Prisma.DailyLogWhereInput = activeOnly({
      companyId: ctx.companyId,
      OR: [
        { createdBy: ctx.userId },
        { supervisorId: ctx.userId },
        { siteEngineerId: ctx.userId },
        {
          project: {
            tasks: {
              some: {
                disciplines: {
                  some: {
                    designPackages: {
                      some: assignedPackageWhere,
                    },
                  },
                },
              },
            },
          },
        },
      ],
    });

    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { logNumber: { contains: term, mode: 'insensitive' } },
            { workSummary: { contains: term, mode: 'insensitive' } },
            { contractorName: { contains: term, mode: 'insensitive' } },
            { weatherCondition: { contains: term, mode: 'insensitive' } },
            { project: { name: { contains: term, mode: 'insensitive' } } },
            {
              project: { projectCode: { contains: term, mode: 'insensitive' } },
            },
          ],
        },
      ];
    }

    return where;
  }

  private buildCompanyDailyLogListWhere(
    ctx: PmContext,
    query: PmListQueryDto,
  ): Prisma.DailyLogWhereInput {
    const where: Prisma.DailyLogWhereInput = activeOnly({
      companyId: ctx.companyId,
    });

    if (query.projectId) {
      where.projectId = query.projectId;
    }
    if (query.status) {
      where.status = query.status;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { logNumber: { contains: term, mode: 'insensitive' } },
        { workSummary: { contains: term, mode: 'insensitive' } },
        { contractorName: { contains: term, mode: 'insensitive' } },
        { weatherCondition: { contains: term, mode: 'insensitive' } },
        { project: { name: { contains: term, mode: 'insensitive' } } },
        { project: { projectCode: { contains: term, mode: 'insensitive' } } },
      ];
    }

    return where;
  }

  private async mapMyDailyLogRow(
    ctx: PmContext,
    row: DailyLog & {
      workforce?: { workerCount: number }[];
      project: { id: string; name: string; projectCode: string };
    },
  ): Promise<MappedMyDailyLog> {
    const mapped = await enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapDailyLog(row),
      PM_DAILY_LOG_USER_NAMES,
    );
    return {
      ...mapped,
      projectName: row.project.name,
      projectCode: row.project.projectCode,
    };
  }

  private async enrichDailyLogDetail(
    ctx: PmContext,
    projectId: string,
    row: Prisma.DailyLogGetPayload<{ include: typeof DAILY_LOG_DETAIL_INCLUDE }>,
    knownFolderId?: string | null,
  ): Promise<MappedDailyLogDetail> {
    let attachmentFolderId: string | null = knownFolderId ?? null;

    if (attachmentFolderId === null) {
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
    }

    return enrichWithUserDisplayNames(
      this.prisma,
      ctx.companyId,
      mapDailyLogDetail(row, attachmentFolderId),
      PM_DAILY_LOG_USER_NAMES,
    );
  }

  private async getDailyLogDetailOrThrow(
    projectId: string,
    dailyLogId: string,
  ) {
    const row = await this.prisma.dailyLog.findFirst({
      where: activeOnly({ id: dailyLogId, projectId }),
      include: DAILY_LOG_DETAIL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Daily log not found');
    }
    return row;
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
