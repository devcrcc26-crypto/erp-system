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
  DailyLog,
  DailyLogStatus,
  IncidentSeverity,
  IncidentType,
  Prisma,
  RainfallLevel,
  VisitorPurpose,
  WeatherCondition,
} from '@prisma/client';
import { hasFullProjectDataAccess } from '../../../../shared/permissions/project-admin.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { subtaskRoleOr } from '../../domain/task-access-scope.util';
import { formatUserDisplayName } from '../../../../shared/utils/user-display.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import { NotificationService } from '../../../notifications/application/services/notification.service';
import {
  CreateDailyLogDto,
  CreateDailyLogEquipmentDto,
  CreateDailyLogIncidentDto,
  CreateDailyLogMaterialDto,
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
  mapDailyLogMaterial,
  mapDailyLogVisitor,
  mapDailyLogWorkforce,
  MappedDailyLog,
  MappedDailyLogDetail,
  MappedDailyLogEquipment,
  MappedDailyLogIncident,
  MappedDailyLogMaterial,
  MappedDailyLogVisitor,
  MappedDailyLogWorkforce,
  parseOptionalDecimal,
  toDateString,
} from '../utils/pm-mapper.util';
import { buildPmOrderBy } from '../utils/pm-pagination.util';
import { parseStatusFilter } from '../utils/parse-status-filter.util';
import {
  enrichRowsWithUserDisplayNames,
  enrichWithUserDisplayNames,
} from '../utils/pm-user-names.util';
import { PM_DAILY_LOG_USER_NAMES } from '../utils/pm-user-name-fields.const';
import { EngineeringDocumentFolderService } from './engineering-document-folder.service';
import { ProjectScopeService } from './project-scope.service';

const DAILY_LOG_SUBMITTED_EVENT = 'daily_log.submitted';
const DAILY_LOG_APPROVED_EVENT = 'daily_log.approved';
const DAILY_LOG_RECALLED_EVENT = 'daily_log.recalled';

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
  materials: { orderBy: { createdAt: 'asc' as const } },
};

