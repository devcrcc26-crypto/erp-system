import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeContractType, InactiveType, SeparationType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export class SeparationPreviewDto {
  @ApiProperty({ example: '2026-08-20', description: 'Last working day' })
  @Matches(DATE_ONLY, { message: 'leavingDate must be YYYY-MM-DD' })
  leavingDate!: string;
}

export class HandoverDecisionDto {
  @ApiProperty()
  @IsString()
  id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  replacementId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  skipReason?: string | null;
}

export class LeadershipDecisionDto extends HandoverDecisionDto {
  @ApiProperty({ enum: ['DEPARTMENT_LEADER', 'DISCIPLINE_LEADER', 'ROLE'] })
  @IsIn(['DEPARTMENT_LEADER', 'DISCIPLINE_LEADER', 'ROLE'])
  kind!: 'DEPARTMENT_LEADER' | 'DISCIPLINE_LEADER' | 'ROLE';
}

export class SubmittedRequestDecisionDto {
  @ApiProperty()
  @IsUUID()
  requestId!: string;

  @ApiProperty({ enum: ['CANCEL', 'KEEP'] })
  @IsIn(['CANCEL', 'KEEP'])
  action!: 'CANCEL' | 'KEEP';
}

export class HandoverDto {
  @ApiPropertyOptional({ type: [HandoverDecisionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HandoverDecisionDto)
  tiers?: HandoverDecisionDto[];

  @ApiPropertyOptional({ type: [LeadershipDecisionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LeadershipDecisionDto)
  leadership?: LeadershipDecisionDto[];

  @ApiPropertyOptional({ type: [SubmittedRequestDecisionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SubmittedRequestDecisionDto)
  submittedRequests?: SubmittedRequestDecisionDto[];
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

  @ApiPropertyOptional({ type: () => HandoverDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => HandoverDto)
  handover?: HandoverDto;
}

/** Change the leaving date on an existing separation (HR). */
export class UpdateLeavingDateDto extends SeparationPreviewDto {
  @ApiPropertyOptional({
    description:
      'Required when the new leaving date falls in a month whose payroll is already approved or paid',
  })
  @IsOptional()
  @IsBoolean()
  confirmLockedPayroll?: boolean;
}

export class SetInactiveDto {
  @ApiProperty({ enum: InactiveType })
  @IsEnum(InactiveType)
  type!: InactiveType;

  @ApiProperty({ example: '2026-11-01' })
  @Matches(DATE_ONLY, { message: 'fromDate must be YYYY-MM-DD' })
  fromDate!: string;

  @ApiPropertyOptional({ example: '2026-11-10', description: 'Last inactive day; omit for open-ended' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'toDate must be YYYY-MM-DD' })
  toDate?: string;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}

export class ReactivateDto {
  @ApiPropertyOptional({
    example: '2026-11-10',
    description: 'Last inactive day (default: yesterday, so the person is active from today)',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'lastInactiveDate must be YYYY-MM-DD' })
  lastInactiveDate?: string;
}

export class RehireDto {
  @ApiProperty({ example: '2027-01-02', description: 'New employment start (also the new contract start)' })
  @Matches(DATE_ONLY, { message: 'startDate must be YYYY-MM-DD' })
  startDate!: string;

  @ApiProperty({ enum: EmployeeContractType })
  @IsEnum(EmployeeContractType)
  contractType!: EmployeeContractType;

  @ApiProperty({ example: '2027-01-01' })
  @Matches(DATE_ONLY, { message: 'signedAt must be YYYY-MM-DD' })
  signedAt!: string;

  @ApiPropertyOptional({ example: '2027-12-31' })
  @IsOptional()
  @Matches(DATE_ONLY, { message: 'endDate must be YYYY-MM-DD' })
  endDate?: string;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  basicSalary!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  transportationAllowance?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthlyBonus?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pensionApplicable?: boolean;

  @ApiProperty({ maxLength: 2000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason!: string;
}
