import { IsNotEmpty, IsString, Max, MaxLength, IsInt, Min, IsOptional, IsUUID, IsEnum } from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { AssetStatus } from "@prisma/client";

export class CreateCompanyAssetDto{
    @ApiProperty({maxLength: 50, description: 'Serial Number'})
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    serialNumber!: string;

    @ApiProperty({maxLength: 100, description: 'Brand'})
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    brand!: string;

    @ApiProperty({maxLength: 100, description: 'Model'})
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    model!: string;

    @ApiProperty({description: 'Year', example: 2026})
    @Type(() => Number)
    @IsInt()
    @Min(1900)
    @Max(new Date().getFullYear() + 1)
    year!: number;

    @ApiProperty({maxLength: 50, description: 'Color'})
    @IsString()
    @IsNotEmpty()
    @MaxLength(50)
    color!: string;

    @ApiProperty({maxLength: 100, example: 'Laptop', description:'Asset category'})
    @IsString()
    @IsNotEmpty()
    @MaxLength(100)
    type!: string;

    @ApiPropertyOptional({description: 'Description'})
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    @IsNotEmpty()
    description?: string;
    
    @ApiPropertyOptional({description: 'Description'})
    @IsOptional()
    @IsUUID()
    photoDocumentId?: string;
}

export class UpdateCompanyAssetDto {
    @ApiPropertyOptional({maxLength: 50, description: 'Serial Number'})
    @IsOptional()
    @IsString()
    @MaxLength(50)
    serialNumber?: string;

    @ApiPropertyOptional({maxLength: 100, description: 'Brand'})
    @IsOptional()
    @IsString()
    @MaxLength(100)
    brand?: string;

    @ApiPropertyOptional({maxLength: 100, description: 'Model'})
    @IsOptional()
    @IsNotEmpty()
    @MaxLength(100)
    model?: string;

    @ApiPropertyOptional({description: 'Year', example: 2026})
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1900)
    @Max(new Date().getFullYear() + 1)
    year?: number;

    @ApiPropertyOptional({maxLength: 50, description: 'Color'})
    @IsOptional()
    @IsString()
    @MaxLength(50)
    color?: string;

    @ApiPropertyOptional({maxLength: 100, description: 'Laptop'})
    @IsOptional()
    @IsString()
    @MaxLength(100)
    type?: string;

    @ApiPropertyOptional({description: 'Description'})
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    description?: string;

    @ApiPropertyOptional({description: 'Photo Document ID'})
    @IsOptional()
    @IsUUID()
    photoDocumentId?: string;
}

export class UpdateCompanyAssetStatusDto {
    @ApiProperty({enum: AssetStatus})
    @IsEnum(AssetStatus)
    status!: AssetStatus;
}


export class ListCompanyAssetsDto {
    @ApiPropertyOptional({default: 1})
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    page?: number;

    @ApiPropertyOptional({default: 20})
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit?: number;

    @ApiPropertyOptional({description: 'Search'})
    @IsOptional()
    @IsString()
    search?: string;

    @ApiPropertyOptional({enum: AssetStatus})
    @IsOptional()
    @IsEnum(AssetStatus)
    status?: AssetStatus;

    @ApiPropertyOptional({maxLength: 100, description: 'Filter by asset type'})
    @IsOptional()
    @IsString()
    type?: string;
}


export {AssetStatus};