import { Injectable } from '@nestjs/common';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import {
  PermissionFlags,
} from '../../../../shared/permissions/permission.types';
import {
  CapabilitiesDto,
  EpcCapabilitiesDto,
  ModuleCapabilitiesDto,
  PmCapabilitiesDto,
} from '../dtos/capabilities.dto';

const PM_MODULE_BINDINGS = [
  { key: 'projects', module: 'projects' },
  { key: 'schedule', module: 'schedule' },
  { key: 'rfis', module: 'rfis' },
  { key: 'submittals', module: 'submittals' },
  { key: 'drawings', module: 'drawings' },
  { key: 'dailyLogs', module: 'daily_logs' },
  { key: 'meetings', module: 'meetings' },
  { key: 'correspondence', module: 'correspondence' },
  { key: 'risks', module: 'risks' },
  { key: 'issues', module: 'issues' },
  { key: 'punchItems', module: 'punch_items' },
  { key: 'closeout', module: 'closeout' },
] as const;

@Injectable()
export class SessionCapabilitiesService {
  constructor(private readonly permissionService: PermissionService) {}

  /**
   * Resolves UI capability flags for the authenticated session from RBAC.
   */
  async resolve(userId: string, companyId: string): Promise<CapabilitiesDto> {
    const [users, roles, notifications, pm, schedule] = await Promise.all([
      this.permissionService.getUserModulePermissions(userId, companyId, 'users'),
      this.permissionService.getUserModulePermissions(userId, companyId, 'roles'),
      this.permissionService.getUserModulePermissions(
        userId,
        companyId,
        'notifications',
      ),
      this.resolvePmCapabilities(userId, companyId),
      this.permissionService.getUserModulePermissions(
        userId,
        companyId,
        'schedule',
      ),
    ]);

    return {
      canManageUsers: users.canView,
      canCreateUsers: users.canCreate,
      canManageRoles: roles.canView,
      canEditRoles: roles.canEdit,
      canViewNotifications: notifications.canView,
      pm,
      epc: this.resolveEpcCapabilities(schedule),
    };
  }

  private async resolvePmCapabilities(
    userId: string,
    companyId: string,
  ): Promise<PmCapabilitiesDto> {
    const flagsByKey = await Promise.all(
      PM_MODULE_BINDINGS.map(async ({ key, module }) => {
        const flags = await this.permissionService.getUserModulePermissions(
          userId,
          companyId,
          module,
        );
        return { key, flags };
      }),
    );

    const pm = {} as PmCapabilitiesDto;
    for (const { key, flags } of flagsByKey) {
      pm[key] = this.toModuleCapabilities(flags);
    }
    return pm;
  }

  private resolveEpcCapabilities(
    schedule: PermissionFlags,
  ): EpcCapabilitiesDto {
    const canViewEngineering =
      schedule.canView &&
      (schedule.canCreate ||
        schedule.canEdit ||
        schedule.canApprove ||
        schedule.canView);

    return {
      canViewReviewInbox:
        schedule.canView && (schedule.canApprove || schedule.canEdit),
      canViewMyComments: schedule.canView,
      canViewEngineering,
    };
  }

  private toModuleCapabilities(flags: PermissionFlags): ModuleCapabilitiesDto {
    return {
      canView: flags.canView,
      canCreate: flags.canCreate,
      canEdit: flags.canEdit || flags.canApprove,
      canDelete: flags.canDelete,
    };
  }
}
