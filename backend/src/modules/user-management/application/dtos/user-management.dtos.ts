import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import {
  AttendanceMode,
  EducationLevel,
  EmployeeType,
  EmploymentStatus,
  Gender,
  Nationality,
  UserDiscipline,
} from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import { normalisePhoneInput } from '../../../../shared/utils/ethiopian-phone.util';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';
import {
  IsAgeBetween,
  IsNotBeforeProperty,
  IsNotFutureDate,
  IsOptionalText,
} from '../../../../shared/validators/date-rules.decorator';
import {
  ADDRESS_MAX,
  CHINESE_NAME_MAX,
  CHINESE_NAME_PATTERN,
  EMAIL_MAX,
  EMPLOYEE_ID_PATTERN,
  FIELD_OF_STUDY_MAX,
  HOUSE_NUMBER_MAX,
  MAX_EMERGENCY_CONTACTS,
  MAX_EMPLOYEE_AGE,
  MIN_EMPLOYEE_AGE,
  NATIONAL_ID_PATTERN,
  PHONE_PATTERN,
  TIN_PATTERN,
  USER_NAME_MAX,
  USER_NAME_PATTERN,
  YEARS_OF_EXPERIENCE_MAX,
  trimString,
} from './user-field.rules';

const NAME_MESSAGE =
  '$property may contain letters, spaces, hyphens, apostrophes and full stops only';
const PHONE_MESSAGE = '$property must be a phone number with 7–15 digits';

