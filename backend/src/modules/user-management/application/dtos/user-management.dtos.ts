import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  EducationLevel,
  EmployeeType,
  Gender,
  Nationality,
  UserDiscipline,
} from '@prisma/client';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';

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

  @ApiPropertyOptional({ enum: UserDiscipline, deprecated: true })
  @IsOptional()
  @IsEnum(UserDiscipline)
  discipline?: UserDiscipline;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  engineeringDisciplineId?: string;

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

  @ApiPropertyOptional({ example: 'EMP-0001' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressRegion?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressCity?: string;

  @ApiPropertyOptional({ description: 'Subcity / Zone / Woreda' })
  @IsOptional()
  @IsString()
  addressSubcity?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  addressHouseNumber?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({ enum: Nationality })
  @IsOptional()
  @IsEnum(Nationality)
  nationality?: Nationality;

  @ApiPropertyOptional({ enum: EmployeeType })
  @IsOptional()
  @IsEnum(EmployeeType)
  employeeType?: EmployeeType;

  @ApiPropertyOptional({ enum: EducationLevel })
  @IsOptional()
  @IsEnum(EducationLevel)
  educationLevel?: EducationLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fieldOfStudy?: string;

  @ApiPropertyOptional({ example: '2015-06-01' })
  @IsOptional()
  @IsDateString()
  experienceStartDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactFirstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactMiddleName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactLastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  @Transform(({ value }) => (typeof value === 'string' ? normalizeEmail(value) : value))
  emergencyContactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  leavePolicyId?: string;
}

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['discipline', 'engineeringDisciplineId'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ nullable: true, enum: UserDiscipline, deprecated: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEnum(UserDiscipline)
  discipline?: UserDiscipline | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEntityUuid()
  engineeringDisciplineId?: string | null;
}

export class UsersQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Matches against first name, last name, or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  disciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  departmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  positionId?: string;

  @ApiPropertyOptional({ description: 'Pass "true" or "false"' })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
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

export class SetPrimaryRoleDto {
  @ApiProperty({ description: 'Role id to mark as the user primary role' })
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
