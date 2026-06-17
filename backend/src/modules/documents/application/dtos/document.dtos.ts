import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';

export const FOLDER_CONTEXT_TYPES = [
  'SYSTEM',
  'COMPANY',
  'PROJECT',
  'DEPARTMENT',
  'USER',
] as const;

export type FolderContextType = (typeof FOLDER_CONTEXT_TYPES)[number];

export class CreateDocumentFolderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiProperty({ enum: FOLDER_CONTEXT_TYPES })
  @IsEnum(FOLDER_CONTEXT_TYPES)
  contextType!: FolderContextType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contextId?: string;
}

export class UpdateDocumentFolderDto extends PartialType(
  CreateDocumentFolderDto,
) {}

export class UpdateDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(255)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isMandatory?: boolean;
}

export class UploadDocumentVersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  changeNote?: string;
}

export class UpsertDocumentAccessDto {
  @ApiProperty()
  @IsUUID()
  roleId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  canView?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canUpload?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canDownload?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  canDelete?: boolean;
}

export class DocumentFolderListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: FOLDER_CONTEXT_TYPES })
  @IsOptional()
  @IsEnum(FOLDER_CONTEXT_TYPES)
  contextType?: FolderContextType;

  @ApiPropertyOptional()
  @ValidateIf((query: DocumentFolderListQueryDto) => query.contextType !== undefined)
  @IsUUID()
  contextId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
