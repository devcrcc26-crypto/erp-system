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

const BYPASS_ROLE_NAMES = new Set([
  'System Administrator',
  'Managing Director',
  'Project Manager',
]);

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
      epc: await this.resolveEpcCapabilities(userId, companyId, schedule),
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

  private async resolveEpcCapabilities(
    userId: string,
    companyId: string,
    schedule: PermissionFlags,
  ): Promise<EpcCapabilitiesDto> {
    const roleNames = await this.permissionService.getUserRoleNames(
      userId,
      companyId,
    );
    const disciplineScopeBypass = roleNames.some((name) =>
      BYPASS_ROLE_NAMES.has(name),
    );

    const canViewEngineering =
      schedule.canView &&
      (schedule.canCreate ||
        schedule.canEdit ||
        schedule.canApprove ||
        schedule.canView);

    return {
      // Review inbox and approve/return actions require explicit approve permission.
      canViewReviewInbox: schedule.canView && schedule.canApprove,
      // Designer queue — edit/create on schedule without approve (pure designers).
      canViewMyComments:
        schedule.canView &&
        (schedule.canCreate || schedule.canEdit) &&
        !schedule.canApprove,
      canViewEngineering,
      disciplineScopeBypass,
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
