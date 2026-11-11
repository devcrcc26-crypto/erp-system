import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { activeOnly } from '../prisma/soft-delete.util';
import {
  ACTION_TO_FLAG,
  EMPTY_PERMISSION_FLAGS,
  PermissionAction,
  PermissionFlags,
} from './permission.types';
import {
  FULL_PERMISSION_FLAGS,
  isSystemAdministrator,
  isTrueSystemAdministrator,
  PROJECT_ADMIN_EXCLUDED_MODULES,
} from './system-admin.util';

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
    const map = await this.getUserModulePermissionsMap(userId, companyId, [
      module,
    ]);
    return map[module] ?? { ...EMPTY_PERMISSION_FLAGS };
  }

  /**
   * Batch-resolves permission flags for many modules in a few queries.
   * Avoids N parallel getUserModulePermissions calls exhausting DB pools.
   */
  async getUserModulePermissionsMap(
    userId: string,
    companyId: string,
    modules: readonly string[],
  ): Promise<Record<string, PermissionFlags>> {
    const uniqueModules = [...new Set(modules)];
    const emptyMap = (): Record<string, PermissionFlags> => {
      const result: Record<string, PermissionFlags> = {};
      for (const module of uniqueModules) {
        result[module] = { ...EMPTY_PERMISSION_FLAGS };
      }
      return result;
    };

    if (uniqueModules.length === 0) {
      return {};
    }

    const userRoles = await this.prisma.userRole.findMany({
      where: activeOnly({ userId }),
      include: { role: true },
    });

    const companyRoles = userRoles.filter(
      (ur) => ur.role.companyId === companyId && ur.role.isActive,
    );

    if (companyRoles.length === 0) {
      return emptyMap();
    }

    const roleNames = companyRoles.map((ur) => ur.role.name);
    if (isSystemAdministrator(roleNames)) {
      const trueSysAdmin = isTrueSystemAdministrator(roleNames);
      const result: Record<string, PermissionFlags> = {};
      for (const module of uniqueModules) {
        // Project Administrator: full PM/system access except HR modules.
        // System Administrator: unrestricted including HR.
        if (
          !trueSysAdmin &&
          PROJECT_ADMIN_EXCLUDED_MODULES.has(module)
        ) {
          result[module] = { ...EMPTY_PERMISSION_FLAGS };
        } else {
          result[module] = { ...FULL_PERMISSION_FLAGS };
        }
      }
      return result;
    }

    const roleIdSet = new Set<string>();
    for (const userRole of companyRoles) {
      const chainIds = await this.collectRoleChainIds(
        userRole.roleId,
        companyId,
      );
      for (const id of chainIds) {
        roleIdSet.add(id);
      }
    }

    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: {
        deletedAt: null,
        roleId: { in: [...roleIdSet] },
        permission: { module: { in: uniqueModules } },
      },
      include: { permission: true },
    });

    const result = emptyMap();
    for (const rp of rolePermissions) {
      const module = rp.permission.module;
      const merged = result[module];
      if (!merged) {
        continue;
      }
      merged.canView = merged.canView || rp.canView;
      merged.canCreate = merged.canCreate || rp.canCreate;
      merged.canEdit = merged.canEdit || rp.canEdit;
      merged.canDelete = merged.canDelete || rp.canDelete;
      merged.canApprove = merged.canApprove || rp.canApprove;
      merged.canExport = merged.canExport || rp.canExport;
    }

    return result;
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
