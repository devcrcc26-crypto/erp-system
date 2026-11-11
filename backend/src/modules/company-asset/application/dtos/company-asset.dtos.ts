import { IsNotEmpty, IsString, Max, MaxLength, IsInt, Min, IsOptional, IsUUID, IsEnum, IsDateString, IsNumber, IsBoolean } from "class-validator";
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

    @ApiPropertyOptional({maxLength: 50, description: 'Color'})
    @IsOptional()
    @IsString()
    @MaxLength(50)
    color?: string;

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

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    assetCode?: string;

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    cardNumber?: string;

    @ApiPropertyOptional({ maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    assetName?: string;

    @ApiPropertyOptional({ maxLength: 500 })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    specifications?: string;

    @ApiPropertyOptional({ maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    assetCategory?: string;

    @ApiPropertyOptional({ example: '2026-01-15' })
    @IsOptional()
    @IsDateString()
    startUseDate?: string;

    @ApiPropertyOptional({ description: 'Useful life in months' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    usefulLifeMonths?: number;

    @ApiPropertyOptional({ description: 'Original value in ETB' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    originalValue?: number;

    @ApiPropertyOptional({ maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    managingDepartment?: string;

    @ApiPropertyOptional({ maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    storageLocation?: string;

    @ApiPropertyOptional({ description: 'Requires GM approval to assign' })
    @IsOptional()
    @IsBoolean()
    requiresGmApproval?: boolean;

    @ApiPropertyOptional({ description: 'Photo document ID' })
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

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    assetCode?: string;

    @ApiPropertyOptional({ maxLength: 100 })
    @IsOptional()
    @IsString()
    @MaxLength(100)
    cardNumber?: string;

    @ApiPropertyOptional({ maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    assetName?: string;

    @ApiPropertyOptional({ maxLength: 500 })
    @IsOptional()
    @IsString()
    @MaxLength(500)
    specifications?: string;

    @ApiPropertyOptional({ maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    assetCategory?: string;

    @ApiPropertyOptional({ example: '2026-01-15' })
    @IsOptional()
    @IsDateString()
    startUseDate?: string;

    @ApiPropertyOptional({ description: 'Useful life in months' })
    @IsOptional()
    @Type(() => Number)
    @IsInt()
    @Min(1)
    usefulLifeMonths?: number;

    @ApiPropertyOptional({ description: 'Original value in ETB' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    originalValue?: number;

    @ApiPropertyOptional({ maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    managingDepartment?: string;

    @ApiPropertyOptional({ maxLength: 200 })
    @IsOptional()
    @IsString()
    @MaxLength(200)
    storageLocation?: string;

    @ApiPropertyOptional({ description: 'Requires GM approval to assign' })
    @IsOptional()
    @IsBoolean()
    requiresGmApproval?: boolean;

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

export class ListCompanyAssetAssignmentsDto {
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

    @ApiPropertyOptional({ default: false, description: "When true, include returned assignments" })
    @IsOptional()
    includeReturned?: boolean;

    @ApiPropertyOptional({ description: "Filter by employee user ID" })
    @IsOptional()
    @IsUUID()
    employeeId?: string;
}

export class IssueCompanyAssetAssignmentDto {
    @ApiProperty({ description: "Employee user ID to issue this asset to" })
    @IsUUID()
    employeeId!: string;

    @ApiPropertyOptional({ description: "Assignment notes", maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    notes?: string;

    @ApiPropertyOptional({ description: "Asset request ID that triggered this assignment" })
    @IsOptional()
    @IsUUID()
    assetRequestId?: string;
}

export class ReturnCompanyAssetAssignmentDto {
    @ApiPropertyOptional({ description: "Where the asset is returned to", maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    returnedTo?: string;

    @ApiPropertyOptional({ description: "Return notes", maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    returnedNotes?: string;

    @ApiPropertyOptional({ description: "Reason for returning the asset", maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    returnReason?: string;

    @ApiPropertyOptional({ description: "Handover notes (credentials, access codes, etc.)", maxLength: 4000 })
    @IsOptional()
    @IsString()
    @MaxLength(4000)
    handoverNotes?: string;
}

export class AcknowledgeAssetReturnDto {
    @ApiPropertyOptional({ description: "Where the asset was returned to", maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    returnedTo?: string;

    @ApiPropertyOptional({ description: "HR acknowledgement notes", maxLength: 2000 })
    @IsOptional()
    @IsString()
    @MaxLength(2000)
    returnedNotes?: string;
}


export {AssetStatus};