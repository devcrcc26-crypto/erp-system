import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
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
import {
  OvertimeCompensation,
  OvertimeStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';

export class SubmitOvertimeRequestDto {
  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '18:00', description: 'HH:mm (24h)' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '21:00', description: 'HH:mm (24h)' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'endTime must be HH:mm' })
  endTime!: string;

  @ApiProperty({
    example: 3,
    description: 'Hours (supports half hours); should match start/end',
  })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0.5)
  @Max(24)
  hours!: number;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  reason!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ enum: OvertimeCompensation })
  @IsOptional()
  @IsEnum(OvertimeCompensation)
  compensationType?: OvertimeCompensation;
}

export class ListOvertimeRequestsDto {
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
  status?: OvertimeStatus | OvertimeStatus[] | string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  search?: string;
}
