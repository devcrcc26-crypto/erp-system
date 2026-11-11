import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
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

export class CreatePayrollCorrectionDto {
  @ApiPropertyOptional({
    description: 'Optional reason for the correction (stored on the correction run notes)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class AddPayrollFreelancersDto {
  @ApiProperty({ type: [String], description: 'Freelancer user ids to add to this run' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  employeeIds!: string[];
}

export class SubmitPayrollRunDto {
  @ApiPropertyOptional({
    description:
      'Required when the run has flagged entries; acknowledges HR has reviewed them',
  })
  @IsOptional()
  @IsBoolean()
  acknowledgeFlags?: boolean;

  @ApiPropertyOptional({
    description:
      'Required when entries carry employment flags (contract ended, login disabled, leaver, inactive): the number of those employees reviewed',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  confirmEmploymentReview?: number;
}

export class ApprovePayrollRunDto {
  @ApiPropertyOptional({
    description:
      'Required when entries carry employment flags (contract ended, login disabled, leaver, inactive): the number of those employees reviewed',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  confirmEmploymentReview?: number;
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

  @ApiPropertyOptional({
    description: 'One-time net bonus (after tax). Must be >= 0.',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  netTopUp?: number;

  @ApiPropertyOptional({
    description: 'Required when netTopUp is non-zero',
  })
  @ValidateIf(
    (dto: UpdatePayrollEntryDto) =>
      dto.netTopUp != null && dto.netTopUp !== 0,
  )
  @IsString()
  netTopUpReason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdatePayrollEntryDaysDto {
  @ApiProperty({
    description:
      'Paid days on the 30-day payroll month. Half days are allowed. 0 means no pay for the month.',
    minimum: 0,
    maximum: 30,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  payrollDays!: number;

  @ApiPropertyOptional({ description: 'Why HR changed the paid days' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** HR-editable payroll letterhead / tax-form company settings. */
export class UpdatePayrollCompanySettingsDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  orgNameTax?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxAccountNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  region?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  zone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  woreda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  kebele?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  houseNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fax?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taxCollectorOffice?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  salaryBankName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankBranch?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  companyAccountNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bankLetterRefPrefix?: string;
}
