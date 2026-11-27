import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsUUID,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  NotEquals,
  ValidateIf,
  ValidateNested,
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

  @ApiPropertyOptional({
    description:
      'Deduct for absences from attendance (default: the company setting). False = pay employed days; only approved leave applies.',
  })
  @IsOptional()
  @IsBoolean()
  considerAttendance?: boolean;
}

/** Run settings HR can change on a DRAFT / REVIEWED run (the run is recalculated). */
export class UpdatePayrollRunDto {
  @ApiPropertyOptional({
    description: 'Deduct for absences from attendance. False = only approved leave applies.',
  })
  @IsOptional()
  @IsBoolean()
  considerAttendance?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
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
      'Paid days on the 30-day payroll month. Half days are allowed. 0 means no pay for the month. When periodId is set, this is the paid days for that salary period only; the entry total becomes the sum of all periods.',
    minimum: 0,
    maximum: 30,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(30)
  payrollDays!: number;

  @ApiPropertyOptional({
    description:
      'Salary period to override when the entry has multiple contract periods in the month. Omit to scale all periods from the entry total (single-period / whole-entry override).',
  })
  @IsOptional()
  @IsUUID()
  periodId?: string;

  @ApiPropertyOptional({ description: 'Why HR changed the paid days' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** HR-editable payroll letterhead / tax-form company settings. */
export class UpdatePayrollCompanySettingsDto {
  @ApiPropertyOptional({
    description: 'Consider attendance by default for new payroll runs',
  })
  @IsOptional()
  @IsBoolean()
  considerAttendanceDefault?: boolean;

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

/** Manual (paper-based) OT hours for one employee and OT category on a payroll run. */
export class UpsertPayrollOtAdjustmentDto {
  @ApiProperty({ description: 'Employee (user id) with an entry on this run' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({
    description: 'Salary-period contract these hours are priced on',
  })
  @IsUUID()
  contractId!: string;

  @ApiProperty({
    description: 'OT category (same buckets as the payroll entry)',
    enum: ['NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY'],
  })
  @IsIn(['NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY'])
  otCategory!: 'NORMAL' | 'EVENING' | 'SUNDAY' | 'HOLIDAY';

  @ApiProperty({
    description: 'Hours to add (positive) or subtract (negative). Not zero.',
    minimum: -744,
    maximum: 744,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-744)
  @Max(744)
  @NotEquals(0)
  hours!: number;

  @ApiPropertyOptional({
    description: 'Source of the hours, e.g. "Paper records - Nov 2026". Required when hours is not zero.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

/** One non-zero category row inside a bulk replace. */
export class ReplacePayrollOtAdjustmentItemDto {
  @ApiProperty({
    description: 'OT category (same buckets as the payroll entry)',
    enum: ['NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY'],
  })
  @IsIn(['NORMAL', 'EVENING', 'SUNDAY', 'HOLIDAY'])
  otCategory!: 'NORMAL' | 'EVENING' | 'SUNDAY' | 'HOLIDAY';

  @ApiProperty({
    description: 'Hours to add (positive) or subtract (negative). Not zero.',
    minimum: -744,
    maximum: 744,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(-744)
  @Max(744)
  @NotEquals(0)
  hours!: number;
}

/**
 * Replaces manual OT for one salary-period contract on an employee (one reprice).
 * Other contracts' adjustments are left untouched. Empty `items` clears that contract.
 */
export class ReplacePayrollOtAdjustmentsDto {
  @ApiProperty({ description: 'Employee (user id) with an entry on this run' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({
    description: 'Salary-period contract these hours are priced on',
  })
  @IsUUID()
  contractId!: string;

  @ApiProperty({
    description:
      'Non-zero category hours to keep for this contract. Empty array clears this contract’s manual OT.',
    type: [ReplacePayrollOtAdjustmentItemDto],
  })
  @IsArray()
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => ReplacePayrollOtAdjustmentItemDto)
  items!: ReplacePayrollOtAdjustmentItemDto[];

  @ApiPropertyOptional({
    description:
      'Source of the hours, e.g. "Paper records - Nov 2026". Required when items is not empty.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ReopenPayrollRunDto {
  @ApiProperty({ description: 'Why the approved run is reopened (stored on the superseded version)' })
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class CreatePayrollAdjustmentLineDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty()
  @IsUUID()
  adjustmentTypeId!: string;

  @ApiProperty({ description: 'Positive amount in ETB; the type decides add or deduct' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  note!: string;

  @ApiPropertyOptional({ description: 'Open reconciliation item this line settles' })
  @IsOptional()
  @IsUUID()
  reconciliationId?: string;

  @ApiPropertyOptional({
    description: 'Required when deductions would exceed one third of the monthly wage',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  capOverrideReason?: string;
}

export class CreatePayrollCorrectionLineDto {
  @ApiProperty()
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ description: 'Missed bonus, Severance pay, Salary arrears or Other' })
  @IsUUID()
  adjustmentTypeId!: string;

  @ApiProperty({
    enum: ['OWED_TO_EMPLOYEE', 'OWED_TO_COMPANY'],
    description: 'Owed to the employee (earning) or owed to the company (deduction)',
  })
  @IsIn(['OWED_TO_EMPLOYEE', 'OWED_TO_COMPANY'])
  direction!: 'OWED_TO_EMPLOYEE' | 'OWED_TO_COMPANY';

  @ApiProperty({
    enum: ['TAXABLE', 'NET'],
    description:
      'Taxable changes gross, taxable income, tax and pension; Net changes net pay only',
  })
  @IsIn(['TAXABLE', 'NET'])
  treatment!: 'TAXABLE' | 'NET';

  @ApiProperty({ description: 'Positive amount in ETB' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ description: 'Why the line is needed (required)' })
  @IsString()
  @MaxLength(500)
  note!: string;
}

export class RecordPayrollReceiptDto {
  @ApiProperty({ description: 'Amount received in ETB' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @ApiProperty({ description: 'Date received (YYYY-MM-DD)', example: '2026-11-27' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'receivedOn must be a date (YYYY-MM-DD)' })
  receivedOn!: string;

  @ApiProperty({ description: 'Receipt / transfer reference' })
  @IsString()
  @MaxLength(120)
  reference!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class CreatePayrollAdjustmentTypeDto {
  @ApiProperty({ description: 'Unique code, e.g. MEAL_ALLOWANCE' })
  @IsString()
  @MaxLength(40)
  code!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(120)
  nameEn!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameZh?: string;

  @ApiProperty({ enum: ['EARNING', 'DEDUCTION'] })
  @IsIn(['EARNING', 'DEDUCTION'])
  kind!: 'EARNING' | 'DEDUCTION';

  @ApiProperty()
  @IsBoolean()
  taxable!: boolean;

  @ApiProperty()
  @IsBoolean()
  pensionable!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdatePayrollAdjustmentTypeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameEn?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  nameZh?: string;

  @ApiPropertyOptional({ enum: ['EARNING', 'DEDUCTION'] })
  @IsOptional()
  @IsIn(['EARNING', 'DEDUCTION'])
  kind?: 'EARNING' | 'DEDUCTION';

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pensionable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class WaivePayrollReconciliationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(500)
  reason!: string;
}
