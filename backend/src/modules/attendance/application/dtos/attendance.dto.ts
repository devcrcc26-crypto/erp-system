import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class ManualAssignmentDto {
  @ApiProperty({ description: 'Zero-based index into the review or rejected array' })
  @IsInt()
  @Min(0)
  rowIndex!: number;

  @ApiProperty({
    description: 'Which preview bucket this row is in',
    enum: ['review', 'rejected'],
  })
  @IsIn(['review', 'rejected'])
  bucket!: 'review' | 'rejected';

  @ApiProperty({ description: 'ERP user id to assign this attendance row to' })
  @IsUUID()
  employeeId!: string;
}

export class ConfirmAttendanceImportDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  previewToken!: string;

  @ApiProperty({ default: false })
  @IsBoolean()
  overwrite!: boolean;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  confirmedReviewIndices?: number[];

  @ApiPropertyOptional({
    type: [ManualAssignmentDto],
    description:
      'Optional HR overrides that assign review or rejected rows to ERP employees',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualAssignmentDto)
  manualAssignments?: ManualAssignmentDto[];
}

export class ListAttendanceDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
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
  @Min(2020)
  year?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;
}
