import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  ApprovalRequestStatus,
  InspectionRepairStatus,
  InspectionRepairType,
  InspectionRepairUrgency,
  Prisma,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  ListInspectionRepairsDto,
  SubmitInspectionRepairDto,
  UpdateInspectionRepairDto,
} from '../dtos/inspection-repair.dtos';
import { OnBehalfService } from '../../../on-behalf/on-behalf.service';

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

type CompatibleInspectionRepairRow = {
  id: string;
  companyId: string;
  employeeId: string;
  location: string;
  deviceName: string;
  description: string;
  make: string | null;
  model: string | null;
  year: number | null;
  urgency: string;
  solution: string | null;
  requestNumber: string;
  inspectionType: string;
  status: string;
  submittedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  employeeIdJoin: string;
  firstName: string;
  lastName: string;
  email: string | null;
};

@Injectable()
export class InspectionRepairService {
  private readonly logger = new Logger(InspectionRepairService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
    private readonly onBehalfService: OnBehalfService,
  ) {}

  async submitRequest(
    dto: SubmitInspectionRepairDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const employeeId = await this.onBehalfService.resolveTargetEmployeeId(
      userId,
      companyId,
      dto.onBehalfOfEmployeeId,
    );
    const resolved = await this.resolveAssetDetails(dto, companyId, employeeId);
    const requestNumber = await this.nextRequestNumber();
    const id = randomUUID();
    const now = new Date();

    const data = {
      id,
      companyId,
      employeeId,
      assetId: resolved.assetId,
      deviceName: resolved.deviceName,
      location: dto.location.trim(),
      make: resolved.make,
      model: resolved.model,
      year: resolved.year,
      description: dto.description.trim(),
      solution: dto.solution?.trim() || null,
      urgency: dto.urgency,
      inspectionType: dto.inspectionType,
      requestNumber,
      status: InspectionRepairStatus.SUBMITTED,
      submittedAt: now,
      createdBy: userId,
      updatedBy: userId,
    } as Prisma.InspectionRepairUncheckedCreateInput;

    const created = await this.prisma.inspectionRepair.create({
      data,
      include: this.detailInclude(),
    });

    await this.onBehalfService.recordOnBehalfCreate({
      moduleCode: 'INSPECTION_REPAIR',
      companyId,
      actorUserId: userId,
      employeeId,
      recordId: id,
      recordReference: requestNumber,
      autoApproveTier: dto.autoApproveTier,
    });

    return created;
  }

  /**
   * Creates a DRAFT inspection & repair request for an employee without
   * submitting it. Used by the Excel importer.
   */
  async createDraftFromImport(
    employeeId: string,
    dto: SubmitInspectionRepairDto,
    companyId: string,
    actorUserId: string,
  ): Promise<{ id: string; requestNumber: string }> {
    if (employeeId !== actorUserId) {
      const canManage = await this.permissionService.hasPermission(
        actorUserId,
        companyId,
        'inspection-repair',
        'manage',
      );
      if (!canManage) {
        throw new ForbiddenException(
          'Only HR can import inspection & repair requests for another employee',
        );
      }
    }

    const employee = await this.prisma.user.findFirst({
      where: activeOnly({ id: employeeId, companyId }),
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const resolved = await this.resolveAssetDetails(dto, companyId, employeeId);

    const data = {
      id: randomUUID(),
      companyId,
      employeeId,
      assetId: resolved.assetId,
      deviceName: resolved.deviceName,
      location: dto.location.trim(),
      make: resolved.make,
      model: resolved.model,
      year: resolved.year,
      description: dto.description.trim(),
      solution: dto.solution?.trim() || null,
      urgency: dto.urgency,
      inspectionType: dto.inspectionType,
      requestNumber: await this.nextRequestNumber(),
      status: InspectionRepairStatus.DRAFT,
      createdBy: actorUserId,
      updatedBy: actorUserId,
    } as Prisma.InspectionRepairUncheckedCreateInput;

    return this.prisma.inspectionRepair.create({
      data,
      select: { id: true, requestNumber: true },
    });
  }

  async listRequests(
    filters: ListInspectionRepairsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    try {
      return await this.listRequestsViaPrisma(filters, companyId, userId);
    } catch (error) {
      if (!this.isSchemaMismatch(error)) {
        throw error;
      }
      this.logger.warn(
        'InspectionRepair schema is behind the Prisma client; listing without asset join',
      );
      return this.listRequestsCompatible(filters, companyId, userId);
    }
  }

  async getRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    try {
      const request = await this.prisma.inspectionRepair.findFirst({
        where: activeOnly({ id, companyId }),
        include: this.detailInclude(),
      });
      if (!request) {
        throw new NotFoundException('Inspection and repair request not found');
      }
      await this.assertCanView(
        request.employeeId,
        companyId,
        userId,
        request.createdBy,
      );
      return request;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ForbiddenException) {
        throw error;
      }
      if (!this.isSchemaMismatch(error)) {
        throw error;
      }
      const request = await this.getRequestCompatible(id, companyId);
      if (!request) {
        throw new NotFoundException('Inspection and repair request not found');
      }
      await this.assertCanView(
        request.employeeId as string,
        companyId,
        userId,
        (request as { createdBy?: string }).createdBy,
      );
      return request;
    }
  }

