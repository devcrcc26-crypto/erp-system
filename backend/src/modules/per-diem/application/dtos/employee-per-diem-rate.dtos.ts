import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
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
  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  domesticRate?: number;

  @ApiPropertyOptional({ example: 80 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  regionalRate?: number;

  @ApiPropertyOptional({ example: 150 })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  internationalRate?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  domesticActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  regionalActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  internationalActive?: boolean;
}
