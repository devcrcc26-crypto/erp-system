import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {  IsArray, IsDate, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";
import { Type } from "class-transformer";



enum ExitPermitStatus{
    DRAFT = 'DRAFT',
    SUBMITTED = 'SUBMITTED',
    IN_REVIEW = 'IN_REVIEW',
    APPROVED = 'APPROVED',
    REJECTED = 'REJECTED',
    RETURNED = 'RETURNED',
    CANCELLED = 'CANCELLED',
}

enum ExitPermitDirection{
    ENTRANCE = 'ENTRANCE',
    EXIT = 'EXIT',
}

export class CreateExitPermitDto{
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    employeeId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    departmentId?: string;

    @ApiProperty()
    @IsNotEmpty()
    @IsEnum(ExitPermitDirection)
    direction?: ExitPermitDirection;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDate()
    date?: Date;

    @ApiProperty()
    @IsNotEmpty()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateExitPermitItemDto)
    items?: CreateExitPermitItemDto[];
    
}

export class UpdateExitPermitDto{
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    employeeId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    departmentId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsEnum(ExitPermitDirection)
    direction?: ExitPermitDirection;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDate()
    date?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateExitPermitItemDto)
    items?: CreateExitPermitItemDto[];
}

export class CreateExitPermitItemDto{
    @ApiProperty()
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    itemName!: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    issue?: String;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(1)
    quantity?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    unit?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    documentId?: string;
}

export class UpdateExitPermitItemDto{
    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    issue?: String;

    @ApiPropertyOptional()
    @IsOptional()
    @IsNumber()
    @Min(1)
    quantity?: number;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    @MaxLength(100)
    unit?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    documentId?: string;
}

export class ListExitPermitsDto{
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
    @IsEnum(ExitPermitDirection)
    direction?: ExitPermitDirection;

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({
        description: 'Comma-separated ExitPermitStatus values',
    })
    @IsOptional()
    @IsString()
    status?: ExitPermitStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    employeeId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDate()
    dateFrom?: Date;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDate()
    dateTo?: Date;
}

export { ExitPermitStatus, ExitPermitDirection };