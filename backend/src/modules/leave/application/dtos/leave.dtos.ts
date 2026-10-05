import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveRequestStatus, LeaveType } from '@prisma/client';
import { plainToInstance, Transform, Type } from 'class-transformer';

import { OnBehalfSubmissionDto } from '../../../on-behalf/on-behalf-submission.dto';
export class LeavePeriodInputDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-08-05' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({
    enum: ['FULL', 'MORNING', 'AFTERNOON'],
    description:
      'FULL (default), or MORNING/AFTERNOON for a single full working weekday (0.5 day)',
  })
  @IsOptional()
  @IsIn(['FULL', 'MORNING', 'AFTERNOON'])
  dayPortion?: 'FULL' | 'MORNING' | 'AFTERNOON';
}

/**
 * Multipart forms send periods as a JSON string; JSON body sends an array.
 * Always return LeavePeriodInputDto instances so nested whitelist validation works.
 */
function parsePeriods(value: unknown): unknown {
  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }
  if (!Array.isArray(parsed)) {
    return parsed;
  }
  return plainToInstance(LeavePeriodInputDto, parsed);
}

export class SubmitLeaveRequestDto extends OnBehalfSubmissionDto {
  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType)
  leaveType!: LeaveType;

  @ApiPropertyOptional({
    type: [LeavePeriodInputDto],
    description: 'One or more non-overlapping date ranges',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parsePeriods(value))
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LeavePeriodInputDto)
  periods?: LeavePeriodInputDto[];

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Legacy single-range start (used when periods is omitted)',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-08-05',
    description: 'Legacy single-range end (used when periods is omitted)',
  })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    example: 5,
    description: 'Ignored — working days are calculated from the work schedule',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(365)
  days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}

export class UpdateLeaveRequestDto {
  @ApiPropertyOptional({ enum: LeaveType })
  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @ApiPropertyOptional({ type: [LeavePeriodInputDto] })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => parsePeriods(value))
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LeavePeriodInputDto)
  periods?: LeavePeriodInputDto[];

  @ApiPropertyOptional({ example: '2026-08-01' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-05' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(365)
  days?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reason?: string;
}

export class ListLeaveRequestsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Status or comma-separated statuses',
  })
  @IsOptional()
  status?: LeaveRequestStatus | LeaveRequestStatus[] | string;

  @ApiPropertyOptional({ enum: LeaveType })
  @IsOptional()
  @IsEnum(LeaveType)
  leaveType?: LeaveType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}

export class LeaveBalanceQueryDto {
  @ApiPropertyOptional({ description: 'Calendar year (defaults to current)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({
    description:
      'Employee to read (on-behalf filing). Defaults to the caller; requires on-behalf eligibility.',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class ListLeaveBalancesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Calendar year (defaults to current)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional({ description: 'Filter by employee user ID' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ description: 'Search employee name or email' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}
