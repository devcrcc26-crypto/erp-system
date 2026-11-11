import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

export class AuditLogQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recordType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  recordId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
