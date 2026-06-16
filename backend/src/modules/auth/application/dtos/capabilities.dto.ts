import { ApiProperty } from '@nestjs/swagger';

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
}
