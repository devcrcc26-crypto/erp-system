import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  FuelType,
  FolderContextType,
  Prisma,
  VehicleApplicationStatus,
  VehicleStatus,
} from '@prisma/client';
import { randomUUID } from 'crypto';
import { DocumentService } from '../../../documents/application/services/document.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  CreateCompanyVehicleDto,
  UpdateCompanyVehicleDto,
  ListCompanyVehiclesDto,
  AvailableVehiclesQueryDto,
} from '../dtos/company-vehicle.dtos';

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const ASSIGNED_DRIVER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
} as const;

/**
 * Company vehicle fleet management - CRUD + availability checking.
 */
@Injectable()
export class CompanyVehicleService {
  private readonly logger = new Logger(CompanyVehicleService.name);

  private static readonly PHOTO_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documentService: DocumentService,
  ) {}

  /** Lists vehicles with optional search and status filter. */
  async listVehicles(
    filters: ListCompanyVehiclesDto,
    companyId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const where: Prisma.CompanyVehicleWhereInput = {
      companyId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                plateNumber: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                make: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
              {
                model: {
                  contains: filters.search.trim(),
                  mode: 'insensitive' as const,
                },
              },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.companyVehicle.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          assignedDriver: { select: ASSIGNED_DRIVER_SELECT },
        },
      }),
      this.prisma.companyVehicle.count({ where }),
    ]);

    return buildPaginatedResult(rows, total, page, limit);
  }

  /** Creates a new company vehicle. */
  async createVehicle(
    dto: CreateCompanyVehicleDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const plate = dto.plateNumber.trim().toUpperCase();

    const existing = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ companyId, plateNumber: plate }),
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(
        `Vehicle with plate number "${plate}" already exists`,
      );
    }

    return this.prisma.companyVehicle.create({
      data: {
        id: randomUUID(),
        companyId,
        plateNumber: plate,
        vehicleType: dto.vehicleType,
        make: dto.make.trim(),
        model: dto.model.trim(),
        year: dto.year,
        fuelType: dto.fuelType ?? FuelType.DIESEL,
        color: dto.color?.trim() || null,
        assignedDriverId: dto.assignedDriverId || null,
        notes: dto.notes?.trim() || null,
        isActive: dto.isActive ?? true,
        status: VehicleStatus.AVAILABLE,
        createdBy: userId,
        updatedBy: userId,
      },
      include: {
        assignedDriver: { select: ASSIGNED_DRIVER_SELECT },
      },
    });
  }

  /**
   * Returns all vehicles with their availability status for a given time range.
   * A vehicle is unavailable if it has an overlapping application in
   * SUBMITTED, IN_REVIEW, or APPROVED status.
   */
  async getAvailableVehicles(
    query: AvailableVehiclesQueryDto,
    companyId: string,
  ): Promise<unknown[]> {
    const departure = new Date(query.departureDatetime);
    const returnDt = new Date(query.returnDatetime);

    if (returnDt <= departure) {
      throw new BadRequestException(
        'Return date/time must be after departure date/time',
      );
    }

    const vehicles = await this.prisma.companyVehicle.findMany({
      where: activeOnly({
        companyId,
        status: { not: VehicleStatus.RETIRED },
      }),
      orderBy: { plateNumber: 'asc' },
      include: {
        assignedDriver: { select: ASSIGNED_DRIVER_SELECT },
      },
    });

    const conflictingStatuses = [
      VehicleApplicationStatus.SUBMITTED,
      VehicleApplicationStatus.IN_REVIEW,
      VehicleApplicationStatus.APPROVED,
    ];

    const conflicts = await this.prisma.vehicleApplication.findMany({
      where: activeOnly({
        companyId,
        vehicleId: { in: vehicles.map((v) => v.id) },
        status: { in: conflictingStatuses },
        departureDatetime: { lt: returnDt },
        returnDatetime: { gt: departure },
      }),
      select: {
        vehicleId: true,
        departureDatetime: true,
        returnDatetime: true,
        applicationNumber: true,
      },
    });

    const conflictMap = new Map<
      string,
      { from: Date; to: Date; applicationNumber: string }
    >();
    for (const c of conflicts) {
      if (!conflictMap.has(c.vehicleId)) {
        conflictMap.set(c.vehicleId, {
          from: c.departureDatetime,
          to: c.returnDatetime,
          applicationNumber: c.applicationNumber,
        });
      }
    }

    return vehicles.map((v) => {
      const conflict = conflictMap.get(v.id);
      return {
        ...v,
        isAvailable: !conflict && v.status === VehicleStatus.AVAILABLE,
        conflictPeriod: conflict
          ? {
              from: conflict.from,
              to: conflict.to,
              applicationNumber: conflict.applicationNumber,
            }
          : null,
      };
    });
  }

  /** Fetches a single vehicle by id. */
  async getVehicle(id: string, companyId: string): Promise<unknown> {
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id, companyId }),
      include: {
        assignedDriver: { select: ASSIGNED_DRIVER_SELECT },
      },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    return vehicle;
  }

  /** Updates vehicle details. */
  async updateVehicle(
    id: string,
    dto: UpdateCompanyVehicleDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    if (dto.plateNumber !== undefined) {
      const plate = dto.plateNumber.trim().toUpperCase();
      const existing = await this.prisma.companyVehicle.findFirst({
        where: activeOnly({
          companyId,
          plateNumber: plate,
          id: { not: id },
        }),
        select: { id: true },
      });
      if (existing) {
        throw new ConflictException(
          `Vehicle with plate number "${plate}" already exists`,
        );
      }
    }

    return this.prisma.companyVehicle.update({
      where: { id },
      data: {
        ...(dto.plateNumber !== undefined
          ? { plateNumber: dto.plateNumber.trim().toUpperCase() }
          : {}),
        ...(dto.vehicleType !== undefined
          ? { vehicleType: dto.vehicleType }
          : {}),
        ...(dto.make !== undefined ? { make: dto.make.trim() } : {}),
        ...(dto.model !== undefined ? { model: dto.model.trim() } : {}),
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.fuelType !== undefined ? { fuelType: dto.fuelType } : {}),
        ...(dto.color !== undefined
          ? { color: dto.color?.trim() || null }
          : {}),
        ...(dto.assignedDriverId !== undefined
          ? { assignedDriverId: dto.assignedDriverId || null }
          : {}),
        ...(dto.notes !== undefined
          ? { notes: dto.notes?.trim() || null }
          : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        updatedBy: userId,
      },
      include: {
        assignedDriver: { select: ASSIGNED_DRIVER_SELECT },
      },
    });
  }

  /** Updates vehicle status. */
  async updateVehicleStatus(
    id: string,
    status: VehicleStatus,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    return this.prisma.companyVehicle.update({
      where: { id },
      data: { status, updatedBy: userId },
    });
  }

  /** Soft-deletes a vehicle. */
  async deleteVehicle(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    await this.prisma.companyVehicle.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        updatedBy: userId,
      },
    });
  }

  /**
   * Uploads (or replaces) a vehicle photo linked via `photoDocumentId`.
   */
  async uploadVehiclePhoto(
    vehicleId: string,
    file: UploadedFile,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    if (!CompanyVehicleService.PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Vehicle photo must be a JPEG, PNG, WebP, or GIF image',
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Vehicle photo must be 5 MB or smaller');
    }

    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id: vehicleId, companyId }),
      select: { id: true, photoDocumentId: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }

    const folderName = 'Company Vehicle Photos';
    const existingFolder = await this.prisma.documentFolder.findFirst({
      where: {
        companyId,
        contextType: FolderContextType.COMPANY,
        contextId: null,
        name: folderName,
        parentId: null,
        deletedAt: null,
      },
      select: { id: true },
    });

    const folderId =
      existingFolder?.id ??
      (
        await this.prisma.documentFolder.create({
          data: {
            id: randomUUID(),
            companyId,
            parentId: null,
            name: folderName,
            path: `/${folderName}`,
            contextType: FolderContextType.COMPANY,
            contextId: null,
            isSystem: false,
            createdBy: userId,
            updatedBy: userId,
          },
          select: { id: true },
        })
      ).id;

    const uploadedDocument = await this.documentService.uploadDocument(
      { companyId, userId },
      folderId,
      file,
    );

    const updated = await this.prisma.companyVehicle.update({
      where: { id: vehicleId },
      data: {
        photoDocumentId: (uploadedDocument as { id: string }).id,
        updatedBy: userId,
      },
      include: {
        assignedDriver: { select: ASSIGNED_DRIVER_SELECT },
      },
    });

    if (
      vehicle.photoDocumentId &&
      vehicle.photoDocumentId !== (uploadedDocument as { id: string }).id
    ) {
      await this.documentService.deleteDocument(
        { companyId, userId },
        vehicle.photoDocumentId,
      );
    }

    return updated;
  }

  /**
   * Presigned download URL for a vehicle photo (HR/vehicles viewers).
   * Bypasses documents.view - photos live in a COMPANY folder.
   */
  async getVehiclePhotoDownloadUrl(
    vehicleId: string,
    companyId: string,
    userId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id: vehicleId, companyId }),
      select: { id: true, photoDocumentId: true },
    });

    if (!vehicle?.photoDocumentId) {
      throw new NotFoundException('Vehicle photo not found');
    }

    return this.documentService.getDownloadUrl(
      { companyId, userId },
      vehicle.photoDocumentId,
    );
  }

  /** Removes the vehicle photo link and soft-deletes the document. */
  async deleteVehiclePhoto(
    vehicleId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const vehicle = await this.prisma.companyVehicle.findFirst({
      where: activeOnly({ id: vehicleId, companyId }),
      select: { id: true, photoDocumentId: true },
    });
    if (!vehicle) {
      throw new NotFoundException('Vehicle not found');
    }
    if (!vehicle.photoDocumentId) {
      throw new NotFoundException('Vehicle photo not found');
    }

    const previousDocumentId = vehicle.photoDocumentId;

    const updated = await this.prisma.companyVehicle.update({
      where: { id: vehicleId },
      data: {
        photoDocumentId: null,
        updatedBy: userId,
      },
      include: {
        assignedDriver: { select: ASSIGNED_DRIVER_SELECT },
      },
    });

    await this.documentService.deleteDocument(
      { companyId, userId },
      previousDocumentId,
    );

    return updated;
  }
}
