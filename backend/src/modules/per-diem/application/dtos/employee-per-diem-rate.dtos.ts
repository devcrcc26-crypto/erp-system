import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { SupportedCurrency } from '@prisma/client';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';

export class ListEmployeePerDiemRatesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Search by employee name or email' })
  @IsOptional()
  @IsString()
  search?: string;
}

/**
 * Upsert payload for an employee's per-destination daily rates.
 */
export class UpsertEmployeePerDiemRateDto {
  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  americasRate?: number;

  @ApiPropertyOptional({ example: 70 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  asiaRate?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  domesticRate?: number;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  eastAfricaRate?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  europeRate?: number;

  @ApiPropertyOptional({ example: 60 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  middleEastRate?: number;

  @ApiPropertyOptional({ example: 50 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  otherAfricaRate?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  americasActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  asiaActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  domesticActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  eastAfricaActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  europeActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  middleEastActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  otherAfricaActive?: boolean;

  @ApiPropertyOptional({ enum: SupportedCurrency, default: SupportedCurrency.ETB })
  @IsOptional()
  @IsEnum(SupportedCurrency)
  currency?: SupportedCurrency;
}
