import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AssetStatus,
  FolderContextType,
  InspectionRepairStatus,
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

const USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
} as const;

@Injectable()
export class InspectionRepairService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissionService: PermissionService,
  ) {}

  async submitRequest(
    dto: SubmitInspectionRepairDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const resolved = await this.resolveAssetDetails(dto, companyId, userId);
    const requestNumber = await this.nextRequestNumber();
    const id = randomUUID();
    const now = new Date();

    return this.prisma.inspectionRepair.create({
      data: {
        id,
        companyId,
        employeeId: userId,
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
      },
      include: this.detailInclude(),
    });
  }

  async listRequests(
    filters: ListInspectionRepairsDto,
    companyId: string,
    userId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);
    const statuses = this.normalizeStatuses(filters.status);
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );

    const where: Prisma.InspectionRepairWhereInput = {
      companyId,
      deletedAt: null,
      ...(isHrViewer ? {} : { employeeId: userId }),
      ...(statuses ? { status: { in: statuses } } : {}),
      ...(isHrViewer && filters.employeeId ? { employeeId: filters.employeeId } : {}),
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

  async getRequest(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const request = await this.prisma.inspectionRepair.findFirst({
      where: activeOnly({ id, companyId }),
      include: this.detailInclude(),
    });
    if (!request) {
      throw new NotFoundException('Inspection and repair request not found');
    }

    await this.assertCanView(request.employeeId, companyId, userId);
    return request;
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

    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    const isOwnerDraft =
      request.employeeId === userId && request.status === InspectionRepairStatus.DRAFT;
    if (!isHrViewer && !isOwnerDraft) {
      throw new ForbiddenException('You cannot update this request');
    }

    const resolved = await this.resolveAssetDetails(dto, companyId, request.employeeId);

    return this.prisma.inspectionRepair.update({
      where: { id },
      data: {
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
        ...(dto.status ? { status: dto.status } : {}),
        ...(dto.completedAt
          ? { completedAt: new Date(dto.completedAt) }
          : dto.status === InspectionRepairStatus.REPAIRED
            ? { completedAt: new Date() }
            : {}),
        ...(dto.status === InspectionRepairStatus.IN_REPAIR
          ? { completedAt: null }
          : {}),
        updatedBy: userId,
      },
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

    await this.prisma.inspectionRepair.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        updatedBy: userId,
      },
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
    } satisfies Prisma.InspectionRepairInclude;
  }

  private async resolveAssetDetails(
    dto: SubmitInspectionRepairDto | UpdateInspectionRepairDto,
    companyId: string,
    employeeId: string,
  ): Promise<{
    assetId: string | null;
    deviceName: string;
    make: string | null;
    model: string | null;
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
      make: dto.make?.trim() || null,
      model: dto.model?.trim() || null,
      year: dto.year ?? null,
    };
  }

  private async assertCanView(
    employeeId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const isHrViewer = await this.permissionService.hasPermission(
      userId,
      companyId,
      'hr',
      'view',
    );
    if (isHrViewer || employeeId === userId) {
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

  private async nextRequestNumber(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('inspection_repair_number_seq')
    `;
    const seq = Number(result[0].nextval);
    return `IR-${String(seq).padStart(4, '0')}`;
  }
}