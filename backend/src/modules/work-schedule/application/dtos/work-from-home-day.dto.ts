import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { WorkFromHomeScope } from '@prisma/client';
import {
  ArrayUnique,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class CreateWorkFromHomeDayDto {
  @ApiPropertyOptional({
    example: '2026-08-12',
    description: 'Single day (or use startDate/endDate for a range)',
  })
  @ValidateIf(
    (o: CreateWorkFromHomeDayDto) =>
      o.startDate === undefined && o.endDate === undefined,
  )
  @IsDateString()
  date?: string;

  @ApiPropertyOptional({
    example: '2026-08-11',
    description: 'First day of an assign range (inclusive)',
  })
  @ValidateIf((o: CreateWorkFromHomeDayDto) => o.date === undefined)
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: '2026-08-15',
    description: 'Last day of an assign range (inclusive)',
  })
  @ValidateIf((o: CreateWorkFromHomeDayDto) => o.date === undefined)
  @IsDateString()
  endDate?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({ enum: WorkFromHomeScope, default: WorkFromHomeScope.ALL })
  @IsOptional()
  @IsEnum(WorkFromHomeScope)
  scope?: WorkFromHomeScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  departmentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  employeeIds?: string[];
}

export class UpdateWorkFromHomeDayDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason?: string;

  @ApiPropertyOptional({ enum: WorkFromHomeScope })
  @IsOptional()
  @IsEnum(WorkFromHomeScope)
  scope?: WorkFromHomeScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  departmentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayUnique()
  employeeIds?: string[];
}

export class RequestWorkFromHomeDayDto {
  @ApiPropertyOptional({
    example: '2026-08-11',
    description: 'First day of the range (or use legacy `date` for one day)',
  })
  @ValidateIf((o: RequestWorkFromHomeDayDto) => o.date === undefined)
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2026-08-15', description: 'Last day (inclusive)' })
  @ValidateIf((o: RequestWorkFromHomeDayDto) => o.date === undefined)
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: '2026-08-12', description: 'Legacy single day' })
  @IsOptional()
  @IsDateString()
  date?: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Submit on behalf of another employee (HR / Discipline Lead)',
  })
  @IsOptional()
  @IsUUID('4')
  onBehalfOfEmployeeId?: string;

  @IsOptional()
  createdFromAttendanceImport?: boolean;

  @ApiPropertyOptional({
    description:
      'Required when HR enters a date before the current calendar month',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  lateReason?: string;
}

/** Employee edit of their own RETURNED work-from-home request. */
export class UpdateWorkFromHomeRequestDto {
  @ApiProperty({ example: '2026-08-11' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-08-15', description: 'Last day (inclusive)' })
  @IsDateString()
  endDate!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  @ApiPropertyOptional({
    description: 'Required when a date falls before the current calendar month',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  lateReason?: string;
}

export class ListWorkFromHomeDaysDto {
  @ApiPropertyOptional()
  @IsOptional()
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  year?: number;
}

/** Preview which days of a range become work-from-home days. */
export class PreviewWorkFromHomeRangeDto {
  @ApiProperty({ example: '2026-08-11' })
  @IsDateString()
  startDate!: string;

  @ApiProperty({ example: '2026-08-15' })
  @IsDateString()
  endDate!: string;

  @ApiPropertyOptional({ description: 'On-behalf target employee' })
  @IsOptional()
  @IsUUID('4')
  onBehalfOfEmployeeId?: string;

  @ApiPropertyOptional({
    description:
      'Your own open request being edited - its days are not counted as already requested',
  })
  @IsOptional()
  @IsUUID()
  editingRequestId?: string;
}

/** Cancel a pending (requester / HR) or approved (HR) work-from-home request. */
export class CancelWorkFromHomeRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
