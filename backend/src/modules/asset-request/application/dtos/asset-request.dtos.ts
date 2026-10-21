import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { AssetRequestStatus } from '@prisma/client';

const ASSET_REQUEST_STATUSES = Object.values(AssetRequestStatus);

export class CreateAssetRequestDto {
  @ApiPropertyOptional({ description: 'Employee ID (HR submitting on behalf)' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ description: 'Asset category being requested', maxLength: 200 })
  @IsString()
  @MaxLength(200)
  assetCategory!: string;

  @ApiPropertyOptional({ description: 'Specific asset type/model', maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assetType?: string;

  @ApiProperty({ description: 'Reason for the request', maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({ description: 'Date asset is needed by (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  requiredByDate?: string;

  @ApiPropertyOptional({ description: 'Additional notes', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class UpdateAssetRequestDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assetCategory?: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  assetType?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  requiredByDate?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListAssetRequestsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by employee ID (HR only)' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: ASSET_REQUEST_STATUSES, isArray: true })
  @IsOptional()
  @Transform(({ value }) => (Array.isArray(value) ? value : value ? [value] : undefined))
  @IsIn(ASSET_REQUEST_STATUSES, { each: true })
  status?: AssetRequestStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}

export class FulfillAssetRequestDto {
  @ApiPropertyOptional({ description: 'ID of the CompanyAsset that fulfills this request' })
  @IsOptional()
  @IsUUID()
  assetId?: string;
}
