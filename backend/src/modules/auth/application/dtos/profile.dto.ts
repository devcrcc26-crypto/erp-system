import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class ProfileRoleDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'True when this is the user primary role' })
  isPrimary!: boolean;
}

export class ProfileEmergencyContactDto {
  @ApiProperty()
  firstName!: string;

  @ApiProperty({ nullable: true })
  middleName!: string | null;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true, description: 'Present only when recorded' })
  relationship!: string | null;
}

export class ProfileResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ nullable: true })
  pendingEmail!: string | null;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ nullable: true })
  chineseName!: string | null;

  @ApiProperty({ nullable: true })
  phone!: string | null;

  @ApiProperty()
  companyId!: string;

  @ApiProperty()
  companyName!: string;

  @ApiProperty({ nullable: true })
  preferredLanguage!: string | null;

  @ApiProperty({ nullable: true })
  preferredTimezone!: string | null;

  @ApiProperty({ nullable: true })
  preferredDateFormat!: string | null;

  @ApiProperty({ nullable: true })
  emailVerifiedAt!: Date | null;

  @ApiProperty({ nullable: true, required: false })
  photoDocumentId!: string | null;

  @ApiProperty({ type: [ProfileRoleDto] })
  roles!: ProfileRoleDto[];

  // Read-only employment record (My Profile). Dates are YYYY-MM-DD.
  @ApiProperty({ nullable: true, example: 'EMP-0001' })
  employeeId!: string | null;

  @ApiProperty({ nullable: true })
  middleName!: string | null;

  @ApiProperty({ nullable: true })
  departmentName!: string | null;

  @ApiProperty({ nullable: true })
  departmentNameZh!: string | null;

  @ApiProperty({ nullable: true })
  positionTitle!: string | null;

  @ApiProperty({ nullable: true })
  positionTitleZh!: string | null;

  @ApiProperty({ nullable: true })
  branchName!: string | null;

  @ApiProperty({ nullable: true })
  reportsToName!: string | null;

  @ApiProperty({ nullable: true })
  reportsToChineseName!: string | null;

  @ApiProperty({
    nullable: true,
    enum: ['PERMANENT', 'CONTRACT', 'TEMPORARY', 'FREELANCER'],
  })
  employeeType!: string | null;

  @ApiProperty({ nullable: true, enum: ['ETHIOPIAN', 'CHINESE'] })
  nationality!: string | null;

  @ApiProperty({ nullable: true, example: '1990-05-21' })
  dateOfBirth!: string | null;

  @ApiProperty({ nullable: true, enum: ['MALE', 'FEMALE'] })
  gender!: string | null;

  @ApiProperty({ nullable: true })
  educationLevel!: string | null;

  @ApiProperty({ nullable: true })
  fieldOfStudy!: string | null;

  @ApiProperty({ nullable: true, example: '2015-09-01' })
  experienceStartDate!: string | null;

  @ApiProperty({ nullable: true })
  addressCountry!: string | null;

  @ApiProperty({ nullable: true })
  addressRegion!: string | null;

  @ApiProperty({ nullable: true })
  addressCity!: string | null;

  @ApiProperty({ nullable: true })
  addressSubcity!: string | null;

  @ApiProperty({ nullable: true })
  addressWoreda!: string | null;

  @ApiProperty({ nullable: true })
  addressHouseNumber!: string | null;

  @ApiProperty({ type: [ProfileEmergencyContactDto] })
  emergencyContacts!: ProfileEmergencyContactDto[];

  @ApiProperty({ nullable: true, description: 'Payroll bank name' })
  bankName!: string | null;

  @ApiProperty({ nullable: true, description: 'Payroll bank branch' })
  bankBranch!: string | null;

  @ApiProperty({
    nullable: true,
    description: 'Full account number (own profile only)',
  })
  bankAccountNumber!: string | null;
}

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

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
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class ChangeEmailDto {
  @ApiProperty()
  @IsEmail()
  newEmail!: string;
}

export class ConfirmEmailChangeDto {
  @ApiProperty({ minLength: 32 })
  @IsString()
  @MinLength(32)
  token!: string;
}
