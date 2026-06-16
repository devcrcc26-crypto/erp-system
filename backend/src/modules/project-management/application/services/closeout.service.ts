import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  UpdateCloseoutChecklistItemDto,
  UpdateCloseoutDto,
} from '../dtos/pm.dtos';
import { PmContext } from '../types/pm-context.type';
import {
  mapCloseout,
  mapCloseoutChecklistItem,
  mapCloseoutDetail,
  MappedCloseout,
  MappedCloseoutChecklistItem,
  MappedCloseoutDetail,
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
  checklistItems: { orderBy: { createdAt: 'asc' as const } },
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
      where: { projectId },
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
      where: { projectId },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Closeout already exists for this project');
    }

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
  }

  /**
   * Updates closeout summary fields for a project.
   */
  async updateCloseout(
    ctx: PmContext,
    projectId: string,
    dto: UpdateCloseoutDto,
  ): Promise<MappedCloseoutDetail> {
    const closeout = await this.getCloseoutRecordOrThrow(projectId);

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
    const closeout = await this.getCloseoutRecordOrThrow(projectId);

    const item = await this.prisma.closeoutChecklistItem.findFirst({
      where: { id: itemId, closeoutId: closeout.id },
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

  private async getCloseoutRecordOrThrow(projectId: string) {
    const row = await this.prisma.closeout.findFirst({
      where: { projectId },
    });
    if (!row) {
      throw new NotFoundException('Closeout not found');
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
