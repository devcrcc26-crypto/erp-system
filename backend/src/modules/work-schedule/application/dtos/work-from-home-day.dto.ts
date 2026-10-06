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
} from 'class-validator';

export class CreateWorkFromHomeDayDto {
  @ApiProperty({ example: '2026-08-12' })
  @IsDateString()
  date!: string;

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
  @ApiProperty({ example: '2026-08-12' })
  @IsDateString()
  date!: string;

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
}

export class ListWorkFromHomeDaysDto {
  @ApiPropertyOptional()
  @IsOptional()
  month?: number;

  @ApiPropertyOptional()
  @IsOptional()
  year?: number;
}
