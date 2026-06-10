import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  CreateDashboardWidgetDto,
  UpdateDashboardWidgetDto,
} from '../dtos/reporting.dtos';

type RequestContext = { companyId: string; userId: string };

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns dashboard widgets visible to the current user's roles.
   */
  async listForUser(ctx: RequestContext): Promise<unknown[]> {
    const roleIds = await this.getUserRoleIds(ctx.userId, ctx.companyId);
    if (roleIds.length === 0) {
      return [];
    }

    return this.prisma.dashboardWidget.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        roleId: { in: roleIds },
      }),
      orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
    });
  }

  async listAll(ctx: RequestContext): Promise<unknown[]> {
    return this.prisma.dashboardWidget.findMany({
      where: activeOnly({ companyId: ctx.companyId }),
      orderBy: [{ positionY: 'asc' }, { positionX: 'asc' }],
      include: { role: { select: { id: true, name: true } } },
    });
  }

  async create(
    ctx: RequestContext,
    dto: CreateDashboardWidgetDto,
  ): Promise<unknown> {
    await this.assertRole(dto.roleId, ctx.companyId);

    return this.prisma.dashboardWidget.create({
      data: {
        companyId: ctx.companyId,
        roleId: dto.roleId,
        widgetType: dto.widgetType,
        title: dto.title,
        config: (dto.config ?? {}) as Prisma.InputJsonValue,
        positionX: dto.positionX ?? 0,
        positionY: dto.positionY ?? 0,
        width: dto.width ?? 4,
        height: dto.height ?? 2,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async update(
    ctx: RequestContext,
    id: string,
    dto: UpdateDashboardWidgetDto,
  ): Promise<unknown> {
    await this.findOrThrow(id, ctx.companyId);
    if (dto.roleId) {
      await this.assertRole(dto.roleId, ctx.companyId);
    }

    const { config, ...rest } = dto;
    return this.prisma.dashboardWidget.update({
      where: { id },
      data: {
        ...rest,
        ...(config !== undefined
          ? { config: config as Prisma.InputJsonValue }
          : {}),
        updatedBy: ctx.userId,
      },
    });
  }

  async delete(ctx: RequestContext, id: string): Promise<void> {
    await this.findOrThrow(id, ctx.companyId);
    await this.prisma.dashboardWidget.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  private async getUserRoleIds(
    userId: string,
    companyId: string,
  ): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: activeOnly({ userId }),
      include: { role: true },
    });

    return userRoles
      .filter((ur) => ur.role.companyId === companyId && ur.role.isActive)
      .map((ur) => ur.roleId);
  }

  private async assertRole(roleId: string, companyId: string): Promise<void> {
    const role = await this.prisma.role.findFirst({
      where: activeOnly({ id: roleId, companyId }),
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
  }

  private async findOrThrow(id: string, companyId: string): Promise<void> {
    const widget = await this.prisma.dashboardWidget.findFirst({
      where: activeOnly({ id, companyId }),
    });
    if (!widget) {
      throw new NotFoundException('Dashboard widget not found');
    }
  }
}
