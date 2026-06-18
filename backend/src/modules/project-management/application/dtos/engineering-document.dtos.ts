import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import {
  DesignPackageDependencyType,
  DesignPackageProjectedStatus,
  EdvStatus,
  EngineeringDocumentType,
  TaskDisciplineProjectedStatus,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';

export class RegisterEngineeringDocumentDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  documentVersionId!: string;

  @ApiProperty({ enum: EngineeringDocumentType })
  @IsEnum(EngineeringDocumentType)
  documentType!: EngineeringDocumentType;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UploadEngineeringDocumentVersionDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  documentVersionId!: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  revisionLabel?: string;
}

export class UpdateEngineeringDocumentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  documentNumber?: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class UpdateEngineeringDocumentVersionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  revisionLabel?: string;
}

export class TransitionEdvStatusDto {
  @ApiProperty({ enum: EdvStatus })
  @IsEnum(EdvStatus)
  targetStatus!: EdvStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({ description: 'Idempotency-Key for safe replay' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class LockPackageEdvsDto {
  @ApiPropertyOptional({ description: 'Idempotency-Key for safe replay' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class BatchApproveEdvsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  engineeringDocumentVersionIds!: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reviewSessionId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CreateDesignPackageDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiPropertyOptional({ enum: DesignPackageProjectedStatus })
  @IsOptional()
  @IsEnum(DesignPackageProjectedStatus)
  projectedStatus?: DesignPackageProjectedStatus;
}

export class UpdateDesignPackageDto extends PartialType(CreateDesignPackageDto) {}

export class AddDesignPackageItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  engineeringDocumentVersionId!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class CreateDesignPackageDependencyDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  dependsOnPackageId!: string;

  @ApiProperty({ enum: DesignPackageDependencyType })
  @IsEnum(DesignPackageDependencyType)
  dependencyType!: DesignPackageDependencyType;
}

export class AppendWorkflowEventLogDto {
  @ApiProperty({ enum: WorkflowEntityType })
  @IsEnum(WorkflowEntityType)
  entityType!: WorkflowEntityType;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  entityId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  action!: string;

  @ApiProperty({ enum: WorkflowEventPhase })
  @IsEnum(WorkflowEventPhase)
  phase!: WorkflowEventPhase;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  beforeState?: Record<string, unknown>;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @IsOptional()
  @IsObject()
  afterState?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  correlationId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  correctsEventId?: string;
}

export class UpdateTaskDisciplineAssigneesDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  designerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  reviewerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  disciplineLeadUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  chiefUserId?: string;

  @ApiPropertyOptional({ enum: TaskDisciplineProjectedStatus })
  @IsOptional()
  @IsEnum(TaskDisciplineProjectedStatus)
  projectedStatus?: TaskDisciplineProjectedStatus;
}

export class EngineeringDocumentListQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
