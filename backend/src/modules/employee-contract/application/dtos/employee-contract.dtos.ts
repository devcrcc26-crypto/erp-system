import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmployeeContractStatus,
  EmployeeContractType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

function toBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return value === 'true' || value === '1';
  }
  return Boolean(value);
}

/** Blank strings become null so open-ended updates can clear endDate. */
function emptyToNull({ value }: { value: unknown }): unknown {
  return value === '' ? null : value;
}

/** Blank multipart fields become undefined so optional validators skip them. */
function emptyToUndefined({ value }: { value: unknown }): unknown {
  return value === '' || value === null ? undefined : value;
}

function optionalBoolean({ value }: { value: unknown }): unknown {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return toBoolean(value);
}

export class CreateEmployeeContractDto {
  @ApiProperty({ description: 'Employee user ID' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ enum: EmployeeContractType })
  @IsEnum(EmployeeContractType)
  contractType!: EmployeeContractType;

  @ApiProperty({ example: '2026-08-17', description: 'Contract signing date' })
  @IsDateString()
  signedAt!: string;

  @ApiProperty({ example: '2026-08-17', description: 'Contract start date' })
  @IsDateString()
  startDate!: string;

  @ApiPropertyOptional({
    example: '2027-08-17',
    description: 'Required for fixed-term, probation, and renewal contracts',
  })
  @Transform(emptyToUndefined)
  @ValidateIf(
    (dto: CreateEmployeeContractDto) =>
      dto.contractType === EmployeeContractType.FIXED_TERM ||
      dto.contractType === EmployeeContractType.PROBATION ||
      dto.contractType === EmployeeContractType.RENEWAL,
  )
  @IsDateString()
  @IsNotEmpty()
  endDate?: string;

  @ApiPropertyOptional({ description: 'Contract notes', maxLength: 2000 })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 25000 })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  basicSalary?: number;

  @ApiPropertyOptional({ example: 3000 })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  transportationAllowance?: number;

  @ApiPropertyOptional({
    example: 2000,
    description: 'Fixed monthly bonus entered by HR (default 0)',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  monthlyBonus?: number;

  @ApiPropertyOptional({
    example: 2000,
    description:
      'Monthly net bonus added after tax (not taxed). Default 0. Not prorated.',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyNetBonus?: number;

  @ApiPropertyOptional({ default: true })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  pensionApplicable?: boolean;

  @ApiPropertyOptional({ default: true })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  taxApplicable?: boolean;

  @ApiPropertyOptional({ example: '2026-11-17' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsDateString()
  probationEndDate?: string;

  @ApiPropertyOptional({ example: 'Ethiopian Labor Proclamation 1156/2019' })
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  governedBy?: string;
}

export class UpdateEmployeeContractDto {
  @ApiPropertyOptional({ enum: EmployeeContractType })
  @IsOptional()
  @IsEnum(EmployeeContractType)
  contractType?: EmployeeContractType;

  @ApiPropertyOptional({ example: '2026-08-17', description: 'Contract signing date' })
  @IsOptional()
  @IsDateString()
  signedAt?: string;

  @ApiPropertyOptional({ example: '2026-08-17', description: 'Contract start date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2027-08-17',
    description: 'Contract end date (null clears for open-ended)',
    nullable: true,
  })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  endDate?: string | null;

  @ApiPropertyOptional({ description: 'Contract notes', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ example: 25000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  basicSalary?: number;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  transportationAllowance?: number;

  @ApiPropertyOptional({ example: 2000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  monthlyBonus?: number;

  @ApiPropertyOptional({
    example: 2000,
    description: 'Monthly net bonus added after tax (not taxed)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyNetBonus?: number;

  @ApiPropertyOptional({ default: true })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  pensionApplicable?: boolean;

  @ApiPropertyOptional({ default: true })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  taxApplicable?: boolean;

  @ApiPropertyOptional({
    example: '2026-11-17',
    nullable: true,
    description: 'Probation end date (null clears)',
  })
  @Transform(emptyToNull)
  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsDateString()
  probationEndDate?: string | null;

  @ApiPropertyOptional({ example: 'Ethiopian Labor Proclamation 1156/2019' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  governedBy?: string;
}

/** Gross-only preview for a normal month (no OT, no absences). */
export class SalaryPreviewDto {
  @ApiProperty({ example: 13000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  basicSalary!: number;

  @ApiPropertyOptional({ example: 900, default: 0 })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  transportationAllowance?: number;

  @ApiPropertyOptional({ example: 2000, default: 0 })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  monthlyBonus?: number;

  @ApiPropertyOptional({
    example: 2000,
    default: 0,
    description: 'Monthly net bonus (after tax)',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  monthlyNetBonus?: number;

  @ApiPropertyOptional({ default: true })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  pensionApplicable?: boolean;

  @ApiPropertyOptional({ default: true })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  taxApplicable?: boolean;

  @ApiPropertyOptional({
    example: 2200,
    description: 'Taxable transport threshold (default 2200)',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  taxableThreshold?: number;
}

/** Solve bonus for an agreed take-home - calculator only, never stored. */
export class BonusFromNetDto {
  @ApiProperty({ example: 13000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  basicSalary!: number;

  @ApiPropertyOptional({ example: 900, default: 0 })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  transportationAllowance?: number;

  @ApiProperty({ example: 20000, description: 'Target take-home net pay' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  targetNet!: number;

  @ApiPropertyOptional({ default: true })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  pensionApplicable?: boolean;

  @ApiPropertyOptional({ default: true })
  @Transform(optionalBoolean)
  @IsOptional()
  @IsBoolean()
  taxApplicable?: boolean;

  @ApiPropertyOptional({
    example: 2200,
    description: 'Taxable transport threshold (default 2200)',
  })
  @Transform(emptyToUndefined)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  taxableThreshold?: number;
}

/** Annual leave effect of a new (renewal) contract - read-only preview. */
export class RenewalPreviewQueryDto {
  @ApiProperty({ description: 'Employee the new contract is for' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-11-01', description: 'New contract start date' })
  @IsDateString()
  startDate!: string;
}

export class TerminateEmployeeContractDto {
  @ApiPropertyOptional({
    example: '2026-08-17',
    description: 'Termination date (defaults to today when omitted)',
  })
  @IsOptional()
  @IsDateString()
  terminatedAt?: string;

  @ApiProperty({ description: 'Reason for contract termination', maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  terminationReason!: string;
}

export class ListEmployeeContractsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Status or comma-separated EmployeeContractStatus values',
  })
  @IsOptional()
  status?: EmployeeContractStatus | EmployeeContractStatus[] | string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ enum: EmployeeContractType })
  @IsOptional()
  @IsEnum(EmployeeContractType)
  contractType?: EmployeeContractType;

  @ApiPropertyOptional({
    description: 'When true, return active contracts nearing end date',
  })
  @IsOptional()
  @Transform(({ value }) =>
    value === undefined || value === null || value === ''
      ? undefined
      : toBoolean(value),
  )
  @IsBoolean()
  expiringSoon?: boolean;
}

export { EmployeeContractStatus, EmployeeContractType };
