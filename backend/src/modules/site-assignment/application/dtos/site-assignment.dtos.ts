import { SiteAssignmentStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class SubmitSiteAssignmentDto {
  @IsOptional()
  @IsUUID()
  onBehalfOfEmployeeId?: string;

  /**
   * Crew request: one assignment per listed employee (direct reports or the
   * submitter's delegate scope). Mutually exclusive with onBehalfOfEmployeeId.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  crewEmployeeIds?: string[];

  @IsString()
  @MaxLength(200)
  siteName!: string;

  @IsOptional()
  @IsUUID()
  projectId?: string;

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

  @IsOptional()
  autoApproveTier?: boolean;

  /** Set when HR submits from the not-in-attendance-file flow. */
  @IsOptional()
  createdFromAttendanceImport?: boolean;
}

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

export class ShortenSiteAssignmentDto {
  @IsDateString()
  endDate!: string;

  @IsString()
  @MaxLength(2000)
  reason!: string;
}
