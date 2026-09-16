import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional } from 'class-validator';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

export class HrReportQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Start of the reporting period. Defaults to 1 January this year.',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'End of the reporting period (inclusive). Defaults to today.',
  })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Limit the report to one department.' })
  @IsOptional()
  @IsEntityUuid()
  departmentId?: string;
}
