import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ApprovalLevel,
  DesignPackageDependencyType,
  DesignPackageProjectedStatus,
  EdvStatus,
  EngineeringDocumentType,
  ReviewTier,
  SiteRepType,
  TaskDisciplineProjectedStatus,
  UrgencyLevel,
  WorkflowEntityType,
  WorkflowEventPhase,
} from '@prisma/client';
import { CommentSeverity } from '../../domain/contracts/enums/comment-severity.enum';
import { CommentStatus } from '../../domain/contracts/enums/comment-status.enum';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

export class RegisterEngineeringDocumentDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
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
  @IsEntityUuid()
  documentVersionId!: string;

  @ApiPropertyOptional({ example: '1' })
  @IsOptional()
  @IsString()
  revisionLabel?: string;
}

export class ReplaceDraftVersionFileDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  documentVersionId!: string;
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
  @IsEntityUuid({ each: true })
  engineeringDocumentVersionIds!: string[];

  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  reviewSessionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class BatchReturnEdvsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEntityUuid({ each: true })
  engineeringDocumentVersionIds!: string[];

  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  reviewSessionId!: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  commentTemplate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class BatchReviewApproveDto extends BatchApproveEdvsDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  designPackageId!: string;
}

export class BatchReviewReturnDto extends BatchReturnEdvsDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  designPackageId!: string;
}

export class BatchLockPackagesDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEntityUuid({ each: true })
  designPackageIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class TriggerRevisionDto {
  @ApiProperty({ enum: ['RFI', 'CHANGE_REQUEST', 'SUBMITTAL_REVIEW'] })
  @IsIn(['RFI', 'CHANGE_REQUEST', 'SUBMITTAL_REVIEW'])
  triggerSource!: 'RFI' | 'ISSUE' | 'CHANGE_REQUEST' | 'SUBMITTAL_REVIEW';

  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  triggerEntityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class SubmitPackageForReviewDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ReturnPackageForReworkCommentDto {
  @ApiProperty({ format: 'uuid', description: 'Document this comment targets' })
  @IsEntityUuid()
  engineeringDocumentVersionId!: string;

  @ApiPropertyOptional({ description: 'Text summary when no comment file is attached' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiProperty({ enum: CommentSeverity })
  @IsEnum(CommentSeverity)
  severity!: CommentSeverity;

  @ApiPropertyOptional({ format: 'uuid', description: 'Primary uploaded comment/markup file version' })
  @IsOptional()
  @IsEntityUuid()
  commentDocumentVersionId?: string;

  @ApiPropertyOptional({ type: [String], description: 'Additional uploaded comment/markup file versions' })
  @IsOptional()
  @IsArray()
  @IsEntityUuid({ each: true })
  commentFileIds?: string[];

  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  assignedToUserId!: string;
}

export class ReturnPackageForReworkDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  reviewSessionId!: string;

  @ApiProperty({ type: [ReturnPackageForReworkCommentDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReturnPackageForReworkCommentDto)
  comments!: ReturnPackageForReworkCommentDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ApproveReviewSessionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({
    description: 'Required when approving the INSTITUTE_CHIEF tier on behalf of an external Institute Chief with no system account.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  approvedOnBehalfOfName?: string;
}

export class AddReviewCommentDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  reviewSessionId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  engineeringDocumentVersionId!: string;

  @ApiPropertyOptional({ description: 'Text summary when no comment file is attached' })
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Uploaded comment/markup file version' })
  @IsOptional()
  @IsEntityUuid()
  commentDocumentVersionId?: string;

  @ApiProperty({ enum: CommentSeverity })
  @IsEnum(CommentSeverity)
  severity!: CommentSeverity;

  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  assignedToUserId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class TransitionReviewCommentDto {
  @ApiProperty({ enum: CommentStatus })
  @IsEnum(CommentStatus)
  targetStatus!: CommentStatus;

  @ApiPropertyOptional({ description: 'Designer summary when marking RESOLVED' })
  @IsOptional()
  @IsString()
  resolutionNote?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Designer response file version' })
  @IsOptional()
  @IsEntityUuid()
  responseDocumentVersionId?: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Additional designer response file versions (beyond primary)',
  })
  @IsOptional()
  @IsArray()
  @IsEntityUuid({ each: true })
  additionalResponseDocumentVersionIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class VerifyReviewCommentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class UpdateReviewCommentDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  engineeringDocumentVersionId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  body?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  commentDocumentVersionId?: string;

  @ApiProperty({ enum: CommentSeverity })
  @IsEnum(CommentSeverity)
  severity!: CommentSeverity;

  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  assignedToUserId!: string;

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

  @ApiPropertyOptional({ enum: ReviewTier, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ReviewTier, { each: true })
  requiredTiers?: ReviewTier[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  briefText?: string;

  @ApiPropertyOptional({ enum: ['TASK', 'RFI', 'ISSUE', 'CHANGE_REQUEST'] })
  @IsOptional()
  @IsIn(['TASK', 'RFI', 'ISSUE', 'CHANGE_REQUEST'])
  sourceEntityType?: 'TASK' | 'RFI' | 'ISSUE' | 'CHANGE_REQUEST';

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  sourceEntityId?: string;

  @ApiPropertyOptional({ type: [String], format: 'uuid' })
  @IsOptional()
  @IsArray()
  @IsEntityUuid({ each: true })
  briefDocumentIds?: string[];

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  designerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  reviewerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  disciplinaryLeaderUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  deptDeputyChiefUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  instituteChiefUserId?: string;

  @ApiPropertyOptional({
    description: 'External Institute Chief name - set instead of instituteChiefUserId when they have no system account.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  instituteChiefName?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  disciplineOwnerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  supportingDesignerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  siteRepresentativeUserId?: string;

  @ApiPropertyOptional({ enum: SiteRepType })
  @IsOptional()
  @IsEnum(SiteRepType)
  siteRepType?: SiteRepType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteRepName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  siteRepEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  siteRepPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteRepCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  consultantName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  consultantTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(320)
  consultantEmail?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  consultantPhone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  consultantCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mainWorkContent?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  plannedStartDate?: string;

  @ApiPropertyOptional({ format: 'date' })
  @IsOptional()
  @IsDateString()
  plannedFinishDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualWorkDays?: number;

  @ApiPropertyOptional({ enum: UrgencyLevel })
  @IsOptional()
  @IsEnum(UrgencyLevel)
  urgencyLevel?: UrgencyLevel;

  @ApiPropertyOptional({ enum: ApprovalLevel })
  @IsOptional()
  @IsEnum(ApprovalLevel)
  reviewLevel?: ApprovalLevel;
}

export class UpdateDesignPackageDto extends PartialType(CreateDesignPackageDto) {}

export class AddDesignPackageItemDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
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
  @IsEntityUuid()
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
  @IsEntityUuid()
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
  @IsEntityUuid()
  correctsEventId?: string;
}

export class UpdateTaskDisciplineAssigneesDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  designerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  reviewerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  disciplineLeadUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
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
