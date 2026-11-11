import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AssetStatus, CompanyAsset, Prisma } from "@prisma/client";
import { FolderContextType } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { buildPaginatedResult, buildPrismaPagination, PaginatedResult } from "@/shared/utils/pagination.util";
import { PrismaService } from "@/shared/prisma/prisma.service";
import { activeOnly } from "@/shared/prisma/soft-delete.util";
import { PermissionService } from "@/shared/permissions/permission.service";

import {
  AcknowledgeAssetReturnDto,
  CreateCompanyAssetDto,
  ListCompanyAssetsDto,
  IssueCompanyAssetAssignmentDto,
  ListCompanyAssetAssignmentsDto,
  ReturnCompanyAssetAssignmentDto,
  UpdateCompanyAssetDto,
} from "../dtos/company-asset.dtos";
import { UpdateCompanyAssetStatusDto } from "../dtos/company-asset.dtos";
import { DocumentService } from "@/modules/documents/application/services/document.service";
import { computeAssetDepreciation } from "../utils/asset-depreciation.util";
import type { AssetDepreciationInput } from "../utils/asset-depreciation.util";

type UploadedFile = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

@Injectable()
export class CompanyAssetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documentService: DocumentService,
    private readonly permissionService: PermissionService,
  ) {}

  /** Lists company assets with optional search/status filters. */
  async listAssets(
    filters: ListCompanyAssetsDto,
    companyId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const where: Prisma.CompanyAssetWhereInput = {
      companyId,
      deletedAt: null,
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.search?.trim()
        ? {
            OR: [
              {
                serialNumber: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                brand: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                model: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                type: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                description: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                assetCode: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                assetName: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
              {
                assetCategory: {
                  contains: filters.search.trim(),
                  mode: "insensitive" as const,
                },
              },
            ],
          }
        : {}),
      ...(filters.type?.trim()
        ? {
            type: { contains: filters.type.trim(), mode: "insensitive" as const },
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.companyAsset.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: "desc" },
        include: {
          assetAssignments: {
            where: { deletedAt: null, returnedAt: null },
            take: 1,
            orderBy: { assignedAt: "desc" },
            include: {
              employee: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true,
                  email: true,
                },
              },
            },
          },
        },
      }),
      this.prisma.companyAsset.count({ where }),
    ]);

    const data = rows.map((row) => {
      const { assetAssignments, ...asset } = row;
      const currentAssignment = assetAssignments[0];
      return this.toAssetResponse({
        ...asset,
        assignedTo: currentAssignment?.employee ?? null,
        assignedAt: currentAssignment?.assignedAt ?? null,
      });
    });

    return buildPaginatedResult(data, total, page, limit);
  }

  /** Lists assets currently assigned to the authenticated employee. */
  async getMyAssets(companyId: string, userId: string): Promise<unknown[]> {
    const rows = await this.prisma.companyAsset.findMany({
      where: {
        companyId,
        deletedAt: null,
        assetAssignments: {
          some: {
            companyId,
            userId,
            deletedAt: null,
            returnedAt: null,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        assetAssignments: {
          where: {
            companyId,
            userId,
            deletedAt: null,
            returnedAt: null,
          },
          take: 1,
          orderBy: { assignedAt: 'desc' },
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return rows.map((row) => {
      const { assetAssignments, ...asset } = row;
      const currentAssignment = assetAssignments[0];
      return this.toAssetResponse({
        ...asset,
        assignedTo: currentAssignment?.employee ?? null,
        assignedAt: currentAssignment?.assignedAt ?? null,
      });
    });
  }

  /** Creates a new asset in the company register. */
  async createAsset(
    dto: CreateCompanyAssetDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const serial = dto.serialNumber.trim().toUpperCase();

    const existing = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ companyId, serialNumber: serial }),
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException(
        `Asset with serial number "${serial}" already exists`,
      );
    }

    const created = await this.prisma.companyAsset.create({
      data: {
        id: randomUUID(),
        companyId,
        serialNumber: serial,
        brand: dto.brand.trim(),
        model: dto.model.trim(),
        year: dto.year,
        color: dto.color?.trim() ?? '',
        type: dto.type.trim(),
        status: AssetStatus.AVAILABLE,
        description: dto.description?.trim() || null,
        ...this.buildLedgerCreateData(dto),
        photoDocumentId: dto.photoDocumentId ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return this.toAssetResponse(created);
  }

  /** Lists assets that are currently marked as available. */
  async getAvailableAssets(companyId: string): Promise<unknown[]> {
    const rows = await this.prisma.companyAsset.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: AssetStatus.AVAILABLE,
      },
      orderBy: { createdAt: "desc" },
    });

    return rows.map((row) => this.toAssetResponse(row));
  }

  /** Fetches a single asset by id (active record only). */
  async getAsset(id: string, companyId: string): Promise<unknown> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id, companyId }),
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    return this.toAssetResponse(asset);
  }

  /** Updates asset details. */
  async updateAsset(
    id: string,
    dto: UpdateCompanyAssetDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id, companyId }),
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    if (dto.serialNumber !== undefined) {
      const serial = dto.serialNumber.trim().toUpperCase();

      const existing = await this.prisma.companyAsset.findFirst({
        where: activeOnly({
          companyId,
          serialNumber: serial,
          id: { not: id },
        }),
        select: { id: true },
      });

      if (existing) {
        throw new ConflictException(
          `Asset with serial number "${serial}" already exists`,
        );
      }
    }

    const updated = await this.prisma.companyAsset.update({
      where: { id },
      data: {
        ...(dto.serialNumber !== undefined
          ? { serialNumber: dto.serialNumber.trim().toUpperCase() }
          : {}),
        ...(dto.brand !== undefined ? { brand: dto.brand.trim() } : {}),
        ...(dto.model !== undefined ? { model: dto.model.trim() } : {}),
        ...(dto.year !== undefined ? { year: dto.year } : {}),
        ...(dto.color !== undefined ? { color: dto.color.trim() } : {}),
        ...(dto.type !== undefined ? { type: dto.type.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...this.buildLedgerUpdateData(dto),
        ...(dto.photoDocumentId !== undefined
          ? { photoDocumentId: dto.photoDocumentId ?? null }
          : {}),
        updatedBy: userId,
      },
    });

    return this.toAssetResponse(updated);
  }

  /** Updates asset status. IN_USE is set only via issue assignment. */
  async updateAssetStatus(
    id: string,
    dto: UpdateCompanyAssetStatusDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id, companyId }),
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    if (asset.status === AssetStatus.IN_USE) {
      throw new ConflictException(
        "Return the asset assignment before changing status",
      );
    }

    if (dto.status === AssetStatus.IN_USE) {
      throw new BadRequestException(
        "In Use status is set automatically when the asset is issued",
      );
    }

    const allowed: AssetStatus[] = [
      AssetStatus.AVAILABLE,
      AssetStatus.REPAIRING,
      AssetStatus.DISPOSED,
    ];

    if (!allowed.includes(dto.status)) {
      throw new BadRequestException("Invalid asset status");
    }

    return this.prisma.companyAsset.update({
      where: { id },
      data: {
        status: dto.status,
        updatedBy: userId,
      },
    });
  }

  /** Soft-deletes an asset. */
  async deleteAsset(
    id: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id, companyId }),
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    await this.prisma.companyAsset.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
        updatedBy: userId,
      },
    });
  }

  /**
   * Uploads a single photo for an asset and links it via `photoDocumentId`.
   * Reuses the `Documents` module upload pipeline to store a `Document` + version.
   */
  async uploadAssetPhoto(
    assetId: string,
    file: UploadedFile,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id: assetId, companyId }),
      select: { id: true, photoDocumentId: true },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    const folderName = "Company Asset Photos";

    // One company-level folder for all company assets photos.
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
      (await this.prisma.documentFolder.create({
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
      })).id;

    const uploadedDocument = await this.documentService.uploadDocument(
      { companyId, userId },
      folderId,
      file,
    );

    return this.prisma.companyAsset.update({
      where: { id: assetId },
      data: {
        photoDocumentId: (uploadedDocument as { id: string }).id,
        updatedBy: userId,
      },
    }).then((row) => this.toAssetResponse(row));
  }

  /**
   * Presigned download URL for an asset photo.
   * Allowed for HR/assets viewers, or the employee currently assigned the asset.
   */
  async getAssetPhotoDownloadUrl(
    assetId: string,
    companyId: string,
    userId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id: assetId, companyId }),
      select: { id: true, photoDocumentId: true },
    });

    if (!asset?.photoDocumentId) {
      throw new NotFoundException("Asset photo not found");
    }

    await this.assertCanViewAssetPhoto(asset.id, companyId, userId);

    return this.documentService.getDownloadUrl(
      { companyId, userId },
      asset.photoDocumentId,
    );
  }

  /**
   * Removes the asset photo link and soft-deletes the document.
   */
  async removeAssetPhoto(
    assetId: string,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id: assetId, companyId }),
      select: { id: true, photoDocumentId: true },
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    if (!asset.photoDocumentId) {
      throw new NotFoundException("Asset photo not found");
    }

    const previousDocumentId = asset.photoDocumentId;

    const updated = await this.prisma.companyAsset.update({
      where: { id: assetId },
      data: {
        photoDocumentId: null,
        updatedBy: userId,
      },
    });

    await this.documentService.deleteDocument(
      { companyId, userId },
      previousDocumentId,
    );

    return this.toAssetResponse(updated);
  }

  /** Ensures the user may view this asset's photo (register access or assignee). */
  private async assertCanViewAssetPhoto(
    assetId: string,
    companyId: string,
    userId: string,
  ): Promise<void> {
    const assetsView = await this.permissionService.hasPermission(userId, companyId, "assets", "view");

    if (assetsView) {
      return;
    }

    const assignment = await this.prisma.assetAssignment.findFirst({
      where: {
        companyId,
        assetId,
        userId,
        deletedAt: null,
        returnedAt: null,
      },
      select: { id: true },
    });

    if (!assignment) {
      throw new ForbiddenException(
        "You do not have permission to view this asset photo",
      );
    }
  }

  /** Lists asset assignments for a given asset (active only by default). */
  async listAssetAssignments(
    assetId: string,
    query: ListCompanyAssetAssignmentsDto,
    companyId: string,
  ): Promise<PaginatedResult<unknown>> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const { skip, take } = buildPrismaPagination(page, limit);

    const includeReturned =
      query.includeReturned === true || String(query.includeReturned) === 'true';

    const whereBase: Prisma.AssetAssignmentWhereInput = {
      companyId,
      assetId,
      ...(query.employeeId ? { userId: query.employeeId } : {}),
      // `includeReturned` may come through as string ("false"/"true") from query params.
      ...(includeReturned ? {} : { returnedAt: null }),
    };

    const where = activeOnly(whereBase);

    const [rows, total] = await Promise.all([
      this.prisma.assetAssignment.findMany({
        where,
        skip,
        take,
        orderBy: { assignedAt: "desc" },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true },
          },
          returnedBy: { select: { id: true, firstName: true, lastName: true } },
          issuedBy: { select: { id: true, firstName: true, lastName: true } },
          returnInitiator: { select: { id: true, firstName: true, lastName: true } },
          hrAcknowledgedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.assetAssignment.count({ where }),
    ]);

    return buildPaginatedResult(rows, total, page, limit);
  }

  /** Issues an asset to an employee (creates AssetAssignment + sets asset IN_USE). */
  async issueAssetAssignment(
    assetId: string,
    dto: IssueCompanyAssetAssignmentDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id: assetId, companyId }),
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    if (asset.status !== AssetStatus.AVAILABLE) {
      throw new ConflictException(
        "Only available assets can be issued to an employee",
      );
    }

    const existingActive = await this.prisma.assetAssignment.findFirst({
      where: activeOnly({
        companyId,
        assetId,
        returnedAt: null,
      }),
      select: { id: true },
    });

    if (existingActive) {
      throw new ConflictException("Asset already has an active assignment");
    }

    const now = new Date();
    const notes = dto.notes?.trim() || null;

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.assetAssignment.create({
        data: {
          id: randomUUID(),
          companyId,
          assetId,
          userId: dto.employeeId,
          assignedAt: now,
          notes,
          returnedTo: null,
          returnedById: null,
          returnedAt: null,
          returnedNotes: null,
          issuedById: userId,
          approvalRequestId: null,
          employeeAcknowledged: false,
          acknowledgedAt: null,
          assetRequestId: dto.assetRequestId ?? null,
          createdBy: userId,
          updatedBy: userId,
        },
        include: {
          employee: {
            select: { id: true, firstName: true, lastName: true },
          },
          issuedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.companyAsset.update({
        where: { id: assetId },
        data: { status: AssetStatus.IN_USE, updatedBy: userId },
      });

      return assignment;
    });
  }

  /**
   * Step 1 — Initiates an asset return. Both the employee and HR can call this.
   * Records who initiated and captures reason + handover notes.
   * Does NOT yet set returnedAt or change asset status (that happens in acknowledgeReturn).
   */
  async returnAssetAssignment(
    assetId: string,
    assignmentId: string,
    dto: ReturnCompanyAssetAssignmentDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const assignment = await this.prisma.assetAssignment.findFirst({
      where: activeOnly({
        id: assignmentId,
        companyId,
        assetId,
        returnedAt: null,
      }),
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!assignment) {
      throw new NotFoundException("Active assignment not found");
    }

    if (assignment.returnInitiatedAt) {
      throw new ConflictException("Return already initiated for this assignment");
    }

    const now = new Date();

    return this.prisma.assetAssignment.update({
      where: { id: assignmentId },
      data: {
        returnInitiatedBy: userId,
        returnInitiatedAt: now,
        returnReason: dto.returnReason?.trim() || null,
        handoverNotes: dto.handoverNotes?.trim() || null,
        updatedBy: userId,
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        returnInitiator: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /**
   * Step 2 — HR acknowledges the return, completing the asset return.
   * Sets returnedAt, changes asset status to AVAILABLE.
   */
  async acknowledgeReturn(
    assetId: string,
    assignmentId: string,
    dto: AcknowledgeAssetReturnDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const assignment = await this.prisma.assetAssignment.findFirst({
      where: activeOnly({ id: assignmentId, companyId, assetId, returnedAt: null }),
    });

    if (!assignment) {
      throw new NotFoundException("Active assignment not found");
    }

    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.assetAssignment.update({
        where: { id: assignmentId },
        data: {
          returnedTo: dto.returnedTo?.trim() || null,
          returnedById: userId,
          returnedAt: now,
          returnedNotes: dto.returnedNotes?.trim() || null,
          hrAcknowledgedReturn: true,
          hrAcknowledgedAt: now,
          hrAcknowledgedById: userId,
          updatedBy: userId,
        },
        include: {
          employee: { select: { id: true, firstName: true, lastName: true } },
          returnedBy: { select: { id: true, firstName: true, lastName: true } },
          hrAcknowledgedBy: { select: { id: true, firstName: true, lastName: true } },
        },
      });

      await tx.companyAsset.update({
        where: { id: assetId },
        data: { status: AssetStatus.AVAILABLE, updatedBy: userId },
      });

      return updated;
    });
  }

  private toAssetResponse(
    asset: CompanyAsset & {
      assignedTo?: {
        id: string;
        firstName: string;
        lastName: string;
        email?: string | null;
      } | null;
      assignedAt?: Date | null;
    },
  ): Record<string, unknown> {
    const depreciation = computeAssetDepreciation({
      startUseDate: (asset as AssetDepreciationInput).startUseDate ?? null,
      usefulLifeMonths: (asset as AssetDepreciationInput).usefulLifeMonths ?? null,
      originalValue: (asset as AssetDepreciationInput).originalValue ?? null,
    });
    const { assignedTo, assignedAt, ...rest } = asset;

    return {
      ...rest,
      assignedTo: assignedTo ?? null,
      assignedAt: assignedAt ?? null,
      ...depreciation,
    };
  }

  private buildLedgerCreateData(dto: CreateCompanyAssetDto) {
    return {
      assetCode: dto.assetCode?.trim() || null,
      cardNumber: dto.cardNumber?.trim() || null,
      assetName: dto.assetName?.trim() || null,
      specifications: dto.specifications?.trim() || null,
      assetCategory: dto.assetCategory?.trim() || null,
      startUseDate: dto.startUseDate
        ? this.parseDateOnly(dto.startUseDate)
        : null,
      usefulLifeMonths: dto.usefulLifeMonths ?? null,
      originalValue:
        dto.originalValue != null
          ? new Prisma.Decimal(dto.originalValue)
          : null,
      managingDepartment: dto.managingDepartment?.trim() || null,
      storageLocation: dto.storageLocation?.trim() || null,
      requiresGmApproval: dto.requiresGmApproval ?? false,
    };
  }

  private buildLedgerUpdateData(dto: UpdateCompanyAssetDto) {
    return {
      ...(dto.assetCode !== undefined
        ? { assetCode: dto.assetCode?.trim() || null }
        : {}),
      ...(dto.cardNumber !== undefined
        ? { cardNumber: dto.cardNumber?.trim() || null }
        : {}),
      ...(dto.assetName !== undefined
        ? { assetName: dto.assetName?.trim() || null }
        : {}),
      ...(dto.specifications !== undefined
        ? { specifications: dto.specifications?.trim() || null }
        : {}),
      ...(dto.assetCategory !== undefined
        ? { assetCategory: dto.assetCategory?.trim() || null }
        : {}),
      ...(dto.startUseDate !== undefined
        ? {
            startUseDate: dto.startUseDate
              ? this.parseDateOnly(dto.startUseDate)
              : null,
          }
        : {}),
      ...(dto.usefulLifeMonths !== undefined
        ? { usefulLifeMonths: dto.usefulLifeMonths ?? null }
        : {}),
      ...(dto.originalValue !== undefined
        ? {
            originalValue:
              dto.originalValue != null
                ? new Prisma.Decimal(dto.originalValue)
                : null,
          }
        : {}),
      ...(dto.managingDepartment !== undefined
        ? { managingDepartment: dto.managingDepartment?.trim() || null }
        : {}),
      ...(dto.storageLocation !== undefined
        ? { storageLocation: dto.storageLocation?.trim() || null }
        : {}),
      ...(dto.requiresGmApproval !== undefined
        ? { requiresGmApproval: dto.requiresGmApproval }
        : {}),
    };
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }
}