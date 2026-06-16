import { Injectable } from '@nestjs/common';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { CapabilitiesDto } from '../dtos/capabilities.dto';

@Injectable()
export class SessionCapabilitiesService {
  constructor(private readonly permissionService: PermissionService) {}

  /**
   * Resolves UI capability flags for the authenticated session from RBAC.
   */
  async resolve(userId: string, companyId: string): Promise<CapabilitiesDto> {
    const [users, roles, notifications] = await Promise.all([
      this.permissionService.getUserModulePermissions(userId, companyId, 'users'),
      this.permissionService.getUserModulePermissions(userId, companyId, 'roles'),
      this.permissionService.getUserModulePermissions(
        userId,
        companyId,
        'notifications',
      ),
    ]);

    return {
      canManageUsers: users.canView,
      canCreateUsers: users.canCreate,
      canManageRoles: roles.canView,
      canEditRoles: roles.canEdit,
      canViewNotifications: notifications.canView,
    };
  }
}
