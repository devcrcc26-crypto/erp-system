import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { PerDiemTripType } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

import { OnBehalfSubmissionDto } from '../../../on-behalf/on-behalf-submission.dto';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;
function emptyToUndefined(value: unknown): unknown {
  return value === '' || value === null ? undefined : value;
}

export class SubmitPerDiemRequestDto extends OnBehalfSubmissionDto {
  @ApiProperty({ enum: PerDiemTripType, default: PerDiemTripType.TRAVEL })
  @IsOptional()
  @IsEnum(PerDiemTripType)
  tripType?: PerDiemTripType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  destinationCategory!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination!: string;

  @ApiPropertyOptional({ example: '08:00', description: '24-hour departure time' })
  @IsOptional()
  @IsString()
  @Matches(TIME_OF_DAY, { message: 'departureTime must be HH:mm' })
  departureTime?: string;

  @ApiPropertyOptional({ example: '18:00', description: '24-hour return time' })
  @IsOptional()
  @IsString()
  @Matches(TIME_OF_DAY, { message: 'returnTime must be HH:mm' })
  returnTime?: string;

  @ApiProperty({
    description:
      'Employee-entered per diem days. Must be at least 1 and no more than the inclusive calendar span.',
  })
  @IsInt()
  @Min(1)
  days!: number;

  @ApiProperty({
    example: '2026-09-01',
    description: 'First per diem day. Only the date portion (YYYY-MM-DD) is used.',
  })
  @IsDateString()
  startDate!: string;

  @ApiProperty({
    example: '2026-09-05',
    description:
      'Last per diem day (inclusive). Only the date portion (YYYY-MM-DD) is used.',
  })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  linkedFlightId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  linkedBusinessTripId?: string;

  @ApiPropertyOptional({
    description:
      'Approved site assignment to link when tripType is SITE_DEPLOYMENT',
  })
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsUUID()
  siteAssignmentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  requestedDailyRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  rateOverrideReason?: string;
}

/**
 * Employee edit of a DRAFT / RETURNED request. Full replacement of the submit
 * fields: dates, days and rate are interdependent, so they are re-validated
 * together. On-behalf / auto-approve fields only apply at creation.
 */
export class UpdatePerDiemRequestDto extends OmitType(SubmitPerDiemRequestDto, [
  'onBehalfOfEmployeeId',
  'autoApproveTier',
] as const) {}

export class CreatePerDiemDisbursementDto {
  @ApiProperty()
  @IsDateString()
  disbursedAt!: string;

  @ApiProperty()
  @IsDateString()
  coveredDaysFrom!: string;

  @ApiProperty()
  @IsDateString()
  coveredDaysTo!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class CreatePerDiemRequestSettlementDto {
  @ApiProperty()
  @IsDateString()
  actualReturnDate!: string;

  @ApiPropertyOptional({ description: 'Override auto-calculated actual days' })
  @IsOptional()
  @IsInt()
  @Min(1)
  actualDaysOverride?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class FormalizeRequestSettlementBalanceDto {
  @ApiProperty({
    description:
      'Payment reference or cash-return receipt number for the settlement balance',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  paymentReference!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  paymentDate!: string;
}

export class SetApprovedRateDto {
  @ApiProperty({ description: 'Approved daily rate in the request currency' })
  @IsNumber()
  @Min(0)
  approvedDailyRate!: number;
}

export class ListPerDiemRequestsDto {
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
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated PerDiemStatus values',
  })
  @IsOptional()
  @IsString()
  status?: string;

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
}
