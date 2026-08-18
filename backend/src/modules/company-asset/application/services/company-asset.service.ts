import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { AssetStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";

import { buildPaginatedResult, buildPrismaPagination, PaginatedResult } from "@/shared/utils/pagination.util";
import { PrismaService } from "@/shared/prisma/prisma.service";
import { activeOnly } from "@/shared/prisma/soft-delete.util";

import {
  CreateCompanyAssetDto,
  ListCompanyAssetsDto,
  UpdateCompanyAssetDto,
} from "../dtos/company-asset.dtos";
import { UpdateCompanyAssetStatusDto } from "../dtos/company-asset.dtos";

@Injectable()
export class CompanyAssetService {
  constructor(private readonly prisma: PrismaService) {}

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
      }),
      this.prisma.companyAsset.count({ where }),
    ]);

    return buildPaginatedResult(rows, total, page, limit);
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

    return this.prisma.companyAsset.create({
      data: {
        id: randomUUID(),
        companyId,
        serialNumber: serial,
        brand: dto.brand.trim(),
        model: dto.model.trim(),
        year: dto.year,
        color: dto.color.trim(),
        type: dto.type.trim(),
        status: AssetStatus.AVAILABLE,
        description: dto.description ?? null,
        photoDocumentId: dto.photoDocumentId ?? null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  /** Lists assets that are currently marked as available. */
  async getAvailableAssets(companyId: string): Promise<unknown[]> {
    return this.prisma.companyAsset.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: AssetStatus.AVAILABLE,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  /** Fetches a single asset by id (active record only). */
  async getAsset(id: string, companyId: string): Promise<unknown> {
    const asset = await this.prisma.companyAsset.findFirst({
      where: activeOnly({ id, companyId }),
    });

    if (!asset) {
      throw new NotFoundException("Asset not found");
    }

    return asset;
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

    return this.prisma.companyAsset.update({
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
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.photoDocumentId !== undefined
          ? { photoDocumentId: dto.photoDocumentId ?? null }
          : {}),
        updatedBy: userId,
      },
    });
  }

  /** Updates asset status. */
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
}