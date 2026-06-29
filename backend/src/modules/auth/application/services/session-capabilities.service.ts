import { Injectable } from '@nestjs/common';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PermissionFlags } from '../../../../shared/permissions/permission.types';
import { isSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
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
  { key: 'deliverables', module: 'deliverables' },
  { key: 'change_requests', module: 'change_requests' },
  { key: 'engineering_documents', module: 'engineering_documents' },
  { key: 'design_packages', module: 'design_packages' },
  { key: 'review_sessions', module: 'review_sessions' },
  { key: 'review_comments', module: 'review_comments' },
] as const;

const DISCIPLINE_SCOPE_BYPASS_ROLE_NAMES = new Set([
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
    const roleNames = await this.permissionService.getUserRoleNames(
      userId,
      companyId,
    );
    const systemAdministrator = isSystemAdministrator(roleNames);

    const [users, roles, notifications, audit, pm, schedule, engineeringDocuments] =
      await Promise.all([
        this.permissionService.getUserModulePermissions(userId, companyId, 'users'),
        this.permissionService.getUserModulePermissions(userId, companyId, 'roles'),
        this.permissionService.getUserModulePermissions(
          userId,
          companyId,
          'notifications',
        ),
        this.permissionService.getUserModulePermissions(userId, companyId, 'audit'),
        this.resolvePmCapabilities(userId, companyId),
        this.permissionService.getUserModulePermissions(
          userId,
          companyId,
          'schedule',
        ),
        this.permissionService.getUserModulePermissions(
          userId,
          companyId,
          'engineering_documents',
        ),
      ]);

    return {
      canManageUsers: users.canView,
      canCreateUsers: users.canCreate,
      canManageRoles: roles.canView,
      canEditRoles: roles.canEdit,
      canViewNotifications: notifications.canView,
      canViewAuditLogs: audit.canView,
      isSystemAdministrator: systemAdministrator,
      pm,
      epc: this.resolveEpcCapabilities(
        roleNames,
        schedule,
        engineeringDocuments,
      ),
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
    roleNames: string[],
    schedule: PermissionFlags,
    engineeringDocuments: PermissionFlags,
  ): EpcCapabilitiesDto {
    const disciplineScopeBypass = roleNames.some((name) =>
      DISCIPLINE_SCOPE_BYPASS_ROLE_NAMES.has(name),
    );

    const canViewEngineering =
      schedule.canView &&
      (schedule.canCreate ||
        schedule.canEdit ||
        schedule.canApprove ||
        schedule.canView);

    const canUploadEngineeringDocuments =
      schedule.canView && engineeringDocuments.canCreate;

    return {
      canViewReviewInbox: schedule.canView && schedule.canApprove,
      canViewMyComments:
        schedule.canView &&
        (schedule.canCreate || schedule.canEdit) &&
        !schedule.canApprove,
      canViewEngineering,
      canUploadEngineeringDocuments,
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
