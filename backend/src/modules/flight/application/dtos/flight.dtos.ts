import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  FlightApplicationStatus,
  FlightTicketClass,
  FlightTripType,
  FlightVisaStatus,
} from '@prisma/client';

import { OnBehalfSubmissionDto } from '../../../on-behalf/on-behalf-submission.dto';
function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return Boolean(value);
}

function emptyToUndefined(value: unknown): unknown {
  return value === '' || value === null ? undefined : value;
}

/**
 * One passenger row on a flight application submit payload.
 */
export class FlightPassengerDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(64)
  passportNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : toBoolean(value),
  )
  @IsBoolean()
  visaRequired?: boolean;

  @ApiPropertyOptional({ enum: FlightVisaStatus })
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEnum(FlightVisaStatus)
  visaStatus?: FlightVisaStatus;
}

/** @deprecated Use FlightPassengerDto */
export type FlightPassengerInputDto = FlightPassengerDto;

/**
 * Multipart / JSON submit body for a new flight application.
 */
export class SubmitFlightApplicationDto extends OnBehalfSubmissionDto {
  @ApiProperty({ enum: FlightTripType })
  @IsEnum(FlightTripType)
  tripType!: FlightTripType;

  @ApiProperty()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isInternational!: boolean;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  originCountry!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  originCity!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination!: string;

  @ApiProperty({ example: '2026-09-01T08:00:00.000Z' })
  @IsDateString()
  departureDate!: string;

  @ApiPropertyOptional({ example: '2026-09-10T18:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf(
    (o: SubmitFlightApplicationDto) => o.tripType === FlightTripType.ROUND_TRIP,
  )
  @IsDateString()
  returnDate?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  purpose!: string;

  @ApiProperty({ enum: FlightTicketClass, default: FlightTicketClass.ECONOMY })
  @IsEnum(FlightTicketClass)
  ticketClass!: FlightTicketClass;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  linkedBusinessTripId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  siteAssignmentId?: string;

  @ApiProperty({ type: [FlightPassengerDto] })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as unknown[];
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FlightPassengerDto)
  passengers!: FlightPassengerDto[];
}

/**
 * Employee edit of a DRAFT / RETURNED application: full replacement of the
 * submit fields (dates and passengers are validated together). On-behalf /
 * auto-approve fields only apply at creation.
 */
export class UpdateFlightApplicationDto extends OmitType(
  SubmitFlightApplicationDto,
  ['onBehalfOfEmployeeId', 'autoApproveTier'] as const,
) {}

/**
 * Header fields for creating a DRAFT flight application (no passengers, no submit).
 */
export class CreateFlightDraftDto {
  @ApiProperty({ enum: FlightTripType })
  @IsEnum(FlightTripType)
  tripType!: FlightTripType;

  @ApiProperty()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isInternational!: boolean;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  originCountry!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  originCity!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  departureDate!: string;

  @ApiPropertyOptional({ example: '2026-09-10' })
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf(
    (o: CreateFlightDraftDto) => o.tripType === FlightTripType.ROUND_TRIP,
  )
  @IsDateString()
  returnDate?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  purpose!: string;

  @ApiProperty({ enum: FlightTicketClass, default: FlightTicketClass.ECONOMY })
  @IsEnum(FlightTicketClass)
  ticketClass!: FlightTicketClass;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  linkedBusinessTripId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  siteAssignmentId?: string;
}

export class ListFlightApplicationsDto {
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
    description: 'Comma-separated FlightApplicationStatus values',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : toBoolean(value),
  )
  @IsBoolean()
  isInternational?: boolean;

  @ApiPropertyOptional({
    description:
      'When true, only APPROVED applications still needing ticket attachment',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : toBoolean(value),
  )
  @IsBoolean()
  needsTicket?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  submittedById?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'departureDate', 'applicationNumber'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export { FlightApplicationStatus };
