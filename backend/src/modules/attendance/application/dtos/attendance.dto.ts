import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AttendanceMonthStatus,
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
    description: 'Departure time in HH:mm local format',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:mm format' })
  departureTime?: string;

  @ApiPropertyOptional({
    description:
      'Return time in HH:mm local format — omit if did not return to office',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'Time must be in HH:mm format' })
  returnTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
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
  notes?: string;
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
