import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, Min, Max, IsOptional, IsString, IsNumber,  } from "class-validator";

export class CreatePayrollRunDto {
    @ApiProperty({
        description: 'Month (1 - 12)'
    })
    @IsInt()
    @Min(1)
    @Max(12)
    month!: number;

    @ApiProperty({
        description: 'Year (e.g. 2026)'
    })
    @IsInt()
    @Min(2020)
    year!: number;

    @ApiProperty()
    @IsOptional()
    @IsString()
    notes?: string;
}

export class UpdatePayrollEntryDto{
    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(0)
    bonusTopUp?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    bonusTopUpReason?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    notes?: string;
}