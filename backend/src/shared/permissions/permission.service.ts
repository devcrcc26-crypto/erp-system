import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { activeOnly } from '../prisma/soft-delete.util';
import {
  ACTION_TO_FLAG,
  EMPTY_PERMISSION_FLAGS,
  PermissionAction,
  PermissionFlags,
} from './permission.types';

@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Checks whether a user has the required permission via role inheritance.
   */
  async hasPermission(
    userId: string,
    companyId: string,
    module: string,
    action: PermissionAction,
  ): Promise<boolean> {
    const flags = await this.getUserModulePermissions(userId, companyId, module);
    const flagKey = ACTION_TO_FLAG[action];
    return flags[flagKey];
  }

  /**
   * Resolves merged permission flags for a user on a module.
   */
  async getUserModulePermissions(
    userId: string,
    companyId: string,
    module: string,
  ): Promise<PermissionFlags> {
    const userRoles = await this.prisma.userRole.findMany({
      where: activeOnly({ userId }),
      include: { role: true },
    });

    if (userRoles.length === 0) {
      return { ...EMPTY_PERMISSION_FLAGS };
    }

    const merged = { ...EMPTY_PERMISSION_FLAGS };

    for (const userRole of userRoles) {
      if (userRole.role.companyId !== companyId || !userRole.role.isActive) {
        continue;
      }

      const roleIds = await this.collectRoleChainIds(
        userRole.roleId,
        companyId,
      );

      const rolePermissions = await this.prisma.rolePermission.findMany({
        where: {
          deletedAt: null,
          roleId: { in: roleIds },
          permission: { module },
        },
        include: { permission: true },
      });

      for (const rp of rolePermissions) {
        merged.canView = merged.canView || rp.canView;
        merged.canCreate = merged.canCreate || rp.canCreate;
        merged.canEdit = merged.canEdit || rp.canEdit;
        merged.canDelete = merged.canDelete || rp.canDelete;
        merged.canApprove = merged.canApprove || rp.canApprove;
        merged.canExport = merged.canExport || rp.canExport;
      }
    }

    return merged;
  }

  /**
   * Returns active role names assigned to a user within a company.
   */
  async getUserRoleNames(userId: string, companyId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: activeOnly({ userId }),
      include: { role: true },
    });
    return userRoles
      .filter(
        (ur) => ur.role.companyId === companyId && ur.role.isActive,
      )
      .map((ur) => ur.role.name);
  }

  /**
   * Walks the role inheritance chain from child to ancestors.
   */
  private async collectRoleChainIds(
    roleId: string,
    companyId: string,
  ): Promise<string[]> {
    const ids: string[] = [];
    let currentId: string | null = roleId;

    while (currentId) {
      ids.push(currentId);
      const role: { parentRoleId: string | null } | null =
        await this.prisma.role.findFirst({
          where: activeOnly({ id: currentId, companyId }),
          select: { parentRoleId: true },
        });
      currentId = role?.parentRoleId ?? null;
    }

    return ids;
  }
}
