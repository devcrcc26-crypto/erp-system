import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LeaveType } from '@prisma/client';

export class LeavePolicyRuleDto {
  @ApiProperty({ enum: LeaveType })
  @IsEnum(LeaveType)
  leaveType!: LeaveType;

  @ApiProperty({ example: 16 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  baseDays!: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isProgressive?: boolean;

  @ApiPropertyOptional({ example: 1 })
  @ValidateIf((o: LeavePolicyRuleDto) => Boolean(o.isProgressive))
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  incrementDays?: number;

  @ApiPropertyOptional({ example: 2 })
  @ValidateIf((o: LeavePolicyRuleDto) => Boolean(o.isProgressive))
  @Type(() => Number)
  @IsInt()
  @Min(1)
  incrementEveryYears?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumServiceMonths?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  maxDaysCap?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 1 })
  @Min(0)
  maxCarryForwardDays?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  requiresReceipt?: boolean;
}

export class CreateLeavePolicyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional({
    example: 'Ethiopian Labor Proclamation 1156/2019',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  governedBy?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ type: [LeavePolicyRuleDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LeavePolicyRuleDto)
  rules!: LeavePolicyRuleDto[];
}

export class UpdateLeavePolicyDto {
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
  @IsString()
  @MaxLength(500)
  governedBy?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ type: [LeavePolicyRuleDto] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LeavePolicyRuleDto)
  rules?: LeavePolicyRuleDto[];
}

export class RefreshLeaveBalancesDto {
  @ApiPropertyOptional({
    description: 'Calendar year to refresh (defaults to current year)',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  year?: number;
}

export class LeavePolicyIdParamDto {
  @ApiProperty()
  @IsUUID()
  id!: string;
}
