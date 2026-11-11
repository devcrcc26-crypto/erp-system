import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkScheduleCheckMode } from '@prisma/client';

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class WorkScheduleDayDto {
  @ApiProperty({
    example: 1,
    description: '0=Sunday, 1=Monday ... 6=Saturday',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek!: number;

  @ApiProperty()
  @IsBoolean()
  isWorkingDay!: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isHalfDay?: boolean;

  @ApiPropertyOptional({ example: '08:30' })
  @ValidateIf((o: WorkScheduleDayDto) => o.isWorkingDay)
  @IsString()
  @Matches(HH_MM, { message: 'morningStart must be HH:mm' })
  morningStart?: string | null;

  @ApiPropertyOptional({ example: '12:30' })
  @ValidateIf((o: WorkScheduleDayDto) => o.isWorkingDay)
  @IsString()
  @Matches(HH_MM, { message: 'morningEnd must be HH:mm' })
  morningEnd?: string | null;

  @ApiPropertyOptional({ example: '13:30' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: 'afternoonStart must be HH:mm' })
  afternoonStart?: string | null;

  @ApiPropertyOptional({ example: '17:30' })
  @IsOptional()
  @IsString()
  @Matches(HH_MM, { message: 'afternoonEnd must be HH:mm' })
  afternoonEnd?: string | null;
}

export class CreateWorkScheduleDto {
  @ApiProperty({ example: 'CRCC Standard' })
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: WorkScheduleCheckMode,
    default: WorkScheduleCheckMode.STANDARD,
    description:
      'SCAN_ONLY: any scan that day is present; no late / early-departure / missing-punch rules',
  })
  @IsOptional()
  @IsEnum(WorkScheduleCheckMode)
  checkMode?: WorkScheduleCheckMode;

  @ApiPropertyOptional({
    example: '08:30',
    description:
      'Required when checkMode is SCAN_ONLY. An earliest scan after this is flagged for HR review.',
  })
  @ValidateIf(
    (o: { checkMode?: WorkScheduleCheckMode; latestScanTime?: string | null }) =>
      o.checkMode === WorkScheduleCheckMode.SCAN_ONLY ||
      (o.latestScanTime !== undefined && o.latestScanTime !== null),
  )
  @IsString()
  @Matches(HH_MM, { message: 'latestScanTime must be HH:mm' })
  latestScanTime?: string | null;

  @ApiProperty({ type: [WorkScheduleDayDto] })
  @IsArray()
  @ArrayMinSize(7)
  @ValidateNested({ each: true })
  @Type(() => WorkScheduleDayDto)
  days!: WorkScheduleDayDto[];
}

export class UpdateWorkScheduleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    enum: WorkScheduleCheckMode,
    default: WorkScheduleCheckMode.STANDARD,
    description:
      'SCAN_ONLY: any scan that day is present; no late / early-departure / missing-punch rules',
  })
  @IsOptional()
  @IsEnum(WorkScheduleCheckMode)
  checkMode?: WorkScheduleCheckMode;

  @ApiPropertyOptional({
    example: '08:30',
    description:
      'Required when checkMode is SCAN_ONLY. An earliest scan after this is flagged for HR review.',
  })
  @ValidateIf(
    (o: { checkMode?: WorkScheduleCheckMode; latestScanTime?: string | null }) =>
      o.checkMode === WorkScheduleCheckMode.SCAN_ONLY ||
      (o.latestScanTime !== undefined && o.latestScanTime !== null),
  )
  @IsString()
  @Matches(HH_MM, { message: 'latestScanTime must be HH:mm' })
  latestScanTime?: string | null;

  @ApiPropertyOptional({ type: [WorkScheduleDayDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(7)
  @ValidateNested({ each: true })
  @Type(() => WorkScheduleDayDto)
  days?: WorkScheduleDayDto[];

  @ApiPropertyOptional({
    description:
      'Recalculate imported attendance for employees on this schedule when days, checkMode or latestScanTime change. Defaults to true; pass false to skip.',
  })
  @IsOptional()
  @IsBoolean()
  recalculateAttendance?: boolean;

  @ApiPropertyOptional({
    example: '2026-09-01',
    description:
      "Start date for attendance recalculation. Defaults to each employee's assignment start on this schedule.",
  })
  @IsOptional()
  @IsDateString()
  recalculateFrom?: string;
}

export class AssignScheduleDto {
  @ApiProperty()
  @IsString()
  employeeId!: string;

  @ApiProperty({ example: '2026-09-01' })
  @IsDateString()
  effectiveFrom!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    description:
      'Recalculate attendance daily logs and month summaries from effectiveFrom onward. Defaults to true; pass false to skip. Approved / payroll-locked months are flagged stale instead.',
  })
  @IsOptional()
  @IsBoolean()
  recalculateAttendance?: boolean;
}
