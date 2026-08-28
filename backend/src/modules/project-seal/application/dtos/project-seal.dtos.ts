import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SealStatus, SealUrgency } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";


export class SubmitProjectSealRequestDto {
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(1000)
    description!: string;

    @ApiPropertyOptional({ maxLength: 200, description: 'Document category (preset code or custom text)' })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    sealCategory?: string;

    @ApiPropertyOptional({ minimum: 1 })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    copyCount?: number;

    @ApiPropertyOptional({ maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    remarks?: string;
    
    @ApiProperty({ enum: SealUrgency })
    @IsEnum(SealUrgency)
    urgency!: SealUrgency;

    @ApiProperty()
    @IsDateString()
    dateNeeded!: string;
}

export class ListProjectSealsDto {
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
        description: 'Comma-separated SealStatus values',
    })
    @IsOptional()
    @IsString()
    status?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    employeeId?: string;
}

export { SealStatus, SealUrgency };