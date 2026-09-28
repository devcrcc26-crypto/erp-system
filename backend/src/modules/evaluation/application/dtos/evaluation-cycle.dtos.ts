import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EvaluationCycleStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateEvaluationCycleDto {
  @ApiProperty({ description: 'Quarter: 1 | 2 | 3 | 4' })
  @IsNumber()
  @Min(1)
  @Max(4)
  quarter!: number;

  @ApiProperty()
  @IsNumber()
  year!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  evalStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  evalEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateEvaluationCycleDto {
  @ApiPropertyOptional({ enum: EvaluationCycleStatus })
  @IsOptional()
  @IsEnum(EvaluationCycleStatus)
  status?: EvaluationCycleStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  evalStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  evalEnd?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
