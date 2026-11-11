import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

export const FOLDER_CONTEXT_TYPES = [
  'SYSTEM',
  'COMPANY',
  'PROJECT',
  'DEPARTMENT',
  'USER',
] as const;

export type FolderContextType = (typeof FOLDER_CONTEXT_TYPES)[number];

/** PM entity folder types exposed in the project document browser. */
export const PROJECT_DOCUMENT_FOLDER_CONTEXT_TYPES = [
  'PROJECT',
  'TASK_DISCIPLINE',
  'RFI',
  'ISSUE',
  'SUBMITTAL',
  'DAILY_LOG',
  'MEETING',
  'CORRESPONDENCE',
  'RISK',
  'PUNCH_ITEM',
] as const;

export type ProjectDocumentFolderContextType =
  (typeof PROJECT_DOCUMENT_FOLDER_CONTEXT_TYPES)[number];

export const PROJECT_DOCUMENT_FILE_TYPE_FILTERS = [
  'pdf',
  'image',
  'word',
  'excel',
  'other',
] as const;

export type ProjectDocumentFileTypeFilter =
  (typeof PROJECT_DOCUMENT_FILE_TYPE_FILTERS)[number];

export class CreateDocumentFolderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  parentId?: string;

  @ApiProperty({ enum: FOLDER_CONTEXT_TYPES })
  @IsEnum(FOLDER_CONTEXT_TYPES)
  contextType!: FolderContextType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
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
  @IsEntityUuid()
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
  @IsEntityUuid()
  contextId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  parentId?: string;
}

export class ProjectDocumentListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Search file name, folder path, engineering document title, or document number',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: PROJECT_DOCUMENT_FOLDER_CONTEXT_TYPES })
  @IsOptional()
  @IsIn([...PROJECT_DOCUMENT_FOLDER_CONTEXT_TYPES])
  folderContextType?: ProjectDocumentFolderContextType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  taskDisciplineId?: string;

  @ApiPropertyOptional({ enum: PROJECT_DOCUMENT_FILE_TYPE_FILTERS })
  @IsOptional()
  @IsIn([...PROJECT_DOCUMENT_FILE_TYPE_FILTERS])
  fileType?: ProjectDocumentFileTypeFilter;

  @ApiPropertyOptional({ description: 'Inclusive start of upload date (ISO date)' })
  @IsOptional()
  @IsDateString()
  uploadedFrom?: string;

  @ApiPropertyOptional({ description: 'Inclusive end of upload date (ISO date)' })
  @IsOptional()
  @IsDateString()
  uploadedTo?: string;
}

/** Longest presigned URL lifetime a caller may request (1 hour). */
export const MAX_DOWNLOAD_URL_EXPIRES_IN_SECONDS = 3600;

export class DocumentDownloadUrlQueryDto {
  @ApiPropertyOptional({
    description:
      'Presigned URL lifetime in seconds (1-3600). Omit for the default download lifetime.',
    minimum: 1,
    maximum: MAX_DOWNLOAD_URL_EXPIRES_IN_SECONDS,
    example: 600,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_DOWNLOAD_URL_EXPIRES_IN_SECONDS)
  expiresIn?: number;
}
