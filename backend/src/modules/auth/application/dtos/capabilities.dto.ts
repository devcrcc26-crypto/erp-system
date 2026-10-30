import { ApiProperty } from '@nestjs/swagger';

export class ModuleCapabilitiesDto {
  @ApiProperty()
  canView!: boolean;

  @ApiProperty()
  canCreate!: boolean;

  @ApiProperty()
  canEdit!: boolean;

  @ApiProperty()
  canDelete!: boolean;
}

export class PmCapabilitiesDto {
  @ApiProperty({ type: ModuleCapabilitiesDto })
  projects!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  schedule!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  rfis!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  submittals!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  drawings!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  dailyLogs!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  meetings!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  correspondence!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  risks!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  issues!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  punchItems!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  closeout!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  deliverables!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  change_requests!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  engineering_documents!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  design_packages!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  review_sessions!: ModuleCapabilitiesDto;

  @ApiProperty({ type: ModuleCapabilitiesDto })
  review_comments!: ModuleCapabilitiesDto;
}

export class EpcCapabilitiesDto {
  @ApiProperty()
  canViewReviewInbox!: boolean;

  @ApiProperty()
  canViewMyComments!: boolean;

  @ApiProperty()
  canViewMyWork!: boolean;

  @ApiProperty()
  canViewEngineering!: boolean;

  @ApiProperty({
    description:
      'Upload and register engineering document files on assigned disciplines (Document Controller logistics).',
  })
  canUploadEngineeringDocuments!: boolean;

  @ApiProperty({
    description:
      'When true, user sees all project disciplines (PM / admin bypass).',
  })
  disciplineScopeBypass!: boolean;

  @ApiProperty({
    description:
      'SysAdmin / Managing Director / Project Manager / Project Administrator - full design-cycle nav.',
  })
  navFullAccess!: boolean;

  @ApiProperty({
    description: 'User is leader of at least one company department.',
  })
  navDepartmentLeader!: boolean;

  @ApiProperty({
    description:
      'User is discipline leader on at least one active task discipline or package.',
  })
  navDisciplineLeader!: boolean;

  @ApiProperty({
    description:
      'User holds reviewer / dept chief / institute chief assignment or active review inbox.',
  })
  navReviewerTier!: boolean;

  @ApiProperty({
    description: 'User is designer on at least one active discipline or package.',
  })
  navDesigner!: boolean;

  @ApiProperty({
    description:
      'Supporting designer assignment and/or Document Controller company role.',
  })
  navSupportingDesigner!: boolean;
}

export class CapabilitiesDto {
  @ApiProperty({ description: 'Can list and view users' })
  canManageUsers!: boolean;

  @ApiProperty({ description: 'Can create new users' })
  canCreateUsers!: boolean;

  @ApiProperty({
    description:
      'users.edit - edit employees, login name, approver-only flag, reset password',
  })
  canEditUsers!: boolean;

  @ApiProperty({ description: 'Can list and view roles' })
  canManageRoles!: boolean;

  @ApiProperty({ description: 'Can edit role permissions' })
  canEditRoles!: boolean;

  @ApiProperty({ description: 'Can view in-app notifications' })
  canViewNotifications!: boolean;

  @ApiProperty({ description: 'Can view company audit logs' })
  canViewAuditLogs!: boolean;

  @ApiProperty({ description: 'Can access the Human Resources module (hr.view)' })
  canViewHr!: boolean;

  @ApiProperty({ description: 'Can edit Human Resources records (hr.edit)' })
  canEditHr!: boolean;

  @ApiProperty({ description: 'Can view leave requests (leave.view)' })
  canViewLeave!: boolean;

  @ApiProperty({ description: 'Can submit leave requests (leave.create)' })
  canCreateLeave!: boolean;

  @ApiProperty({ description: 'Can view overtime requests (overtime.view)' })
  canViewOvertime!: boolean;

  @ApiProperty({ description: 'Can submit overtime requests (overtime.create)' })
  canCreateOvertime!: boolean;

  @ApiProperty({
    description:
      'Can open payroll runs (payroll.create OR payroll.edit OR payroll.approve)',
  })
  canAccessPayroll!: boolean;

  @ApiProperty({ description: 'Can create and process payroll runs (payroll.create)' })
  canCreatePayroll!: boolean;

  @ApiProperty({ description: 'Can edit payroll entries (payroll.edit)' })
  canEditPayroll!: boolean;

  @ApiProperty({ description: 'Can approve payroll runs (payroll.approve)' })
  canApprovePayroll!: boolean;

  @ApiProperty({ description: 'Can export payroll Excel / bank files (payroll.export)' })
  canExportPayroll!: boolean;

  @ApiProperty({
    description:
      'Can open announcement management (announcements.create OR edit OR approve)',
  })
  canManageAnnouncements!: boolean;

  @ApiProperty({ description: 'Can publish, schedule and archive announcements (announcements.approve)' })
  canPublishAnnouncements!: boolean;

  @ApiProperty({ description: 'Can export announcement read statistics (announcements.export)' })
  canExportAnnouncements!: boolean;

  @ApiProperty({ description: 'Can view flight applications (flight.view)' })
  canViewFlight!: boolean;

  @ApiProperty({ description: 'Can submit flight applications (flight.create)' })
  canCreateFlight!: boolean;

  @ApiProperty({
    description: 'Can attach flight tickets after approval (flight.manage)',
  })
  canManageFlight!: boolean;

  @ApiProperty({ description: 'Can view business trips (business-trip.view)' })
  canViewBusinessTrip!: boolean;

  @ApiProperty({
    description: 'Can submit business trips (business-trip.create)',
  })
  canCreateBusinessTrip!: boolean;

  @ApiProperty({
    description:
      'Can attach business trip tickets after approval (business-trip.manage)',
  })
  canManageBusinessTrip!: boolean;

  @ApiProperty({
    description: 'Can view purchase requests (purchase-request.view)',
  })
  canViewPurchaseRequest!: boolean;

  @ApiProperty({
    description:
      'Can create and submit purchase requests (purchase-request.create)',
  })
  canCreatePurchaseRequest!: boolean;

  @ApiProperty({
    description:
      'Company toggle modules.projectManagement.enabled (env default when unset).',
  })
  modulesProjectManagementEnabled!: boolean;

  @ApiProperty({
    description:
      'System Administrator - bypasses project team module gates and receives full RBAC.',
  })
  isSystemAdministrator!: boolean;

  @ApiProperty({
    description:
      'True when at least one active employee reports to this user; unlocks the team-scoped HR views.',
  })
  hasDirectReports!: boolean;

  @ApiProperty({
    description:
      'True System Administrator role only (not Project Administrator). Required to assign/revoke System Administrator.',
  })
  isSystemAdmin!: boolean;

  @ApiProperty({ type: PmCapabilitiesDto })
  pm!: PmCapabilitiesDto;

  @ApiProperty({ type: EpcCapabilitiesDto })
  epc!: EpcCapabilitiesDto;
}
