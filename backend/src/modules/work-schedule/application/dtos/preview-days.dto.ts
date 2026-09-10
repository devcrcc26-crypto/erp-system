import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PreviewPeriodDto {
  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-09-05' })
  @IsDateString()
  endDate!: string;
}

export class PreviewDaysDto {
  @ApiPropertyOptional({
    description:
      'Employee to preview against. Defaults to the authenticated user.',
  })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ type: [PreviewPeriodDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PreviewPeriodDto)
  periods!: PreviewPeriodDto[];
}
