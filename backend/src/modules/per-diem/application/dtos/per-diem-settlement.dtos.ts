import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

const TIME_OF_DAY = /^([01]\d|2[0-3]):[0-5]\d$/;

export class SubmitPerDiemSettlementDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  destination!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  actualDepartureDate!: string;

  @ApiProperty({ example: '08:00' })
  @IsString()
  @Matches(TIME_OF_DAY, { message: 'actualDepartureTime must be HH:mm' })
  actualDepartureTime!: string;

  @ApiProperty({ example: '2026-10-08' })
  @IsDateString()
  actualReturnDate!: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(TIME_OF_DAY, { message: 'actualReturnTime must be HH:mm' })
  actualReturnTime!: string;

  @ApiProperty({
    description:
      'Employee-entered actual days. Must be at least 1 and no more than the inclusive calendar span.',
  })
  @IsInt()
  @Min(1)
  actualDays!: number;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  advanceIds!: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  vehicleUsed?: boolean;

  @ApiPropertyOptional()
  @ValidateIf((dto: SubmitPerDiemSettlementDto) => dto.vehicleUsed === true)
  @IsInt()
  @Min(0)
  kmDeparture?: number;

  @ApiPropertyOptional()
  @ValidateIf((dto: SubmitPerDiemSettlementDto) => dto.vehicleUsed === true)
  @IsInt()
  @Min(0)
  kmReturn?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class ListPerDiemSettlementsDto {
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
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Comma-separated PerDiemStatus values',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class RecordCashReturnedDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  cashReturnedReceiptNo!: string;

  @ApiProperty({ example: '2026-10-01' })
  @IsDateString()
  cashReturnedDate!: string;
}
