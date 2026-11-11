import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SealStatus, SealUrgency } from "@prisma/client";
import { Type } from "class-transformer";
import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from "class-validator";


import { OnBehalfSubmissionDto } from '../../../on-behalf/on-behalf-submission.dto';
export class SubmitProjectSealRequestDto extends OnBehalfSubmissionDto {
    @ApiProperty({ maxLength: 255, description: 'Document or file name for the seal request' })
    @IsString()
    @IsNotEmpty()
    @MaxLength(255)
    fileName!: string;

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