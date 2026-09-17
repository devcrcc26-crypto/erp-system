import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
  ValidateIf,
} from 'class-validator';
import {
  InspectionRepairStatus,
  InspectionRepairType,
  InspectionRepairUrgency,
} from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';

import { OnBehalfSubmissionDto } from '../../../on-behalf/on-behalf-submission.dto';
export class SubmitInspectionRepairDto extends OnBehalfSubmissionDto {
  @ApiPropertyOptional({ description: 'Assigned company asset ID' })
  @IsOptional()
  @IsString()
  assetId?: string;

  @ApiPropertyOptional({ description: 'Required when no asset is selected' })
  @ValidateIf((o: SubmitInspectionRepairDto) => !o.assetId)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  deviceName?: string;

  @ApiProperty({ maxLength: 200 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  location!: string;

  @ApiPropertyOptional({ description: 'Optional when no asset is selected' })
  @ValidateIf((o: SubmitInspectionRepairDto) => !o.assetId && o.make != null && o.make !== '')
  @IsString()
  @MaxLength(120)
  make?: string;

  @ApiPropertyOptional({ description: 'Optional when no asset is selected' })
  @ValidateIf((o: SubmitInspectionRepairDto) => !o.assetId && o.model != null && o.model !== '')
  @IsString()
  @MaxLength(120)
  model?: string;

  @ApiPropertyOptional({ description: 'Optional when no asset is selected' })
  @ValidateIf((o: SubmitInspectionRepairDto) => !o.assetId && o.year != null)
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  year?: number;

  @ApiProperty({ maxLength: 4000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  description!: string;

  @ApiPropertyOptional({ maxLength: 4000 })
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  solution?: string;

  @ApiProperty({ enum: InspectionRepairUrgency })
  @IsEnum(InspectionRepairUrgency)
  urgency!: InspectionRepairUrgency;

  @ApiProperty({ enum: InspectionRepairType })
  @IsEnum(InspectionRepairType)
  inspectionType!: InspectionRepairType;
}

export class UpdateInspectionRepairDto extends SubmitInspectionRepairDto {
  @ApiPropertyOptional({ enum: InspectionRepairStatus })
  @IsOptional()
  @IsEnum(InspectionRepairStatus)
  status?: InspectionRepairStatus;

  @ApiPropertyOptional({ example: '2026-08-24T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;
}

export class ListInspectionRepairsDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated InspectionRepairStatus values',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ enum: InspectionRepairUrgency })
  @IsOptional()
  @IsEnum(InspectionRepairUrgency)
  urgency?: InspectionRepairUrgency;

  @ApiPropertyOptional({ enum: InspectionRepairType })
  @IsOptional()
  @IsEnum(InspectionRepairType)
  inspectionType?: InspectionRepairType;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
