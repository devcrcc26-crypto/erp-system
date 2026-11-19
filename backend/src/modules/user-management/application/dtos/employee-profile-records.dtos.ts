import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';
import {
  IsNotBeforeProperty,
  IsOptionalText,
} from '../../../../shared/validators/date-rules.decorator';
import { trimString } from './user-field.rules';

const NAME_MAX = 200;

export class EducationRecordInputDto {
  @ApiPropertyOptional({ description: 'Existing row id when updating from the employee form' })
  @IsOptional()
  @IsEntityUuid()
  id?: string;

  @ApiProperty({ maxLength: NAME_MAX })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX)
  instituteName!: string;

  @ApiPropertyOptional({ example: 2018 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1950)
  @Max(2100)
  graduationYear?: number | null;

  @ApiPropertyOptional({ maxLength: NAME_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(NAME_MAX)
  subjectMajor?: string | null;

  @ApiPropertyOptional({
    description: 'Diploma, BSc, BA, MSc, MA, PhD, or another certificate name',
    maxLength: 40,
  })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(40)
  certificateType?: string | null;
}

export class PriorEmploymentInputDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  id?: string;

  @ApiProperty({ maxLength: NAME_MAX })
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(NAME_MAX)
  employerName!: string;

  @ApiPropertyOptional({ example: '2016-01-01' })
  @IsOptional()
  @IsOptionalText()
  @IsDateString()
  dateFrom?: string | null;

  @ApiPropertyOptional({ example: '2020-12-31' })
  @IsOptional()
  @IsOptionalText()
  @IsDateString()
  @IsNotBeforeProperty('dateFrom')
  dateTo?: string | null;

  @ApiPropertyOptional({ maxLength: NAME_MAX })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(NAME_MAX)
  lastPosition?: string | null;
}

export class CreatePositionHistoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsEntityUuid()
  positionId?: string | null;

  @ApiPropertyOptional({
    description:
      'When set, payroll uses this basic salary for dates this row covers. Omit to keep the contract salary.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === undefined || value === '' ? null : Number(value),
  )
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryOverride?: number | null;

  @ApiProperty({ example: '2026-11-01' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional({ example: 'Promoted', maxLength: 500 })
  @IsOptional()
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}

export class UpdatePositionHistoryDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, value) => value != null && value !== '')
  @IsEntityUuid()
  positionId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @Transform(({ value }) =>
    value === null || value === undefined || value === '' ? null : Number(value),
  )
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  salaryOverride?: number | null;

  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiPropertyOptional({ nullable: true, maxLength: 500 })
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsOptionalText()
  @Transform(trimString)
  @IsString()
  @MaxLength(500)
  note?: string | null;
}
