import { SiteAssignmentStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

/** POST /hr/site-assignments — create an immediately active site assignment. */
export class CreateSiteAssignmentDto {
  @IsUUID()
  employeeId!: string;

  /** Required when the submitter is HR; assignment is attributed to this supervisor. */
  @IsOptional()
  @IsUUID()
  onBehalfOfSupervisorId?: string;

  @IsString()
  @MaxLength(200)
  siteName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  projectName?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  lateReason?: string;

  /** Set when HR submits from the not-in-attendance-file flow. */
  @IsOptional()
  createdFromAttendanceImport?: boolean;
}

/** @deprecated Use CreateSiteAssignmentDto */
export class SubmitSiteAssignmentDto extends CreateSiteAssignmentDto {}

export class ListSiteAssignmentsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsIn([
    'SUBMITTED',
    'IN_REVIEW',
    'APPROVED',
    'REJECTED',
    'RETURNED',
    'CANCELLED',
  ])
  status?: SiteAssignmentStatus;

  @IsOptional()
  @IsString()
  siteName?: string;

  /** Filter assignments overlapping this calendar month (1–12). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  month?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;

  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class ListHrEmployeesForSiteAssignmentDto {
  /** Direct reports of this user (supervisor id). */
  @IsOptional()
  @IsUUID()
  reportsTo?: string;

  /** When true, list supervisors HR may pick (approver-only or has direct reports). */
  @IsOptional()
  @Transform(({ value }) =>
    value === true || value === 'true' || value === '1' ? 'true' : value,
  )
  siteAssignmentSupervisors?: string;
}

export class ShortenSiteAssignmentDto {
  @IsDateString()
  endDate!: string;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}
