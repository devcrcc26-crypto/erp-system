import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';
import {
  EducationLevel,
  EmployeeType,
  Gender,
  Nationality,
  UserDiscipline,
} from '@prisma/client';

export type ImportRowStatus =
  | 'ok'
  | 'error'
  | 'duplicate'
  | 'duplicate_in_file';

export class ImportUsersOptionsDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sendInvitations?: boolean = true;
}

export class ImportRowPreviewDto {
  @ApiProperty()
  line!: number;

  @ApiPropertyOptional({ description: 'Blank for record-only users' })
  email?: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiPropertyOptional()
  middleName?: string;

  @ApiPropertyOptional({ description: 'Chinese full name (中文姓名)' })
  chineseName?: string;

  @ApiProperty()
  role!: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiPropertyOptional()
  department?: string;

  @ApiPropertyOptional()
  position?: string;

  @ApiPropertyOptional()
  employeeId?: string;

  @ApiPropertyOptional()
  leavePolicy?: string;

  @ApiPropertyOptional({ enum: UserDiscipline, nullable: true })
  discipline?: UserDiscipline | null;

  @ApiPropertyOptional({ enum: Gender, nullable: true })
  gender?: Gender | null;

  @ApiPropertyOptional({ enum: Nationality, nullable: true })
  nationality?: Nationality | null;

  @ApiPropertyOptional({ enum: EmployeeType, nullable: true })
  employeeType?: EmployeeType | null;

  @ApiPropertyOptional({ enum: EducationLevel, nullable: true })
  educationLevel?: EducationLevel | null;

  @ApiPropertyOptional({ description: 'ISO date YYYY-MM-DD' })
  dateOfBirth?: string;

  @ApiPropertyOptional()
  nationalId?: string;

  @ApiPropertyOptional()
  tin?: string;

  @ApiPropertyOptional()
  fieldOfStudy?: string;

  @ApiPropertyOptional({ description: 'Company hire date ISO YYYY-MM-DD' })
  employmentDate?: string;

  @ApiPropertyOptional({
    description: 'Years of experience as of the import date (0–70, one decimal)',
  })
  yearsOfExperience?: string;

  @ApiPropertyOptional()
  addressCountry?: string;

  @ApiPropertyOptional()
  addressRegion?: string;

  @ApiPropertyOptional()
  addressCity?: string;

  @ApiPropertyOptional()
  addressSubcity?: string;

  @ApiPropertyOptional()
  addressWoreda?: string;

  @ApiPropertyOptional()
  addressHouseNumber?: string;

  @ApiProperty({ enum: ['ok', 'error', 'duplicate', 'duplicate_in_file'] })
  status!: ImportRowStatus;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional()
  roleId?: string;

  @ApiPropertyOptional()
  departmentId?: string;

  @ApiPropertyOptional()
  positionId?: string;

  @ApiPropertyOptional()
  leavePolicyId?: string;

  @ApiPropertyOptional()
  engineeringDisciplineId?: string;
}

export class ImportPreviewResponseDto {
  @ApiProperty()
  valid!: number;

  @ApiProperty()
  invalid!: number;

  @ApiProperty()
  duplicate!: number;

  @ApiProperty({ type: [ImportRowPreviewDto] })
  rows!: ImportRowPreviewDto[];
}

export class ImportCommitErrorDto {
  @ApiProperty()
  line!: number;

  @ApiPropertyOptional()
  email?: string;

  @ApiProperty()
  message!: string;
}

export class ImportCommitResponseDto {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  skipped!: number;

  @ApiProperty()
  invitationsSent!: number;

  @ApiProperty()
  invitationsFailed!: number;

  @ApiProperty({ type: [ImportCommitErrorDto] })
  errors!: ImportCommitErrorDto[];
}
