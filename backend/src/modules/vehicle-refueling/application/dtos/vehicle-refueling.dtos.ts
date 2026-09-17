import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { FuelType, VehicleRefuelingStatus } from '@prisma/client';

import { OnBehalfSubmissionDto } from '../../../on-behalf/on-behalf-submission.dto';
export class SubmitVehicleRefuelingDto extends OnBehalfSubmissionDto {
  @ApiProperty({ description: 'Company vehicle ID' })
  @IsString()
  @IsNotEmpty()
  vehicleId!: string;

  @ApiPropertyOptional({ description: 'Driver user ID' })
  @IsOptional()
  @IsString()
  driverId?: string;

  @ApiProperty({ example: '2026-08-07', description: 'Fuel date' })
  @IsDateString()
  fuelDate!: string;

  @ApiProperty({ enum: FuelType })
  @IsEnum(FuelType)
  fuelType!: FuelType;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fuelStation!: string;

  @ApiProperty({ description: 'Current vehicle mileage (odometer km)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  currentMileage!: number;

  @ApiProperty({ description: 'Requested litres of fuel' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  requestedLitres!: number;

  @ApiPropertyOptional({ description: 'Unit price per litre in ETB' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unitPriceEtb?: number;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListVehicleRefuelingsDto {
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
    description: 'Comma-separated VehicleRefuelingStatus values',
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

export { VehicleRefuelingStatus };