export class EmergencyContactDto {
  @ApiProperty()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX)
  @Matches(USER_NAME_PATTERN, { message: NAME_MESSAGE })
  firstName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(USER_NAME_MAX)
  @Matches(USER_NAME_PATTERN, { message: NAME_MESSAGE })
  middleName?: string;

  @ApiProperty()
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX)
  @Matches(USER_NAME_PATTERN, { message: NAME_MESSAGE })
  lastName!: string;

  @ApiProperty({ description: 'Required - an emergency contact must be reachable' })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @MaxLength(EMAIL_MAX)
  @IsEmail()
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    return normalizeEmail(trimmed);
  })
  email?: string;
}

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
  @MaxLength(EMAIL_MAX)
  @IsEmail()
  email?: string;

  @ApiProperty({ maxLength: USER_NAME_MAX })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(USER_NAME_MAX)
  @Matches(USER_NAME_PATTERN, { message: NAME_MESSAGE })
  firstName!: string;

  @ApiPropertyOptional({ maxLength: USER_NAME_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(USER_NAME_MAX)
  @Matches(USER_NAME_PATTERN, { message: NAME_MESSAGE })
  lastName?: string;

  @ApiPropertyOptional({ description: 'Chinese full name (中文姓名)', maxLength: CHINESE_NAME_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(CHINESE_NAME_MAX)
  @Matches(CHINESE_NAME_PATTERN, {
    message: '$property must contain Chinese characters only',
  })
  chineseName?: string;

  @ApiPropertyOptional({
    description:
      'OA login name. Defaults to the displayed full name (first + middle + last). Editable by HR/admin only.',
    maxLength: USER_NAME_MAX * 3,
  })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(USER_NAME_MAX * 3)
  loginName?: string;

  @ApiPropertyOptional({
    description:
      'Optional temporary password. When omitted with issueTemporaryPassword=true, the server generates one. ' +
      'When omitted without that flag and email is set, an activation invite is emailed instead.',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({
    description:
      'When true (and email is set), create a login-ready account with mustChangePassword and return ' +
      'temporaryPassword once. Mutually exclusive with the activation-invite path.',
  })
  @IsOptional()
  @IsBoolean()
  issueTemporaryPassword?: boolean;

  @ApiPropertyOptional({
    example: '+251 911 234 567',
    description: 'Ethiopian numbers are stored as +251 followed by 9 digits',
  })
  @IsOptional()
  @IsOptionalText()
  @Transform(normalisePhoneInput)
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  phone?: string;

  @ApiPropertyOptional({ example: '+251 711 234 567' })
  @IsOptional()
  @IsOptionalText()
  @Transform(normalisePhoneInput)
  @IsString()
  @Matches(PHONE_PATTERN, { message: PHONE_MESSAGE })
  secondaryPhone?: string;

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

  @ApiPropertyOptional({ description: 'Seniority level (lookup id)' })
  @IsOptional()
  @IsEntityUuid()
  seniorityLevelId?: string;

  @ApiPropertyOptional({ description: 'Direct manager / supervisor (user id)' })
  @IsOptional()
  @IsEntityUuid()
  reportsToUserId?: string;

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

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  bankName?: string;

  @ApiPropertyOptional({ maxLength: 120 })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  bankBranch?: string;

  @ApiPropertyOptional({ maxLength: 64 })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(64)
  bankAccountNumber?: string;

  @ApiPropertyOptional({
    description: 'When false, employee is excluded from payroll runs',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeInPayroll?: boolean;

  @ApiPropertyOptional({
    enum: AttendanceMode,
    description:
      'SCANNER: uses the attendance machine. EXEMPT: counted present every working day.',
    default: AttendanceMode.SCANNER,
  })
  @IsOptional()
  @IsEnum(AttendanceMode)
  attendanceMode?: AttendanceMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ example: 'EMP-0001' })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @Matches(EMPLOYEE_ID_PATTERN, {
    message: '$property must be 2–20 letters, digits or hyphens',
  })
  employeeId?: string;

  @ApiPropertyOptional({ maxLength: USER_NAME_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(USER_NAME_MAX)
  @Matches(USER_NAME_PATTERN, { message: NAME_MESSAGE })
  middleName?: string;

  @ApiPropertyOptional({ maxLength: ADDRESS_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(ADDRESS_MAX)
  addressCountry?: string;

  @ApiPropertyOptional({ maxLength: ADDRESS_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(ADDRESS_MAX)
  addressRegion?: string;

  @ApiPropertyOptional({ maxLength: ADDRESS_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(ADDRESS_MAX)
  addressCity?: string;

  @ApiPropertyOptional({ description: 'Subcity / Zone', maxLength: ADDRESS_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(ADDRESS_MAX)
  addressSubcity?: string;

  @ApiPropertyOptional({ maxLength: ADDRESS_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(ADDRESS_MAX)
  addressWoreda?: string;

  @ApiPropertyOptional({ maxLength: HOUSE_NUMBER_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(HOUSE_NUMBER_MAX)
  addressHouseNumber?: string;

  @ApiPropertyOptional({ enum: Gender })
  @IsOptional()
  @IsEnum(Gender)
  gender?: Gender;

  @ApiPropertyOptional({ example: '1990-05-15' })
  @IsOptional()
  @IsOptionalText()
  @IsDateString()
  @IsNotFutureDate()
  @IsAgeBetween(MIN_EMPLOYEE_AGE, MAX_EMPLOYEE_AGE)
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @Matches(NATIONAL_ID_PATTERN, {
    message: '$property must be 4–30 letters, digits, spaces or hyphens',
  })
  nationalId?: string;

  @ApiPropertyOptional({
    example: '0012345678',
    description: 'Ethiopian Tax Identification Number (10 digits)',
  })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @Matches(TIN_PATTERN, {
    message: '$property must be exactly 10 digits',
  })
  tin?: string;

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

  @ApiPropertyOptional({ maxLength: FIELD_OF_STUDY_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(FIELD_OF_STUDY_MAX)
  fieldOfStudy?: string;

  @ApiPropertyOptional({
    example: '2024-03-01',
    description: 'Company hire / employment start date',
  })
  @IsOptional()
  @IsOptionalText()
  @IsDateString()
  @IsNotFutureDate()
  @IsNotBeforeProperty('dateOfBirth')
  employmentDate?: string;

  @ApiPropertyOptional({
    example: 6.5,
    nullable: true,
    description:
      'Career experience in years, as of today. The server records the as-of ' +
      'date when the value changes; null clears it.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 1, allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(YEARS_OF_EXPERIENCE_MAX)
  yearsOfExperience?: number | null;

  @ApiPropertyOptional({ type: [EmergencyContactDto], maxItems: MAX_EMERGENCY_CONTACTS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EMERGENCY_CONTACTS)
  @ValidateNested({ each: true })
  @Type(() => EmergencyContactDto)
  emergencyContacts?: EmergencyContactDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  leavePolicyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  workScheduleId?: string;
}

export const EXCLUDED_REASON_MAX = 500;

export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, [
    'discipline',
    'engineeringDisciplineId',
    'reportsToUserId',
    'leavePolicyId',
    'workScheduleId',
    'departmentId',
    'positionId',
    'seniorityLevelId',
  ] as const),
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

  @ApiPropertyOptional({ nullable: true, description: 'Direct manager / supervisor (user id)' })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEntityUuid()
  reportsToUserId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEntityUuid()
  leavePolicyId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEntityUuid()
  workScheduleId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEntityUuid()
  departmentId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEntityUuid()
  positionId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsEntityUuid()
  seniorityLevelId?: string | null;

  /**
   * Approver only - excluded from HR processes. PATCH /users/:id requires
   * users.edit, so only holders of that permission can set it. Audited.
   */
  @ApiPropertyOptional({
    description: 'Approver only - excluded from HR processes (users.edit; audited)',
  })
  @IsOptional()
  @IsBoolean()
  excludedFromHrProcesses?: boolean;

  @ApiPropertyOptional({
    nullable: true,
    maxLength: EXCLUDED_REASON_MAX,
    description: 'Why the account is approver-only (kept only while excluded)',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  @MaxLength(EXCLUDED_REASON_MAX)
  excludedReason?: string | null;
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

  @ApiPropertyOptional({ enum: EmploymentStatus })
  @IsOptional()
  @IsEnum(EmploymentStatus)
  employmentStatus?: EmploymentStatus;
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

  @ApiPropertyOptional({
    description:
      'When true, marks this role as primary (clears other primaries). ' +
      'When false, assigns as secondary. When omitted, first role becomes primary.',
  })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
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
