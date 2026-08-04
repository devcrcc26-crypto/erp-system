import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  CreatePerDiemRateDto,
  UpdatePerDiemRateDto,
} from '../dtos/per-diem-rate.dtos';

/**
 * HR-managed per diem destination rate configuration.
 */
@Injectable()
export class PerDiemRateService {
  constructor(private readonly prisma: PrismaService) {}

  async listRates(companyId: string): Promise<unknown> {
    return this.prisma.perDiemRate.findMany({
      where: activeOnly({ companyId }),
      orderBy: { destinationCategory: 'asc' },
    });
  }

  /**
   * Active rates only — used by submission forms (all authenticated users).
   */
  async getActiveRates(companyId: string): Promise<unknown> {
    return this.prisma.perDiemRate.findMany({
      where: activeOnly({ companyId, isActive: true }),
      orderBy: { destinationCategory: 'asc' },
    });
  }

  async createRate(
    dto: CreatePerDiemRateDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const existing = await this.prisma.perDiemRate.findFirst({
      where: activeOnly({
        companyId,
        destinationCategory: dto.destinationCategory.trim(),
      }),
    });
    if (existing) {
      throw new ConflictException(
        `A rate for "${dto.destinationCategory}" already exists`,
      );
    }

    return this.prisma.perDiemRate.create({
      data: {
        id: randomUUID(),
        companyId,
        destinationCategory: dto.destinationCategory.trim(),
        dailyRate: new Prisma.Decimal(dto.dailyRate),
        currency: dto.currency,
        description: dto.description?.trim() || null,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async updateRate(
    id: string,
    dto: UpdatePerDiemRateDto,
    companyId: string,
    userId: string,
  ): Promise<unknown> {
    const rate = await this.prisma.perDiemRate.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!rate) {
      throw new NotFoundException('Per diem rate not found');
    }

    if (
      dto.destinationCategory &&
      dto.destinationCategory.trim() !== rate.destinationCategory
    ) {
      const clash = await this.prisma.perDiemRate.findFirst({
        where: activeOnly({
          companyId,
          destinationCategory: dto.destinationCategory.trim(),
          id: { not: id },
        }),
      });
      if (clash) {
        throw new ConflictException(
          `A rate for "${dto.destinationCategory}" already exists`,
        );
      }
    }

    return this.prisma.perDiemRate.update({
      where: { id },
      data: {
        destinationCategory:
          dto.destinationCategory?.trim() ?? rate.destinationCategory,
        dailyRate:
          dto.dailyRate !== undefined
            ? new Prisma.Decimal(dto.dailyRate)
            : rate.dailyRate,
        currency: dto.currency ?? rate.currency,
        description:
          dto.description !== undefined
            ? dto.description.trim() || null
            : rate.description,
        isActive: dto.isActive ?? rate.isActive,
        updatedBy: userId,
      },
    });
  }

  async deleteRate(id: string, companyId: string, userId: string): Promise<void> {
    const rate = await this.prisma.perDiemRate.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!rate) {
      throw new NotFoundException('Per diem rate not found');
    }

    const inUse = await this.prisma.perDiemRequest.findFirst({
      where: {
        perDiemRateId: id,
        status: { in: ['DRAFT', 'SUBMITTED', 'IN_REVIEW'] },
      },
      select: { id: true },
    });
    if (inUse) {
      throw new BadRequestException(
        'This rate is used by an in-progress per diem request and cannot be deleted',
      );
    }

    await this.prisma.perDiemRate.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId, updatedBy: userId },
    });
  }
}
