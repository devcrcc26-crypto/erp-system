import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

export class CreateUserDto {
  @ApiPropertyOptional({
    description:
      'Optional. Leave blank for record-only users (e.g. Chinese site workers) who will never log in. ' +
      'Such users have no authentication or password reset access.',
  })
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed === '' ? undefined : normalizeEmail(trimmed);
  })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty()
  @IsString()
  firstName!: string;

  @ApiProperty()
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({ description: 'Chinese full name (中文姓名)' })
  @IsOptional()
  @IsString()
  chineseName?: string;

  @ApiPropertyOptional({ description: 'Omit to send an email activation invite instead' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  positionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredLanguage?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredTimezone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  preferredDateFormat?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}

export class CreateRoleDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  parentRoleId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateRoleDto extends PartialType(CreateRoleDto) {}

export class RolePermissionItemDto {
  @ApiProperty()
  @IsEntityUuid()
  permissionId!: string;

  @ApiProperty()
  @IsBoolean()
  canView!: boolean;

  @ApiProperty()
  @IsBoolean()
  canCreate!: boolean;

  @ApiProperty()
  @IsBoolean()
  canEdit!: boolean;

  @ApiProperty()
  @IsBoolean()
  canDelete!: boolean;

  @ApiProperty()
  @IsBoolean()
  canApprove!: boolean;

  @ApiProperty()
  @IsBoolean()
  canExport!: boolean;
}

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [RolePermissionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RolePermissionItemDto)
  permissions!: RolePermissionItemDto[];
}

export class AssignUserRoleDto {
  @ApiProperty()
  @IsEntityUuid()
  roleId!: string;
}

export class CreateDataScopeDto {
  @ApiProperty({ enum: ['COMPANY', 'BRANCH', 'DIVISION', 'DEPARTMENT', 'PROJECT', 'SELF'] })
  @IsString()
  scopeType!: 'COMPANY' | 'BRANCH' | 'DIVISION' | 'DEPARTMENT' | 'PROJECT' | 'SELF';

  @ApiProperty()
  @IsString()
  scopeValue!: string;
}

export class UpdateDataScopeDto extends PartialType(CreateDataScopeDto) {}
