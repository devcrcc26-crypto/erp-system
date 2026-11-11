import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttendanceMonthStatus,
  AttendanceScanReviewDecision,
  FieldMovementReason,
  FieldMovementStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class ManualAssignmentDto {
  @ApiProperty({ description: 'Zero-based index into the review or rejected array' })
  @IsInt()
  @Min(0)
  rowIndex!: number;

  @ApiProperty({
    description: 'Which preview bucket this row is in',
    enum: ['review', 'rejected'],
  })
  @IsIn(['review', 'rejected'])
  bucket!: 'review' | 'rejected';

  @ApiProperty({ description: 'ERP user id to assign this attendance row to' })
  @IsUUID()
  employeeId!: string;
}

export class IgnoreAttendanceRowDto {
  @ApiProperty({ description: 'Zero-based index into the rejected preview array' })
  @IsInt()
  @Min(0)
  rowIndex!: number;

  @ApiProperty({ description: 'Why this Deli identity should be ignored' })
  @IsString()
  @MinLength(3)
  reason!: string;
}

export class MissingEmployeeImportActionDto {
  @ApiProperty({ description: 'ERP employee missing from the attendance file' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({
    description: 'Resolution chosen during import preview',
    enum: ['MARKED_EXEMPT', 'MANUAL_PRESENT', 'NEEDS_ENROLMENT'],
  })
  @IsIn(['MARKED_EXEMPT', 'MANUAL_PRESENT', 'NEEDS_ENROLMENT'])
  resolution!: 'MARKED_EXEMPT' | 'MANUAL_PRESENT' | 'NEEDS_ENROLMENT';

  @ApiPropertyOptional({
    description: 'Required when resolution is MANUAL_PRESENT',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  note?: string;
}

export class ConfirmAttendanceImportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  previewToken!: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  overwrite!: boolean;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  confirmedReviewIndices?: number[];

  @ApiPropertyOptional({
    type: [ManualAssignmentDto],
    description:
      'Optional HR overrides that assign review or rejected rows to ERP employees',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualAssignmentDto)
  manualAssignments?: ManualAssignmentDto[];

  @ApiPropertyOptional({
    type: [IgnoreAttendanceRowDto],
    description: 'Not-matched rows to persist as IGNORED identities',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IgnoreAttendanceRowDto)
  ignoredRows?: IgnoreAttendanceRowDto[];

  @ApiPropertyOptional({
    type: [MissingEmployeeImportActionDto],
    description:
      'Resolutions for SCANNER employees missing from the attendance file',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MissingEmployeeImportActionDto)
  missingEmployeeActions?: MissingEmployeeImportActionDto[];
}

export class UpdateAttendanceIdentityDto {
  @ApiPropertyOptional({ enum: ['MAPPED', 'IGNORED'] })
  @IsOptional()
  @IsIn(['MAPPED', 'IGNORED'])
  status?: 'MAPPED' | 'IGNORED';

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  userId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string | null;
}

export class UnignoreAttendancePreviewRowDto {
  @ApiProperty({ description: 'Preview session token from import/preview' })
  @IsString()
  @IsNotEmpty()
  previewToken!: string;

  @ApiProperty({
    description: 'Index of the row in the preview ignored list',
  })
  @IsInt()
  @Min(0)
  ignoredIndex!: number;
}

export class ResolveAttendanceMissingDto {
  @ApiProperty({
    enum: ['MARKED_EXEMPT', 'MANUAL_PRESENT', 'NEEDS_ENROLMENT'],
  })
  @IsIn(['MARKED_EXEMPT', 'MANUAL_PRESENT', 'NEEDS_ENROLMENT'])
  resolution!: 'MARKED_EXEMPT' | 'MANUAL_PRESENT' | 'NEEDS_ENROLMENT';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  note?: string;
}

export class ListAttendanceDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}

export class ReviewAttendanceMonthDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ApproveAttendanceMonthDto {
  @ApiProperty()
  @IsUUID()
  monthlyApprovalId!: string;
}

export class UnlockAttendanceMonthDto {
  @ApiPropertyOptional({
    description: 'Taken from the route param when omitted from the body',
  })
  @IsOptional()
  @IsUUID()
  monthlyApprovalId?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  unlockReason!: string;
}

export class CorrectDailyLogDto {
  @ApiProperty()
  @IsUUID()
  dailyLogId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:mm format' })
  correctedClockInLocal?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:mm format' })
  correctedClockOutLocal?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MinLength(10, { message: 'Correction note must be at least 10 characters' })
  correctionNote!: string;
}

export class ListAttendanceMonthlyApprovalsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional({ enum: AttendanceMonthStatus })
  @IsOptional()
  @IsEnum(AttendanceMonthStatus)
  status?: AttendanceMonthStatus;
}

export class CreateFieldMovementEntryDto {
  @ApiProperty()
  @IsUUID()
  dailyLogId!: string;

  @ApiProperty({ enum: FieldMovementReason })
  @IsEnum(FieldMovementReason)
  reason!: FieldMovementReason;

  @ApiPropertyOptional({
    description: 'Required when reason is FIELD_VISIT',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  destination?: string;

  @ApiPropertyOptional({
    description:
      'Departure / time-out in HH:mm - required for FIELD_VISIT, EARLY_LEAVE, and FORGOT_CLOCK_OUT',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:mm format' })
  departureTime?: string;

  @ApiPropertyOptional({
    description:
      'Return time in HH:mm local format - omit if did not return to office. For FORGOT_CLOCK_IN: the stated clock-in time (required when paired with FORGOT_CLOCK_OUT, i.e. "forgot both").',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:mm format' })
  returnTime?: string;

  @ApiPropertyOptional({
    description: 'Reason / note (required on the entry or the parent log)',
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  notes?: string;
}

export class CreateFieldMovementLogDto {
  @ApiProperty({ type: [CreateFieldMovementEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFieldMovementEntryDto)
  @ArrayMinSize(1, { message: 'At least one entry is required' })
  entries!: CreateFieldMovementEntryDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  notes?: string;

  @ApiPropertyOptional({
    description: 'HR / lead submitting on behalf of this employee',
  })
  @IsOptional()
  @IsUUID()
  onBehalfOfEmployeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  autoApproveTier?: boolean;

  @ApiPropertyOptional({
    description:
      'Required when HR enters dates before the current calendar month',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  lateReason?: string;
}

export class SubmitFieldMovementLogDto {
  @ApiPropertyOptional({
    description:
      'Required when HR submits flagged days before the current calendar month',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  lateReason?: string;
}

export class UpsertFieldMovementDraftEntriesDto {
  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year!: number;

  @ApiProperty({ type: [CreateFieldMovementEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFieldMovementEntryDto)
  @ArrayMinSize(1, { message: 'At least one entry is required' })
  entries!: CreateFieldMovementEntryDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  lateReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  onBehalfOfEmployeeId?: string;
}

export class RemoveFieldMovementDraftDayDto {
  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year!: number;

  @ApiProperty()
  @IsUUID()
  dailyLogId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  onBehalfOfEmployeeId?: string;
}

export class UpdateFieldMovementLogDto {
  @ApiPropertyOptional({ type: [CreateFieldMovementEntryDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateFieldMovementEntryDto)
  entries?: CreateFieldMovementEntryDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListFieldMovementLogsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: FieldMovementStatus })
  @IsOptional()
  @IsEnum(FieldMovementStatus)
  status?: FieldMovementStatus;
}

export class GetFlaggedDaysDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year!: number;
}

/** SCAN_ONLY schedules: list SCAN_AFTER_DEADLINE flags for a month. */
export class ListScanReviewsDto {
  @ApiProperty({ example: 10 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ example: 2026 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @ApiPropertyOptional({ enum: ['PENDING', 'REVIEWED', 'ALL'], default: 'ALL' })
  @IsOptional()
  @IsIn(['PENDING', 'REVIEWED', 'ALL'])
  status?: 'PENDING' | 'REVIEWED' | 'ALL';
}

/** HR decision on a SCAN_AFTER_DEADLINE flag. No pay effect either way. */
export class ReviewScanFlagDto {
  @ApiProperty({ enum: AttendanceScanReviewDecision })
  @IsEnum(AttendanceScanReviewDecision)
  decision!: AttendanceScanReviewDecision;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
