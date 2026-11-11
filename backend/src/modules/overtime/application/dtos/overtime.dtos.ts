import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OvertimeSheetStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { OnBehalfSubmissionDto } from '../../../on-behalf/on-behalf-submission.dto';

export class ListOvertimeSheetsDto {
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

  @ApiPropertyOptional({
    description: 'Status or comma-separated statuses',
  })
  @IsOptional()
  status?: OvertimeSheetStatus | OvertimeSheetStatus[] | string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 12 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}

export class UpsertOvertimeEntryDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '18:00', description: 'HH:mm (24h)' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @ApiProperty({
    example: '21:00',
    description:
      'HH:mm (24h). Use 24:00 or 00:00 (after a later start) for end of calendar day.',
  })
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d|24:00$/, {
    message: 'endTime must be HH:mm or 24:00',
  })
  endTime!: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Import-only holiday override. Ignored on interactive save - PublicHoliday is the source of truth.',
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isHoliday?: boolean;

  @ApiPropertyOptional({
    default: false,
    description:
      'Legacy overnight flag for existing entries only. New entries must be same-day (use 24:00 + a next-day entry).',
  })
  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;

  @ApiProperty({ description: 'Task / work description' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  taskDescription!: string;
}

export class PreviewOvertimeEntryDto {
  @ApiProperty({ description: 'Employee whose schedule to preview against' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-09-14' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '18:00', description: 'HH:mm (24h)' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @ApiProperty({
    example: '21:00',
    description:
      'HH:mm (24h). Use 24:00 or 00:00 (after a later start) for end of calendar day.',
  })
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d|24:00$/, {
    message: 'endTime must be HH:mm or 24:00',
  })
  endTime!: string;

  @ApiPropertyOptional({
    default: false,
    description: 'Legacy overnight flag (existing entries only)',
  })
  @IsOptional()
  @IsBoolean()
  isOvernight?: boolean;
}

export class SelectableOvertimeWindowsQueryDto {
  @ApiProperty({ description: 'Employee whose schedule to resolve' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-10-08' })
  @IsDateString()
  date!: string;

  @ApiPropertyOptional({
    description:
      'When set, existing entries on this sheet for the date are removed from selectable windows',
  })
  @IsOptional()
  @IsUUID()
  sheetId?: string;

  @ApiPropertyOptional({
    description:
      'Entry being edited — its own interval stays selectable',
  })
  @IsOptional()
  @IsUUID()
  excludeEntryId?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated entry ids being edited (same-day periods) — their intervals stay selectable',
  })
  @IsOptional()
  @IsString()
  excludeEntryIds?: string;
}

/**
 * Opens (or creates) an employee's sheet for a month - self or on behalf of an employee.
 */
export class OpenOvertimeSheetDto extends OnBehalfSubmissionDto {
  @ApiProperty({ minimum: 1, maximum: 12 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @ApiProperty({ minimum: 2000, maximum: 2100 })
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;
}
