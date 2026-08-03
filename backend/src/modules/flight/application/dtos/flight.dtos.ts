import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  FlightApplicationStatus,
  FlightTicketClass,
  FlightTripType,
  FlightVisaStatus,
} from '@prisma/client';

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return Boolean(value);
}

export class FlightPassengerInputDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional()
  @IsOptional()
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
  @IsEnum(FlightVisaStatus)
  visaStatus?: FlightVisaStatus;
}

export class SubmitFlightApplicationDto {
  @ApiProperty({ enum: FlightTripType })
  @IsEnum(FlightTripType)
  tripType!: FlightTripType;

  @ApiProperty()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  isInternational!: boolean;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  origin!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  destination!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  departureDate!: string;

  @ApiPropertyOptional({ example: '2026-09-10' })
  @ValidateIf((o: SubmitFlightApplicationDto) => o.tripType === FlightTripType.ROUND_TRIP)
  @IsDateString()
  returnDate?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  purpose!: string;

  @ApiProperty({ enum: FlightTicketClass, default: FlightTicketClass.ECONOMY })
  @IsEnum(FlightTicketClass)
  ticketClass!: FlightTicketClass;

  @ApiProperty()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  accommodationRequired!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  accommodationDetails?: string;

  @ApiProperty()
  @Transform(({ value }) => toBoolean(value))
  @IsBoolean()
  perDiemRequired!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @ApiProperty({ type: [FlightPassengerInputDto] })
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value) as FlightPassengerInputDto[];
      } catch {
        return value;
      }
    }
    return value;
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => FlightPassengerInputDto)
  passengers!: FlightPassengerInputDto[];
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

  @ApiPropertyOptional({ enum: ['createdAt', 'departureDate', 'applicationNumber'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';
}

export { FlightApplicationStatus };