  async updateRequest(
    id: string,
    dto: UpdateInspectionRepairDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.inspectionRepair.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Inspection and repair request not found');
    }

    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'inspection-repair',
      'manage',
    );
    const isOwnerDraft =
      request.employeeId === userId && request.status === InspectionRepairStatus.DRAFT;
    if (!canManage && !isOwnerDraft) {
      throw new ForbiddenException('You cannot update this request');
    }

    // completedAt is an instant (not a calendar day), so it is compared to the current time.
    if (dto.completedAt) {
      const completedAt = new Date(dto.completedAt);
      if (completedAt.getTime() > Date.now()) {
        throw new BadRequestException('Completion date cannot be in the future');
      }
      if (request.submittedAt && completedAt < request.submittedAt) {
        throw new BadRequestException(
          'Completion date cannot be before the submission date',
        );
      }
    }

    const resolved = await this.resolveAssetDetails(dto, companyId, request.employeeId);

    const data = {
      assetId: resolved.assetId,
      deviceName: resolved.deviceName,
      location: dto.location.trim(),
      make: resolved.make,
      model: resolved.model,
      year: resolved.year,
      description: dto.description.trim(),
      solution: dto.solution?.trim() || null,
      urgency: dto.urgency,
      inspectionType: dto.inspectionType,
      updatedBy: userId,
      ...(dto.status ? { status: dto.status } : {}),
      ...(dto.completedAt
        ? { completedAt: new Date(dto.completedAt) }
        : dto.status === InspectionRepairStatus.REPAIRED
          ? { completedAt: new Date() }
          : {}),
      ...(dto.status === InspectionRepairStatus.IN_REPAIR
        ? { completedAt: null }
        : {}),
    } as Prisma.InspectionRepairUncheckedUpdateInput;

    return this.prisma.inspectionRepair.update({
      where: { id },
      data,
      include: this.detailInclude(),
    });
  }

  async cancelRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.inspectionRepair.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!request) {
      throw new NotFoundException('Inspection and repair request not found');
    }
    if (request.employeeId !== userId) {
      throw new ForbiddenException('Only the request owner can cancel it');
    }
    if (
      request.status !== InspectionRepairStatus.DRAFT &&
      request.status !== InspectionRepairStatus.SUBMITTED
    ) {
      throw new BadRequestException('Only draft or submitted requests can be cancelled');
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Soft-delete the request (no CANCELLED status on this model).
      await tx.inspectionRepair.update({
        where: { id },
        data: {
          deletedAt: now,
          deletedBy: userId,
          updatedBy: userId,
        },
      });
      if (request.approvalRequestId) {
        await tx.approvalRequest.update({
          where: { id: request.approvalRequestId },
          data: {
            status: ApprovalRequestStatus.CANCELLED,
            completedAt: now,
            updatedBy: userId,
          },
        });
      }
    });

    return { success: true };
  }

  async listMyAssignedAssets(companyId: string, userId: string): Promise<unknown[]> {
    const assignments = await this.prisma.assetAssignment.findMany({
      where: activeOnly({
        companyId,
        userId,
        returnedAt: null,
      }),
      orderBy: { assignedAt: 'desc' },
      include: {
        asset: true,
      },
    });

    return assignments.map((assignment) => ({
      id: assignment.asset.id,
      serialNumber: assignment.asset.serialNumber,
      brand: assignment.asset.brand,
      model: assignment.asset.model,
      year: assignment.asset.year,
      type: assignment.asset.type,
      status: assignment.asset.status,
      assignedAt: assignment.assignedAt,
    }));
  }

  private detailInclude() {
    return {
      employee: { select: USER_SELECT },
      asset: {
        select: {
          id: true,
          serialNumber: true,
          brand: true,
          model: true,
          year: true,
          type: true,
          status: true,
          description: true,
        },
      },
      approvalRequest: {
        include: {
          tiers: {
            include: { approver: { select: USER_SELECT } },
            orderBy: { tierOrder: 'asc' as const },
          },
        },
      },
    } as Prisma.InspectionRepairInclude;
  }

  private async resolveAssetDetails(
    dto: SubmitInspectionRepairDto | UpdateInspectionRepairDto,
    companyId: string,
    employeeId: string,
  ): Promise<{
    assetId: string | null;
    deviceName: string;
    make: string;
    model: string;
    year: number | null;
  }> {
    if (dto.assetId) {
      const assignment = await this.prisma.assetAssignment.findFirst({
        where: activeOnly({
          companyId,
          userId: employeeId,
          assetId: dto.assetId,
          returnedAt: null,
        }),
        include: { asset: true },
      });
      if (!assignment) {
        throw new BadRequestException(
          'Selected asset is not currently assigned to this employee',
        );
      }

      return {
        assetId: assignment.asset.id,
        deviceName: `${assignment.asset.brand} ${assignment.asset.model}`.trim(),
        make: assignment.asset.brand,
        model: assignment.asset.model,
        year: assignment.asset.year,
      };
    }

    if (!dto.deviceName?.trim()) {
      throw new BadRequestException('Device name is required when no asset is selected');
    }

    return {
      assetId: null,
      deviceName: dto.deviceName.trim(),
      make: dto.make?.trim() ?? '',
      model: dto.model?.trim() ?? '',
      year: dto.year ?? null,
    };
  }

  private async assertCanView(
    employeeId: string,
    companyId: string,
    userId: string,
    createdBy?: string,
  ): Promise<void> {
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'inspection-repair',
      'manage',
    );
    if (canManage || employeeId === userId || createdBy === userId) {
      return;
    }
    throw new ForbiddenException('You do not have access to this request');
  }

  private normalizeStatuses(status?: string): InspectionRepairStatus[] | undefined {
    if (!status?.trim()) {
      return undefined;
    }
    if (status.includes(',')) {
      return status
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean) as InspectionRepairStatus[];
    }
    return [status as InspectionRepairStatus];
  }

  private expandLegacyStatuses(statuses: InspectionRepairStatus[]): string[] {
    const values = new Set<string>(statuses);
    if (statuses.includes(InspectionRepairStatus.IN_REPAIR)) {
      values.add('APPROVED');
    }
    if (statuses.includes(InspectionRepairStatus.REJECTED)) {
      values.add('RETURNED');
    }
    return [...values];
  }

  private mapLegacyStatus(status: string): InspectionRepairStatus {
    if (status === 'APPROVED') {
      return InspectionRepairStatus.IN_REPAIR;
    }
    if (status === 'RETURNED') {
      return InspectionRepairStatus.REJECTED;
    }
    return status as InspectionRepairStatus;
  }

  private isSchemaMismatch(error: unknown): boolean {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return ['P2010', 'P2022', 'P2023'].includes(error.code);
    }
    const message = error instanceof Error ? error.message : String(error);
    return /asset_id|InspectionRepairStatus|incompatible value|does not exist/i.test(
      message,
    );
  }

  private async listRequestsViaPrisma(
    filters: ListInspectionRepairsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const statuses = this.normalizeStatuses(filters.status);
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'inspection-repair',
      'manage',
    );

    const where: Prisma.InspectionRepairWhereInput = {
      companyId,
      deletedAt: null,
      ...(canManage ? {} : { employeeId: userId }),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(canManage && filters.employeeId ? { employeeId: filters.employeeId } : {}),
      ...(filters.urgency ? { urgency: filters.urgency } : {}),
      ...(filters.inspectionType ? { inspectionType: filters.inspectionType } : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                requestNumber: {
                  contains: filters.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                deviceName: {
                  contains: filters.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                location: {
                  contains: filters.search.trim(),
                  mode: 'insensitive',
                },
              },
              {
                description: {
                  contains: filters.search.trim(),
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...(filters.dateFrom || filters.dateTo
        ? {
            createdAt: {
              ...(filters.dateFrom ? { gte: new Date(filters.dateFrom) } : {}),
              ...(filters.dateTo ? { lte: new Date(filters.dateTo) } : {}),
            },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.inspectionRepair.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          employee: { select: USER_SELECT },
          asset: {
            select: {
              id: true,
              serialNumber: true,
              brand: true,
              model: true,
              year: true,
              type: true,
              status: true,
            },
          },
        },
      }),
      this.prisma.inspectionRepair.count({ where }),
    ]);

    return buildPaginatedResult(rows, total, page, limit);
  }

  private async listRequestsCompatible(
    filters: ListInspectionRepairsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const canManage = await this.permissionService.hasPermission(
      userId,
      companyId,
      'inspection-repair',
      'manage',
    );
    const whereSql = this.buildCompatibleWhereSql(
      filters,
      companyId,
      userId,
      canManage,
    );

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<CompatibleInspectionRepairRow[]>`
        SELECT
          ir.id,
          ir.company_id AS "companyId",
          ir.employee_id AS "employeeId",
          ir.location,
          ir.device_name AS "deviceName",
          ir.description,
          ir.make,
          ir.model,
          ir.year,
          ir.urgency::text AS urgency,
          ir.solution,
          ir.inspection_repair_number AS "requestNumber",
          ir.inspection_type::text AS "inspectionType",
          ir.status::text AS status,
          ir.submitted_at AS "submittedAt",
          ir.completed_at AS "completedAt",
          ir.created_at AS "createdAt",
          u.id AS "employeeIdJoin",
          u.first_name AS "firstName",
          u.last_name AS "lastName",
          u.email
        FROM inspection_repair ir
        INNER JOIN "user" u ON u.id = ir.employee_id
        WHERE ${whereSql}
        ORDER BY ir.created_at DESC
        LIMIT ${take} OFFSET ${skip}
      `,
      this.prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT COUNT(*)::bigint AS count
        FROM inspection_repair ir
        WHERE ${whereSql}
      `,
    ]);

    const mapped = rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      requestNumber: row.requestNumber,
      location: row.location,
      deviceName: row.deviceName,
      description: row.description,
      make: row.make,
      model: row.model,
      year: row.year,
      solution: row.solution,
      urgency: row.urgency as InspectionRepairUrgency,
      inspectionType: row.inspectionType as InspectionRepairType,
      status: this.mapLegacyStatus(row.status),
      submittedAt: row.submittedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      assetId: null,
      asset: null,
      employee: {
        id: row.employeeIdJoin,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
      },
    }));

    return buildPaginatedResult(
      mapped,
      Number(countRows[0]?.count ?? 0),
      page,
      limit,
    );
  }

  private async getRequestCompatible(
    id: string,
    companyId: string,
  ): Promise<Record<string, unknown> | null> {
    const rows = await this.prisma.$queryRaw<CompatibleInspectionRepairRow[]>`
      SELECT
        ir.id,
        ir.company_id AS "companyId",
        ir.employee_id AS "employeeId",
        ir.location,
        ir.device_name AS "deviceName",
        ir.description,
        ir.make,
        ir.model,
        ir.year,
        ir.urgency::text AS urgency,
        ir.solution,
        ir.inspection_repair_number AS "requestNumber",
        ir.inspection_type::text AS "inspectionType",
        ir.status::text AS status,
        ir.submitted_at AS "submittedAt",
        ir.completed_at AS "completedAt",
        ir.created_at AS "createdAt",
        u.id AS "employeeIdJoin",
        u.first_name AS "firstName",
        u.last_name AS "lastName",
        u.email
      FROM inspection_repair ir
      INNER JOIN "user" u ON u.id = ir.employee_id
      WHERE ir.id = ${id}
        AND ir.company_id = ${companyId}
        AND ir.deleted_at IS NULL
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) {
      return null;
    }
    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      requestNumber: row.requestNumber,
      location: row.location,
      deviceName: row.deviceName,
      description: row.description,
      make: row.make,
      model: row.model,
      year: row.year,
      solution: row.solution,
      urgency: row.urgency as InspectionRepairUrgency,
      inspectionType: row.inspectionType as InspectionRepairType,
      status: this.mapLegacyStatus(row.status),
      submittedAt: row.submittedAt,
      completedAt: row.completedAt,
      createdAt: row.createdAt,
      assetId: null,
      asset: null,
      approvalRequest: null,
      employee: {
        id: row.employeeIdJoin,
        firstName: row.firstName,
        lastName: row.lastName,
        email: row.email,
      },
    };
  }

  private buildCompatibleWhereSql(
    filters: ListInspectionRepairsDto,
    companyId: string,
    userId: string,
    isHrViewer: boolean,
  ): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      Prisma.sql`ir.company_id = ${companyId}`,
      Prisma.sql`ir.deleted_at IS NULL`,
    ];

    if (!isHrViewer) {
      parts.push(Prisma.sql`ir.employee_id = ${userId}`);
    } else if (filters.employeeId) {
      parts.push(Prisma.sql`ir.employee_id = ${filters.employeeId}`);
    }

    const statuses = this.normalizeStatuses(filters.status);
    if (statuses?.length) {
      parts.push(
        Prisma.sql`ir.status::text IN (${Prisma.join(this.expandLegacyStatuses(statuses))})`,
      );
    }
    if (filters.urgency) {
      parts.push(Prisma.sql`ir.urgency::text = ${filters.urgency}`);
    }
    if (filters.inspectionType) {
      parts.push(Prisma.sql`ir.inspection_type::text = ${filters.inspectionType}`);
    }

    const search = filters.search?.trim();
    if (search) {
      const pattern = `%${search}%`;
      parts.push(
        Prisma.sql`(
          ir.inspection_repair_number ILIKE ${pattern}
          OR ir.device_name ILIKE ${pattern}
          OR ir.location ILIKE ${pattern}
          OR ir.description ILIKE ${pattern}
        )`,
      );
    }

    if (filters.dateFrom) {
      parts.push(Prisma.sql`ir.created_at >= ${new Date(filters.dateFrom)}`);
    }
    if (filters.dateTo) {
      parts.push(Prisma.sql`ir.created_at <= ${new Date(filters.dateTo)}`);
    }

    return Prisma.join(parts, ' AND ');
  }

  private async nextRequestNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('inspection_repair_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `IR-${String(seq).padStart(4, '0')}`;
  }
}