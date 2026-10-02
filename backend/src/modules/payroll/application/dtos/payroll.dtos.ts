import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreatePayrollRunDto {
  @ApiProperty({ description: 'Month (1 - 12)' })
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ description: 'Year (e.g. 2026)' })
  @IsInt()
  @Min(2020)
  year!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class SubmitPayrollRunDto {
  @ApiPropertyOptional({
    description:
      'Required when the run has flagged entries; acknowledges HR has reviewed them',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeFlags?: boolean;
}

export class UpdatePayrollEntryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  bonusTopUp?: number;

  @ApiPropertyOptional({
    description: 'Required when bonusTopUp is non-zero',
  })
  @ValidateIf(
    (dto: UpdatePayrollEntryDto) =>
      dto.bonusTopUp != null && dto.bonusTopUp !== 0,
  )
  @IsString()
  bonusTopUpReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
