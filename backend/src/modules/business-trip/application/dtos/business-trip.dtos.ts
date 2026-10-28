import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
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
  BusinessTripStatus,
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

function toOptionalNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * One passenger row on a business trip submit payload.
 */
export class BusinessTripPassengerDto {
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

/**
 * Multipart / JSON submit body for a new business trip.
 * isInternational is always true - not accepted from the client.
 */
export class SubmitBusinessTripDto extends OnBehalfSubmissionDto {
  @ApiProperty({ enum: FlightTripType })
  @IsEnum(FlightTripType)
  tripType!: FlightTripType;

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
  destinationCountry!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destinationCity!: string;

  @ApiProperty({ example: '2026-09-01T08:00:00.000Z' })
  @IsDateString()
  departureDate!: string;

  @ApiPropertyOptional({ example: '2026-09-10T18:00:00.000Z' })
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf(
    (o: SubmitBusinessTripDto) => o.tripType === FlightTripType.ROUND_TRIP,
  )
  @IsDateString()
  returnDate?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  purpose!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(500)
  hostOrganization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(200)
  hostContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(50)
  hostContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEmail()
  @MaxLength(320)
  hostContactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(4000)
  expectedOutcomes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(4000)
  itinerary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedAccommodationCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedPerDiem?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedOtherCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiProperty({ type: [BusinessTripPassengerDto] })
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
  @Type(() => BusinessTripPassengerDto)
  passengers!: BusinessTripPassengerDto[];
}

/**
 * Employee edit of a DRAFT / RETURNED trip: full replacement of the submit
 * fields (dates and passengers are validated together). On-behalf /
 * auto-approve fields only apply at creation.
 */
export class UpdateBusinessTripDto extends OmitType(SubmitBusinessTripDto, [
  'onBehalfOfEmployeeId',
  'autoApproveTier',
] as const) {}

/**
 * Header fields for creating a DRAFT business trip (no passengers, no submit).
 */
export class CreateBusinessTripDraftDto {
  @ApiProperty({ enum: FlightTripType })
  @IsEnum(FlightTripType)
  tripType!: FlightTripType;

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
  destinationCountry!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destinationCity!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  departureDate!: string;

  @ApiPropertyOptional({ example: '2026-09-10' })
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @ValidateIf(
    (o: CreateBusinessTripDraftDto) => o.tripType === FlightTripType.ROUND_TRIP,
  )
  @IsDateString()
  returnDate?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  purpose!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(500)
  hostOrganization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(200)
  hostContactName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(50)
  hostContactPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsEmail()
  @MaxLength(320)
  hostContactEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(4000)
  expectedOutcomes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(4000)
  itinerary?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedAccommodationCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedPerDiem?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => toOptionalNumber(value))
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  estimatedOtherCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => emptyToUndefined(value))
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

export class ListBusinessTripsDto {
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
    description: 'Comma-separated BusinessTripStatus values',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'When true, only APPROVED trips still needing ticket attachment',
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
  @IsString()
  destinationCountry?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    enum: ['createdAt', 'departureDate', 'tripNumber'],
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export { BusinessTripStatus };
