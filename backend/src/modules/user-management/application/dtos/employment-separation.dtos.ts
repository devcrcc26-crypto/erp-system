import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SeparationType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class SeparationPreviewDto {
  @ApiProperty({ example: '2026-08-20', description: 'Last working day' })
  @Matches(DATE_ONLY, { message: 'leavingDate must be YYYY-MM-DD' })
  leavingDate!: string;
}

export class SeparateEmployeeDto extends SeparationPreviewDto {
  @ApiProperty({ enum: SeparationType })
  @IsEnum(SeparationType)
  separationType!: SeparationType;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;

  @ApiPropertyOptional({
    description:
      'Required when the leaving date falls in a month whose payroll is already approved or paid',
  })
  @IsOptional()
  @IsBoolean()
  confirmLockedPayroll?: boolean;
}
