import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { DriveType, VehicleApplicationStatus } from '@prisma/client';

import { OnBehalfSubmissionDto } from '../../../on-behalf/on-behalf-submission.dto';
export class SubmitVehicleApplicationDto extends OnBehalfSubmissionDto {
  @ApiProperty({ description: 'Company vehicle ID' })
  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @ApiProperty({ enum: DriveType })
  @IsEnum(DriveType)
  driveType!: DriveType;

  @ApiPropertyOptional({ description: 'Driver user ID (required when driveType is COMPANY_DRIVER)' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiProperty({ description: 'ISO 8601 departure datetime' })
  @IsDateString()
  departureDatetime!: string;

  @ApiProperty({ description: 'ISO 8601 return datetime' })
  @IsDateString()
  returnDatetime!: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination!: string;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  purpose!: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  passengerCount?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  passengerNames?: string;

  @ApiPropertyOptional({ description: 'Project ID' })
  @IsOptional()
  @IsString()
  projectId?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

/**
 * Employee edit of a DRAFT / RETURNED application: full replacement of the
 * submit fields (dates, vehicle and driver are validated together).
 * On-behalf / auto-approve fields only apply at creation.
 */
export class UpdateVehicleApplicationDto extends OmitType(
  SubmitVehicleApplicationDto,
  ['onBehalfOfEmployeeId', 'autoApproveTier'] as const,
) {}

export class ListVehicleApplicationsDto {
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
    description: 'Comma-separated VehicleApplicationStatus values',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export { VehicleApplicationStatus };
