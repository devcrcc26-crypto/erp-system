import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  CreateWarrantyDto,
  UpdateCloseoutChecklistItemDto,
  UpdateCloseoutDto,
  UpdateWarrantyDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapCloseout,
  mapCloseoutChecklistItem,
  mapCloseoutDetail,
  mapWarranty,
  MappedCloseout,
  MappedCloseoutChecklistItem,
  MappedCloseoutDetail,
  MappedWarranty,
  parseOptionalDate,
  parseOptionalDecimal,
} from '../utils/pm-mapper.util';
import { ProjectScopeService } from './project-scope.service';

const DEFAULT_CLOSEOUT_CHECKLIST: Array<{
  category: string;
  description: string;
}> = [
  {
    category: 'Documentation',
    description: 'As-built drawings submitted and approved',
  },
  {
    category: 'Documentation',
    description: 'O&M manuals and warranties collected',
  },
  {
    category: 'Documentation',
    description: 'Training and handover records completed',
  },
  {
    category: 'Financial',
    description: 'Final account agreed with client',
  },
  {
    category: 'Financial',
    description: 'Retention release processed',
  },
  {
    category: 'Site',
    description: 'Punch list items closed and verified',
  },
  {
    category: 'Site',
    description: 'Site demobilization completed',
  },
  {
    category: 'Handover',
    description: 'Keys, certificates, and access handed over',
  },
];

const CLOSEOUT_DETAIL_INCLUDE = {
  checklistItems: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
  },
  warranties: {
    where: { deletedAt: null },
    orderBy: { createdAt: 'asc' as const },
  },
};

