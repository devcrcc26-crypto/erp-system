import { Injectable } from '@nestjs/common';
import { ReviewSessionStatus } from '@prisma/client';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PermissionFlags } from '../../../../shared/permissions/permission.types';
import {
  PROJECT_ADMINISTRATOR_ROLE,
} from '../../../../shared/permissions/project-admin.util';
import { isSystemAdministrator } from '../../../../shared/permissions/system-admin.util';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
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
  PROJECT_ADMINISTRATOR_ROLE,
]);

/** Full design-cycle sidebar — Project Manager ≡ Project Admin per product. */
const NAV_FULL_ACCESS_ROLE_NAMES = new Set([
  'System Administrator',
  'Managing Director',
  'Project Manager',
  PROJECT_ADMINISTRATOR_ROLE,
]);

const DOCUMENT_CONTROLLER_ROLE = 'Document Controller';

interface NavAssignmentProbes {
  readonly navDepartmentLeader: boolean;
  readonly navDisciplineLeader: boolean;
  readonly navReviewerTier: boolean;
  readonly navDesigner: boolean;
  readonly navSupportingDesigner: boolean;
}

@Injectable()
export class SessionCapabilitiesService {
  constructor(
    private readonly permissionService: PermissionService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Resolves UI capability flags for the authenticated session from RBAC.
   */
  async resolve(userId: string, companyId: string): Promise<CapabilitiesDto> {
    const roleNames = await this.permissionService.getUserRoleNames(
      userId,
      companyId,
    );
    const systemAdministrator = isSystemAdministrator(roleNames);

    const [
      users,
      roles,
      notifications,
      audit,
      pm,
      schedule,
      engineeringDocuments,
      reviewSessions,
      hasAssignedReviewInbox,
      navProbes,
    ] = await Promise.all([
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
      this.permissionService.getUserModulePermissions(
        userId,
        companyId,
        'review_sessions',
      ),
      this.hasActiveReviewInboxAssignment(userId, companyId),
      this.resolveNavAssignmentProbes(userId, companyId),
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
        reviewSessions,
        hasAssignedReviewInbox,
        navProbes,
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

  /**
   * Indexed EXISTS probes — one round-trip of parallel counts (select 1).
   * Never invent assignments: false unless a live FK/membership row exists.
   */
  private async resolveNavAssignmentProbes(
    userId: string,
    companyId: string,
  ): Promise<NavAssignmentProbes> {
    const idOnly = { id: true } as const;
    const [
      departmentLeader,
      disciplineLeadTd,
      disciplineLeadPkg,
      reviewerTd,
      reviewerPkg,
      designerTd,
      designerPkg,
      supportingTd,
      supportingPkg,
    ] = await Promise.all([
      this.prisma.department.findFirst({
        where: activeOnly({ companyId, leaderUserId: userId }),
        select: idOnly,
      }),
      this.prisma.taskDiscipline.findFirst({
        where: activeOnly({ companyId, disciplineLeadUserId: userId }),
        select: idOnly,
      }),
      this.prisma.designPackage.findFirst({
        where: activeOnly({ companyId, disciplinaryLeaderUserId: userId }),
        select: idOnly,
      }),
      this.prisma.taskDiscipline.findFirst({
        where: activeOnly({
          companyId,
          OR: [
            { reviewerUserId: userId },
            { chiefUserId: userId },
            { instituteChiefUserId: userId },
          ],
        }),
        select: idOnly,
      }),
      this.prisma.designPackage.findFirst({
        where: activeOnly({
          companyId,
          OR: [
            { reviewerUserId: userId },
            { deptDeputyChiefUserId: userId },
            { instituteChiefUserId: userId },
          ],
        }),
        select: idOnly,
      }),
      this.prisma.taskDiscipline.findFirst({
        where: activeOnly({ companyId, designerUserId: userId }),
        select: idOnly,
      }),
      this.prisma.designPackage.findFirst({
        where: activeOnly({ companyId, designerUserId: userId }),
        select: idOnly,
      }),
      this.prisma.taskDiscipline.findFirst({
        where: activeOnly({ companyId, supportingDesignerUserId: userId }),
        select: idOnly,
      }),
      this.prisma.designPackage.findFirst({
        where: activeOnly({ companyId, supportingDesignerUserId: userId }),
        select: idOnly,
      }),
    ]);

    return {
      navDepartmentLeader: departmentLeader !== null,
      navDisciplineLeader:
        disciplineLeadTd !== null || disciplineLeadPkg !== null,
      navReviewerTier: reviewerTd !== null || reviewerPkg !== null,
      navDesigner: designerTd !== null || designerPkg !== null,
      navSupportingDesigner:
        supportingTd !== null || supportingPkg !== null,
    };
  }

  private resolveEpcCapabilities(
    roleNames: string[],
    schedule: PermissionFlags,
    engineeringDocuments: PermissionFlags,
    reviewSessions: PermissionFlags,
    hasAssignedReviewInbox: boolean,
    navProbes: NavAssignmentProbes,
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

    const scheduleReviewAccess =
      schedule.canApprove || schedule.canView || schedule.canEdit;

    const navFullAccess = roleNames.some((name) =>
      NAV_FULL_ACCESS_ROLE_NAMES.has(name),
    );
    const isDocumentController = roleNames.includes(DOCUMENT_CONTROLLER_ROLE);

    const navReviewerTier =
      navProbes.navReviewerTier || hasAssignedReviewInbox;
    const navSupportingDesigner =
      navProbes.navSupportingDesigner || isDocumentController;
    const navDepartmentLeader = navProbes.navDepartmentLeader;
    const navDisciplineLeader = navProbes.navDisciplineLeader;
    const navDesigner = navProbes.navDesigner;

    const designCycleAssignee =
      navDepartmentLeader ||
      navDisciplineLeader ||
      navReviewerTier ||
      navDesigner ||
      navSupportingDesigner;

    return {
      canViewReviewInbox:
        (scheduleReviewAccess &&
          (schedule.canApprove ||
            reviewSessions.canApprove ||
            hasAssignedReviewInbox)) ||
        navFullAccess ||
        navDepartmentLeader ||
        navDisciplineLeader ||
        navReviewerTier,
      canViewMyComments:
        (schedule.canView &&
          (schedule.canCreate || schedule.canEdit) &&
          !schedule.canApprove) ||
        navFullAccess ||
        navDepartmentLeader ||
        navDisciplineLeader ||
        navReviewerTier ||
        navDesigner,
      canViewMyWork:
        schedule.canView ||
        navFullAccess ||
        designCycleAssignee,
      canViewEngineering,
      canUploadEngineeringDocuments,
      disciplineScopeBypass,
      navFullAccess,
      navDepartmentLeader,
      navDisciplineLeader,
      navReviewerTier,
      navDesigner,
      navSupportingDesigner,
    };
  }

  private async hasActiveReviewInboxAssignment(
    userId: string,
    companyId: string,
  ): Promise<boolean> {
    const row = await this.prisma.reviewSession.findFirst({
      where: activeOnly({
        companyId,
        assignedToUserId: userId,
        status: ReviewSessionStatus.ACTIVE,
      }),
      select: { id: true },
    });
    return row !== null;
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