const DAILY_LOG_LIST_INCLUDE = {
  workforce: { select: { workerCount: true } },
  _count: {
    select: {
      equipment: true,
      visitors: true,
      incidents: true,
      materials: true,
    },
  },
};

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
    @Optional() private readonly notificationService?: NotificationService,
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
   * Returns a daily log with workforce, equipment, visitors, incidents, and materials.
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
          status: 'DRAFT',
          logDate: new Date(dto.logDate),
          shift: dto.shift,
          weatherCondition: dto.weatherCondition as WeatherCondition,
          temperatureC: parseOptionalDecimal(dto.temperatureC),
          rainfallMm: parseOptionalDecimal(dto.rainfallMm),
          rainfallLevel: dto.rainfallLevel
            ? (dto.rainfallLevel as RainfallLevel)
            : undefined,
          humidity: parseOptionalDecimal(dto.humidity),
          workDescription: dto.workDescription,
          workforceCount: dto.workforceCount,
          contractorName: dto.contractorName,
          issues: dto.issues,
          delays: dto.delays,
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
   * Updates editable fields of a daily log. Status changes must use
   * submitDailyLog / approveDailyLog / recallDailyLog.
   */
  async updateDailyLog(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    dto: UpdateDailyLogDto,
  ): Promise<MappedDailyLogDetail> {
    const existing = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanEditDailyLog(ctx, existing);

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
        weatherCondition: dto.weatherCondition
          ? (dto.weatherCondition as WeatherCondition)
          : undefined,
        temperatureC: parseOptionalDecimal(dto.temperatureC),
        rainfallMm: parseOptionalDecimal(dto.rainfallMm),
        rainfallLevel: dto.rainfallLevel
          ? (dto.rainfallLevel as RainfallLevel)
          : undefined,
        humidity: parseOptionalDecimal(dto.humidity),
        workDescription: dto.workDescription,
        workforceCount: dto.workforceCount,
        contractorName: dto.contractorName,
        issues: dto.issues,
        delays: dto.delays,
        supervisorId: dto.supervisorId,
        supervisedAt: supervisorChanged
          ? dto.supervisorId
            ? new Date()
            : null
          : undefined,
        updatedBy: ctx.userId,
      },
      include: DAILY_LOG_DETAIL_INCLUDE,
    });

    return this.enrichDailyLogDetail(ctx, projectId, row);
  }

  /**
   * Advances a DRAFT daily log to SUBMITTED status.
   * Only the creator may submit their own log.
   */
  async submitDailyLog(
    ctx: PmContext,
    projectId: string,
    logId: string,
  ): Promise<MappedDailyLogDetail> {
    const log = await this.getDailyLogDetailOrThrow(projectId, logId);

    if (log.status !== 'DRAFT') {
      throw new BadRequestException(
        'Only DRAFT daily logs can be submitted.',
      );
    }
    if (log.createdBy !== ctx.userId) {
      throw new ForbiddenException(
        'Only the creator may submit this daily log.',
      );
    }

    const row = await this.prisma.dailyLog.update({
      where: { id: logId },
      data: {
        status: 'SUBMITTED',
        submittedAt: new Date(),
        submittedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: DAILY_LOG_DETAIL_INCLUDE,
    });

    await this.sendDailyLogSubmittedNotification(ctx, row);

    return this.enrichDailyLogDetail(ctx, projectId, row);
  }

  /**
   * Approves a SUBMITTED daily log. The supervisor or a full-access user may approve.
   */
  async approveDailyLog(
    ctx: PmContext,
    projectId: string,
    logId: string,
  ): Promise<MappedDailyLogDetail> {
    const log = await this.getDailyLogDetailOrThrow(projectId, logId);

    if (log.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'Only SUBMITTED daily logs can be approved.',
      );
    }

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    const isSupervisor = log.supervisorId === ctx.userId;
    if (!isSupervisor && !hasFullProjectDataAccess(roleNames)) {
      throw new ForbiddenException(
        'Only the assigned supervisor or a project administrator may approve this daily log.',
      );
    }

    const row = await this.prisma.dailyLog.update({
      where: { id: logId },
      data: {
        status: 'APPROVED',
        approvedAt: new Date(),
        approvedBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      include: DAILY_LOG_DETAIL_INCLUDE,
    });

    await this.sendDailyLogApprovedNotification(ctx, row);

    return this.enrichDailyLogDetail(ctx, projectId, row);
  }

  /**
   * Recalls a SUBMITTED daily log back to DRAFT status.
   * The creator or a full-access user may recall.
   */
  async recallDailyLog(
    ctx: PmContext,
    projectId: string,
    logId: string,
  ): Promise<MappedDailyLogDetail> {
    const log = await this.getDailyLogDetailOrThrow(projectId, logId);

    if (log.status !== 'SUBMITTED') {
      throw new BadRequestException(
        'Only SUBMITTED daily logs can be recalled.',
      );
    }

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    const isCreator = log.createdBy === ctx.userId;
    if (!isCreator && !hasFullProjectDataAccess(roleNames)) {
      throw new ForbiddenException(
        'Only the creator or a project administrator may recall this daily log.',
      );
    }

    const row = await this.prisma.dailyLog.update({
      where: { id: logId },
      data: {
        status: 'DRAFT',
        submittedAt: null,
        submittedBy: null,
        updatedBy: ctx.userId,
      },
      include: DAILY_LOG_DETAIL_INCLUDE,
    });

    await this.sendDailyLogRecalledNotification(ctx, row);

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
    await this.assertCanEditDailyLog(ctx, log);

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
    await this.assertCanEditDailyLog(ctx, log);
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
    await this.assertCanEditDailyLog(ctx, log);

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
    await this.assertCanEditDailyLog(ctx, log);
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
    await this.assertCanEditDailyLog(ctx, log);

    const row = await this.prisma.dailyLogVisitor.create({
      data: {
        dailyLogId,
        visitorName: dto.visitorName,
        company: dto.company,
        purpose: dto.purpose as VisitorPurpose,
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
    await this.assertCanEditDailyLog(ctx, log);
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
    await this.assertCanEditDailyLog(ctx, log);

    const row = await this.prisma.dailyLogIncident.create({
      data: {
        dailyLogId,
        incidentType: dto.incidentType as IncidentType,
        description: dto.description,
        severity: dto.severity as IncidentSeverity,
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
    await this.assertCanEditDailyLog(ctx, log);
    await this.deleteChildOrThrow(
      this.prisma.dailyLogIncident,
      incidentId,
      dailyLogId,
      'Incident entry not found',
    );
  }

  /**
   * Adds a material entry to a daily log.
   */
  async addMaterial(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    dto: CreateDailyLogMaterialDto,
  ): Promise<MappedDailyLogMaterial> {
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanEditDailyLog(ctx, log);

    const row = await this.prisma.dailyLogMaterial.create({
      data: {
        dailyLogId,
        materialType: dto.materialType,
        quantity: dto.quantity,
        unit: dto.unit,
        supplier: dto.supplier,
        createdBy: ctx.userId,
      },
    });

    return mapDailyLogMaterial(row);
  }

  /**
   * Removes a material entry from a daily log.
   */
  async removeMaterial(
    ctx: PmContext,
    projectId: string,
    dailyLogId: string,
    materialId: string,
  ): Promise<void> {
    const log = await this.getDailyLogDetailOrThrow(projectId, dailyLogId);
    await this.assertCanEditDailyLog(ctx, log);
    await this.deleteChildOrThrow(
      this.prisma.dailyLogMaterial,
      materialId,
      dailyLogId,
      'Material entry not found',
    );
  }

  /**
   * Asserts the user may edit this daily log:
   * - status must not be APPROVED, AND
   * - user must be the creator, the supervisor, or have full project data access.
   */
  async assertCanEditDailyLog(
    ctx: PmContext,
    log: {
      status: string;
      createdBy: string;
      supervisorId?: string | null;
    },
  ): Promise<void> {
    if (log.status === 'APPROVED') {
      throw new ForbiddenException(
        'Approved daily logs cannot be modified.',
      );
    }

    const roleNames = await this.permissionService.getUserRoleNames(
      ctx.userId,
      ctx.companyId,
    );
    if (
      log.createdBy === ctx.userId ||
      log.supervisorId === ctx.userId ||
      hasFullProjectDataAccess(roleNames)
    ) {
      return;
    }

    throw new ForbiddenException(
      'You do not have permission to edit this daily log.',
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
        OR: subtaskRoleOr(ctx.userId),
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

    const statusFilter = parseStatusFilter<DailyLogStatus>(query.status);
    if (statusFilter) {
      where.status = statusFilter;
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
        { logNumber: { contains: term, mode: 'insensitive' } },
        { workDescription: { contains: term, mode: 'insensitive' } },
        { contractorName: { contains: term, mode: 'insensitive' } },
        { shift: { contains: term, mode: 'insensitive' } },
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
      OR: subtaskRoleOr(ctx.userId),
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
    const myStatusFilter = parseStatusFilter<DailyLogStatus>(query.status);
    if (myStatusFilter) {
      where.status = myStatusFilter;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.AND = [
        {
          OR: [
            { logNumber: { contains: term, mode: 'insensitive' } },
            { workDescription: { contains: term, mode: 'insensitive' } },
            { contractorName: { contains: term, mode: 'insensitive' } },
            { shift: { contains: term, mode: 'insensitive' } },
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
    const companyStatusFilter = parseStatusFilter<DailyLogStatus>(query.status);
    if (companyStatusFilter) {
      where.status = companyStatusFilter;
    }
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { logNumber: { contains: term, mode: 'insensitive' } },
        { workDescription: { contains: term, mode: 'insensitive' } },
        { contractorName: { contains: term, mode: 'insensitive' } },
        { shift: { contains: term, mode: 'insensitive' } },
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

  private async sendDailyLogSubmittedNotification(
    ctx: PmContext,
    log: DailyLog,
  ): Promise<void> {
    if (!this.notificationService || !log.supervisorId) {
      return;
    }

    const link = `/projects/${log.projectId}/daily-logs/${log.id}`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: log.supervisorId,
          eventType: DAILY_LOG_SUBMITTED_EVENT,
          subject: `Daily log ${log.logNumber ?? log.id} submitted for approval`,
          body: `Daily log ${log.logNumber ?? log.id} has been submitted for your approval.`,
          variables: {
            projectId: log.projectId,
            dailyLogId: log.id,
            logNumber: log.logNumber ?? log.id,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Daily log submitted notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async sendDailyLogApprovedNotification(
    ctx: PmContext,
    log: DailyLog,
  ): Promise<void> {
    if (!this.notificationService) {
      return;
    }

    const approverName = await this.resolveUserName(ctx, ctx.userId);
    const link = `/projects/${log.projectId}/daily-logs/${log.id}`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: log.createdBy,
          eventType: DAILY_LOG_APPROVED_EVENT,
          subject: `Daily log ${log.logNumber ?? log.id} has been approved`,
          body: `Daily log ${log.logNumber ?? log.id} has been approved by ${approverName}.`,
          variables: {
            projectId: log.projectId,
            dailyLogId: log.id,
            logNumber: log.logNumber ?? log.id,
            approverName,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Daily log approved notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async sendDailyLogRecalledNotification(
    ctx: PmContext,
    log: DailyLog,
  ): Promise<void> {
    if (!this.notificationService || !log.supervisorId) {
      return;
    }

    const link = `/projects/${log.projectId}/daily-logs/${log.id}`;

    try {
      await this.notificationService.send(
        { companyId: ctx.companyId, userId: ctx.userId },
        {
          recipientId: log.supervisorId,
          eventType: DAILY_LOG_RECALLED_EVENT,
          subject: `Daily log ${log.logNumber ?? log.id} has been recalled`,
          body: `Daily log ${log.logNumber ?? log.id} has been recalled and returned to draft.`,
          variables: {
            projectId: log.projectId,
            dailyLogId: log.id,
            logNumber: log.logNumber ?? log.id,
            link,
          },
        },
      );
    } catch (error: unknown) {
      this.logger.warn(
        'Daily log recalled notification failed',
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