@Injectable()
export class CloseoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectScopeService: ProjectScopeService,
  ) {}

  /**
   * Returns closeout detail for a project or throws 404 when not initialized.
   */
  async getCloseout(
    ctx: PmContext,
    projectId: string,
  ): Promise<MappedCloseoutDetail> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const row = await this.prisma.closeout.findFirst({
      where: {
        projectId,
        deletedAt: null,
        project: activeOnly({ companyId: ctx.companyId }),
      },
      include: CLOSEOUT_DETAIL_INCLUDE,
    });
    if (!row) {
      throw new NotFoundException('Closeout not found');
    }

    return mapCloseoutDetail(row);
  }

  /**
   * Initializes closeout with default checklist items for a project.
   */
  async createCloseout(
    ctx: PmContext,
    projectId: string,
  ): Promise<MappedCloseout> {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const existing = await this.prisma.closeout.findFirst({
      where: {
        projectId,
        deletedAt: null,
        project: activeOnly({ companyId: ctx.companyId }),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Closeout already exists for this project');
    }

    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const closeout = await tx.closeout.create({
          data: {
            projectId,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          },
        });

        await tx.closeoutChecklistItem.createMany({
          data: DEFAULT_CLOSEOUT_CHECKLIST.map((item) => ({
            closeoutId: closeout.id,
            category: item.category,
            description: item.description,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          })),
        });

        return closeout;
      });

      return mapCloseout(row);
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Closeout already exists for this project');
      }
      throw error;
    }
  }

  /**
   * Updates closeout summary fields for a project.
   */
  async updateCloseout(
    ctx: PmContext,
    projectId: string,
    dto: UpdateCloseoutDto,
  ): Promise<MappedCloseoutDetail> {
    const closeout = await this.getCloseoutRecordOrThrow(ctx, projectId);

    const row = await this.prisma.closeout.update({
      where: { id: closeout.id },
      data: {
        practicalCompletionDate: parseOptionalDate(dto.practicalCompletionDate),
        defectsLiabilityEndDate: parseOptionalDate(dto.defectsLiabilityEndDate),
        finalCompletionDate: parseOptionalDate(dto.finalCompletionDate),
        status: dto.status,
        contractValue: parseOptionalDecimal(dto.contractValue),
        variationsTotal: parseOptionalDecimal(dto.variationsTotal),
        claimsTotal: parseOptionalDecimal(dto.claimsTotal),
        finalSettlement: parseOptionalDecimal(dto.finalSettlement),
        updatedBy: ctx.userId,
      },
      include: CLOSEOUT_DETAIL_INCLUDE,
    });

    return mapCloseoutDetail(row);
  }

  /**
   * Toggles a closeout checklist item completion state.
   */
  async updateChecklistItem(
    ctx: PmContext,
    projectId: string,
    itemId: string,
    dto: UpdateCloseoutChecklistItemDto,
  ): Promise<MappedCloseoutChecklistItem> {
    const closeout = await this.getCloseoutRecordOrThrow(ctx, projectId);

    const item = await this.prisma.closeoutChecklistItem.findFirst({
      where: activeOnly({ id: itemId, closeoutId: closeout.id }),
    });
    if (!item) {
      throw new NotFoundException('Checklist item not found');
    }

    if (dto.verifiedBy) {
      await this.assertUserInCompany(ctx, dto.verifiedBy);
    }

    const verifiedBy = dto.isComplete
      ? (dto.verifiedBy ?? ctx.userId)
      : null;

    const row = await this.prisma.closeoutChecklistItem.update({
      where: { id: itemId },
      data: {
        isComplete: dto.isComplete,
        verifiedBy,
        completedAt: dto.isComplete ? new Date() : null,
        updatedBy: ctx.userId,
      },
    });

    return mapCloseoutChecklistItem(row);
  }

  /**
   * Adds a warranty record to project closeout.
   */
  async addWarranty(
    ctx: PmContext,
    projectId: string,
    dto: CreateWarrantyDto,
  ): Promise<MappedWarranty> {
    const closeout = await this.getCloseoutRecordOrThrow(ctx, projectId);

    const row = await this.prisma.warranty.create({
      data: {
        closeoutId: closeout.id,
        itemDescription: dto.itemDescription,
        supplier: dto.supplier,
        startDate: parseOptionalDate(dto.startDate),
        expiryDate: parseOptionalDate(dto.expiryDate),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });

    return mapWarranty(row);
  }

  /**
   * Updates a warranty record on project closeout.
   */
  async updateWarranty(
    ctx: PmContext,
    projectId: string,
    warrantyId: string,
    dto: UpdateWarrantyDto,
  ): Promise<MappedWarranty> {
    const closeout = await this.getCloseoutRecordOrThrow(ctx, projectId);
    await this.getWarrantyOrThrow(closeout.id, warrantyId);

    const row = await this.prisma.warranty.update({
      where: { id: warrantyId },
      data: {
        itemDescription: dto.itemDescription,
        supplier: dto.supplier,
        startDate: parseOptionalDate(dto.startDate),
        expiryDate: parseOptionalDate(dto.expiryDate),
        updatedBy: ctx.userId,
      },
    });

    return mapWarranty(row);
  }

  /**
   * Soft-deletes a warranty record from project closeout.
   */
  async removeWarranty(
    ctx: PmContext,
    projectId: string,
    warrantyId: string,
  ): Promise<void> {
    const closeout = await this.getCloseoutRecordOrThrow(ctx, projectId);
    await this.getWarrantyOrThrow(closeout.id, warrantyId);

    await this.prisma.warranty.update({
      where: { id: warrantyId },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private async getCloseoutRecordOrThrow(ctx: PmContext, projectId: string) {
    await this.projectScopeService.getProjectOrThrow(ctx, projectId);

    const row = await this.prisma.closeout.findFirst({
      where: {
        projectId,
        deletedAt: null,
        project: activeOnly({ companyId: ctx.companyId }),
      },
    });
    if (!row) {
      throw new NotFoundException('Closeout not found');
    }
    return row;
  }

  private async getWarrantyOrThrow(closeoutId: string, warrantyId: string) {
    const row = await this.prisma.warranty.findFirst({
      where: activeOnly({ id: warrantyId, closeoutId }),
    });
    if (!row) {
      throw new NotFoundException('Warranty not found');
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
}
