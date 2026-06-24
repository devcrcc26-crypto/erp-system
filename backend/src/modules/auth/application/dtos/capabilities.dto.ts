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
}

export class EpcCapabilitiesDto {
  @ApiProperty()
  canViewReviewInbox!: boolean;

  @ApiProperty()
  canViewMyComments!: boolean;

  @ApiProperty()
  canViewEngineering!: boolean;

  @ApiProperty({
    description:
      'When true, user sees all project disciplines (PM / admin bypass).',
  })
  disciplineScopeBypass!: boolean;
}

export class CapabilitiesDto {
  @ApiProperty({ description: 'Can list and view users' })
  canManageUsers!: boolean;

  @ApiProperty({ description: 'Can create new users' })
  canCreateUsers!: boolean;

  @ApiProperty({ description: 'Can list and view roles' })
  canManageRoles!: boolean;

  @ApiProperty({ description: 'Can edit role permissions' })
  canEditRoles!: boolean;

  @ApiProperty({ description: 'Can view in-app notifications' })
  canViewNotifications!: boolean;

  @ApiProperty({ description: 'Can view company audit logs' })
  canViewAuditLogs!: boolean;

  @ApiProperty({ type: PmCapabilitiesDto })
  pm!: PmCapabilitiesDto;

  @ApiProperty({ type: EpcCapabilitiesDto })
  epc!: EpcCapabilitiesDto;
}
