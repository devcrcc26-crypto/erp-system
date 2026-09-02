import { ApiPropertyOptional, ApiProperty } from "@nestjs/swagger";
import {  IsArray, IsDate, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from "class-validator";
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
    @ApiPropertyOptional({ description: 'Target employee user id. Defaults to the current user. HR may assign another employee.' })
    @IsOptional()
    @IsUUID()
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
    @Type(() => Date)
    @IsDate()
    date?: Date;

    @ApiPropertyOptional({
        description:
            'Optional line items. Images must be added later via POST :id/items.',
    })
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateExitPermitItemDto)
    items?: CreateExitPermitItemDto[];
    
}

export class UpdateExitPermitDto{
    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    employeeId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    departmentId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsEnum(ExitPermitDirection)
    direction?: ExitPermitDirection;

    @ApiPropertyOptional()
    @IsOptional()
    @Type(() => Date)
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
    issue?: string;

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
    issue?: string;

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

    @ApiPropertyOptional()
    @IsOptional()
    @IsString()
    status?: ExitPermitStatus;

    @ApiPropertyOptional()
    @IsOptional()
    @IsUUID()
    employeeId?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dateFrom?: string;

    @ApiPropertyOptional()
    @IsOptional()
    @IsDateString()
    dateTo?: string;
}

export { ExitPermitStatus, ExitPermitDirection };