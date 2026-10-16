import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ApprovalLevel,
  CloseoutStatus,
  CommissionMode,
  CompletionStatus,
  CorrespondenceDirection,
  CorrespondenceStatus,
  CorrespondenceType,
  IssueSeverity,
  MeetingScope,
  MeetingStatus,
  MeetingType,
  ProjectContractType,
  ProjectDesignProperties,
  ProjectDesignStage,
  ProjectResponsibleDepartment,
  ProjectStatus,
  ProjectTeamRole,
  ProjectType,
  PunchItemSeverity,
  RfiPriority,
  RfiSource,
  RfiStatus,
  RiskCategory,
  RiskStatus,
  DeliverableStatus,
  ProjectChangeRequestSource,
  ProjectChangeRequestStatus,
  SubmittalPreparedByRole,
  SubmittalPurpose,
  SubmittalStatus,
  TaskDependencyType,
  TaskLanguage,
  TaskStatus,
  TaskAttributes,
  UrgencyLevel,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { SOURCE_ENTITY_TYPES } from '../utils/source-entity.util';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';
import {
  PROJECT_CLIENT_MAX_LENGTH,
  normalizeProjectClientInput,
} from '@/shared/project-client-presets';

export class ProjectListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description:
      'Project status filter. Comma-separated to match multiple statuses.',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ProjectType })
  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: ProjectType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: ProjectResponsibleDepartment })
  @IsOptional()
  @IsEnum(ProjectResponsibleDepartment)
  responsibleDepartment?: ProjectResponsibleDepartment;

  @ApiPropertyOptional({ enum: ProjectDesignProperties })
  @IsOptional()
  @IsEnum(ProjectDesignProperties)
  designProperties?: ProjectDesignProperties;

  @ApiPropertyOptional({ enum: ProjectDesignStage })
  @IsOptional()
  @IsEnum(ProjectDesignStage)
  designStage?: ProjectDesignStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  responsiblePersonId?: string;
}

export class ProjectExportListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Project status filter. Comma-separated to match multiple statuses.',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ProjectType })
  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: ProjectType;

  @ApiPropertyOptional({ enum: ProjectResponsibleDepartment })
  @IsOptional()
  @IsEnum(ProjectResponsibleDepartment)
  responsibleDepartment?: ProjectResponsibleDepartment;

  @ApiPropertyOptional({ enum: ProjectDesignProperties })
  @IsOptional()
  @IsEnum(ProjectDesignProperties)
  designProperties?: ProjectDesignProperties;

  @ApiPropertyOptional({ enum: ProjectDesignStage })
  @IsOptional()
  @IsEnum(ProjectDesignStage)
  designStage?: ProjectDesignStage;

  @ApiPropertyOptional({ type: [String], description: 'Optional project id filter' })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value == null || value === '') {
      return undefined;
    }
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    }
    return undefined;
  })
  @IsArray()
  @IsEntityUuid({ each: true })
  projectIds?: string[];
}

export class CreateProjectDto {
  @ApiProperty()
  @IsString()
  projectCode!: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  clientCompanyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: ProjectType })
  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: ProjectType;

  @ApiPropertyOptional({ description: 'Length of Railway (km)' })
  @IsOptional()
  @IsNumber()
  railwayLengthKm?: number;

  @ApiPropertyOptional({ description: 'Length of Urban Rail Transit (km)' })
  @IsOptional()
  @IsNumber()
  urbanRailLengthKm?: number;

  @ApiPropertyOptional({ description: 'Length of Road (km)' })
  @IsOptional()
  @IsNumber()
  roadLengthKm?: number;

  @ApiPropertyOptional({ description: 'Gross Floor Area (m²)' })
  @IsOptional()
  @IsNumber()
  grossFloorAreaM2?: number;

  @ApiPropertyOptional({ enum: ProjectContractType })
  @IsOptional()
  @IsEnum(ProjectContractType)
  contractType?: ProjectContractType;

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedFinishDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  budget?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({
    description:
      'Client name - suggested presets: CCECC Ethiopia, CCECC Djibouti, CCECC Kenya; custom names allowed.',
    maxLength: PROJECT_CLIENT_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PROJECT_CLIENT_MAX_LENGTH)
  @Transform(({ value }: { value: unknown }) =>
    normalizeProjectClientInput(
      typeof value === 'string' ? value : undefined,
    ),
  )
  client?: string;

  @ApiPropertyOptional({ enum: ProjectResponsibleDepartment })
  @IsOptional()
  @IsEnum(ProjectResponsibleDepartment)
  responsibleDepartment?: ProjectResponsibleDepartment;

  @ApiPropertyOptional({ enum: ProjectDesignProperties })
  @IsOptional()
  @IsEnum(ProjectDesignProperties)
  designProperties?: ProjectDesignProperties;

  @ApiPropertyOptional({ enum: ProjectDesignStage })
  @IsOptional()
  @IsEnum(ProjectDesignStage)
  designStage?: ProjectDesignStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  responsiblePersonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  overallProgressPct?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isOutsourced?: boolean;
}

export class UpdateProjectDto extends PartialType(
  OmitType(CreateProjectDto, ['client'] as const),
) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualFinishDate?: string;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Client name - null clears the client. Custom names allowed beyond presets.',
    maxLength: PROJECT_CLIENT_MAX_LENGTH,
  })
  @IsOptional()
  @IsString()
  @MaxLength(PROJECT_CLIENT_MAX_LENGTH)
  @Transform(({ value }: { value: unknown }) => {
    if (value === null) {
      return null;
    }
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return value;
  })
  client?: string | null;
}

export class SetProjectTeamMemberDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  userId!: string;

  @ApiPropertyOptional({
    type: [String],
    description: 'Empty array means full access to all PM modules',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  visibleModules?: string[];
}

export class SetProjectTeamDto {
  @ApiPropertyOptional({
    type: [String],
    description: 'Legacy: user ids that form the project team (full module access)',
  })
  @IsOptional()
  @IsArray()
  @IsEntityUuid({ each: true })
  userIds?: string[];

  @ApiPropertyOptional({ type: [SetProjectTeamMemberDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SetProjectTeamMemberDto)
  members?: SetProjectTeamMemberDto[];
}

export class CreateMilestoneDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateMilestoneDto extends PartialType(CreateMilestoneDto) {}

export class TaskDisciplineAssignmentDto {
  @ApiProperty()
  @IsEntityUuid()
  disciplineId!: string;

  @ApiProperty()
  @IsEntityUuid()
  disciplineLeadUserId!: string;
}

export class CreateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  milestoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  parentTaskId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  dispatcherUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  supervisingChiefUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  assignedPersonUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  taskIdCode?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  overseasTaskNumber?: string;

  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nameZh?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  finishDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  durationDays?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  progressPct?: number;

  @ApiPropertyOptional({ enum: TaskStatus })
  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @ApiPropertyOptional({ enum: CommissionMode })
  @IsOptional()
  @IsEnum(CommissionMode)
  commissionMode?: CommissionMode;

  @ApiPropertyOptional({ deprecated: true })
  @IsOptional()
  @IsString()
  commissioningMethod?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requiresArchiving?: boolean;

  @ApiPropertyOptional({ enum: TaskAttributes })
  @IsOptional()
  @IsEnum(TaskAttributes)
  taskAttributes?: TaskAttributes;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  onSiteReceivingTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  assignmentToHqTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contactFormNumber?: string;

  @ApiPropertyOptional({ enum: ProjectDesignStage })
  @IsOptional()
  @IsEnum(ProjectDesignStage)
  designStage?: ProjectDesignStage;

  @ApiPropertyOptional({ enum: UrgencyLevel })
  @IsOptional()
  @IsEnum(UrgencyLevel)
  urgencyLevel?: UrgencyLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  hasCustomSchedule?: boolean;

  @ApiPropertyOptional({ enum: TaskLanguage })
  @IsOptional()
  @IsEnum(TaskLanguage)
  language?: TaskLanguage;

  @ApiPropertyOptional({ enum: ApprovalLevel })
  @IsOptional()
  @IsEnum(ApprovalLevel)
  approvalLevel?: ApprovalLevel;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualCompletionTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  actualWorkdays?: number;

  @ApiPropertyOptional({ enum: CompletionStatus })
  @IsOptional()
  @IsEnum(CompletionStatus)
  completionStatus?: CompletionStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiPropertyOptional({ type: [TaskDisciplineAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskDisciplineAssignmentDto)
  disciplines?: TaskDisciplineAssignmentDto[];
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @ApiPropertyOptional({ type: [TaskDisciplineAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskDisciplineAssignmentDto)
  disciplinesToAdd?: TaskDisciplineAssignmentDto[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsEntityUuid({ each: true })
  disciplineIdsToRemove?: string[];
}

export class CreateTaskDisciplineDto {
  @ApiProperty()
  @IsEntityUuid()
  disciplineId!: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Deprecated - derived from disciplineId.',
  })
  @IsOptional()
  @IsString()
  disciplineName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  designerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reviewerName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  disciplinaryLeader?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deptChiefEngineer?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualCompletionTime?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  designerUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  ownerUserId?: string;

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

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  instituteChiefUserId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsEntityUuid()
  supportingDesignerUserId?: string;
}

export class UpdateTaskDisciplineDto extends PartialType(CreateTaskDisciplineDto) {}

export class CreateTaskDependencyDto {
  @ApiProperty()
  @IsEntityUuid()
  predecessorTaskId!: string;

  @ApiProperty()
  @IsEntityUuid()
  successorTaskId!: string;

  @ApiProperty({ enum: TaskDependencyType })
  @IsEnum(TaskDependencyType)
  dependencyType!: TaskDependencyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  lagDays?: number;
}

export class UpdateTaskDependencyDto extends PartialType(CreateTaskDependencyDto) {}

export class CreateRfiDto {
  @ApiProperty()
  @IsEntityUuid()
  linkedDesignPackageId!: string;

  @ApiProperty({ enum: RfiSource })
  @IsEnum(RfiSource)
  rfiSource!: RfiSource;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: RfiPriority })
  @IsOptional()
  @IsEnum(RfiPriority)
  priority?: RfiPriority;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: SOURCE_ENTITY_TYPES })
  @IsOptional()
  @IsString()
  @IsIn([...SOURCE_ENTITY_TYPES])
  sourceEntityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceEntityId?: string;

  @ApiPropertyOptional({
    enum: ['DESIGN_TEAM', 'SITE_TEAM'],
    description: 'Which team the RFI is directed to; determines auto-assignment.',
  })
  @IsOptional()
  @IsString()
  @IsIn(['DESIGN_TEAM', 'SITE_TEAM'])
  directTo?: 'DESIGN_TEAM' | 'SITE_TEAM';
}

export class UpdateRfiDto extends PartialType(CreateRfiDto) {
  @ApiPropertyOptional({ enum: RfiStatus })
  @IsOptional()
  @IsEnum(RfiStatus)
  status?: RfiStatus;
}

export class CreateRfiResponseDto {
  @ApiProperty()
  @IsString()
  responseText!: string;

  @ApiPropertyOptional({
    description:
      'Optional document id (already uploaded to the RFI folder) attached to this response',
  })
  @IsOptional()
  @IsEntityUuid()
  responseDocumentId?: string;
}

export class LinkRfiCrDto {
  @ApiProperty()
  @IsEntityUuid()
  crId!: string;
}

export class LinkIssueCrDto {
  @ApiProperty()
  @IsEntityUuid()
  crId!: string;
}

export class CreateSubmittalDto {
  @ApiProperty()
  @IsString()
  category!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional({ enum: SubmittalPurpose })
  @IsOptional()
  @IsEnum(SubmittalPurpose)
  submittalPurpose?: SubmittalPurpose;

  @ApiPropertyOptional({ enum: SubmittalPreparedByRole })
  @IsOptional()
  @IsEnum(SubmittalPreparedByRole)
  preparedByRole?: SubmittalPreparedByRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  taskDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  revisionNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateSubmittalDto extends PartialType(CreateSubmittalDto) {
  @ApiPropertyOptional({ enum: SubmittalStatus })
  @IsOptional()
  @IsEnum(SubmittalStatus)
  status?: SubmittalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reviewDate?: string;
}

export class CreateSubmittalReviewDto {
  @ApiProperty({ enum: SubmittalStatus })
  @IsEnum(SubmittalStatus)
  status!: SubmittalStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comments?: string;

  @ApiPropertyOptional({
    description:
      'Optional document id (already uploaded to the submittal folder) attached to this review',
  })
  @IsOptional()
  @IsEntityUuid()
  attachmentDocumentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  revisionNumber?: number;
}

export class CreateDesignSubmittalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEntityUuid({ each: true })
  designPackageIds!: string[];

  @ApiPropertyOptional({
    description:
      'Site or consultant recipient for external releases; stored on contractor',
  })
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional({
    description: 'Optional release notes; stored on specReference',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ enum: SubmittalPurpose })
  @IsOptional()
  @IsEnum(SubmittalPurpose)
  submittalPurpose?: SubmittalPurpose;

  @ApiPropertyOptional({ enum: SubmittalPreparedByRole })
  @IsOptional()
  @IsEnum(SubmittalPreparedByRole)
  preparedByRole?: SubmittalPreparedByRole;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  taskDisciplineId?: string;
}

export class CreateConstructionSubmittalDto {
  @ApiProperty()
  @IsString()
  category!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsEntityUuid()
  taskDisciplineId!: string;

  @ApiProperty()
  @IsEntityUuid()
  designPackageId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractor?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  specReference?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  revisionNumber?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class IssueSubmittalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class SubmittalSiteReviewCommentDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  comment!: string;
}

export class RecordExternalApprovalDto {
  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  approvedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class RecordExternalFeedbackDto {
  @ApiProperty({ enum: ['COMMENT', 'REJECTION'] })
  @IsIn(['COMMENT', 'REJECTION'])
  kind!: 'COMMENT' | 'REJECTION';

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(5000)
  comment!: string;
}

export class WithdrawSubmittalDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class AddSubmittalItemsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEntityUuid({ each: true })
  designPackageIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class BatchIssueSubmittalsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEntityUuid({ each: true })
  submittalIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class BatchAddSubmittalItemsDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEntityUuid({ each: true })
  submittalIds!: string[];

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEntityUuid({ each: true })
  designPackageIds!: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class CreateDrawingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  folderId?: string;

  @ApiProperty()
  @IsString()
  drawingNumber!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discipline?: string;

  @ApiProperty()
  @IsString()
  revision!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateIssued?: string;
}

export class UpdateDrawingDto extends PartialType(CreateDrawingDto) {}

export class CreateDrawingLinkDto {
  @ApiProperty()
  @IsString()
  linkedEntityType!: string;

  @ApiProperty()
  @IsEntityUuid()
  linkedEntityId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateDailyLogDto {
  @ApiProperty()
  @IsDateString()
  logDate!: string;

  @ApiProperty({ description: 'DAY | NIGHT | SPLIT' })
  @IsString()
  shift!: string;

  @ApiProperty({
    enum: [
      'SUNNY',
      'PARTLY_CLOUDY',
      'OVERCAST',
      'LIGHT_RAIN',
      'HEAVY_RAIN',
      'THUNDERSTORM',
      'FOGGY',
      'WINDY',
      'HOT_AND_DRY',
    ],
  })
  @IsString()
  weatherCondition!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temperatureC?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  rainfallMm?: number;

  @ApiPropertyOptional({ enum: ['NONE', 'LIGHT', 'MODERATE', 'HEAVY'] })
  @IsOptional()
  @IsString()
  rainfallLevel?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  humidity?: number;

  @ApiProperty({ description: 'Work description for the day' })
  @IsString()
  workDescription!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  workforceCount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractorName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  issues?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  delays?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  supervisorId?: string;
}

export class UpdateDailyLogDto extends PartialType(CreateDailyLogDto) {}

export class CreateDailyLogWorkforceDto {
  @ApiProperty()
  @IsString()
  trade!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractor?: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  workerCount!: number;
}

export class CreateDailyLogEquipmentDto {
  @ApiProperty()
  @IsString()
  equipmentType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  hoursUsed?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  hoursDowntime?: number;
}

export class CreateDailyLogVisitorDto {
  @ApiProperty()
  @IsString()
  visitorName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  company?: string;

  @ApiProperty({
    enum: [
      'CLIENT_VISIT',
      'INSPECTION',
      'DELIVERY',
      'CONSULTANT_VISIT',
      'REGULATORY_AUTHORITY',
      'OTHER',
    ],
  })
  @IsString()
  purpose!: string;
}

export class CreateDailyLogIncidentDto {
  @ApiProperty({
    enum: [
      'SAFETY_VIOLATION',
      'NEAR_MISS',
      'FIRST_AID',
      'MEDICAL_TREATMENT',
      'LOST_TIME_INJURY',
      'PROPERTY_DAMAGE',
      'ENVIRONMENTAL',
      'OTHER',
    ],
  })
  @IsString()
  incidentType!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({
    enum: ['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL', 'NEAR_MISS'],
  })
  @IsString()
  severity!: string;
}

export class CreateDailyLogMaterialDto {
  @ApiProperty()
  @IsString()
  materialType!: string;

  @ApiProperty()
  @IsNumber()
  quantity!: number;

  @ApiProperty()
  @IsString()
  unit!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string;
}

export class CreateMeetingDto {
  @ApiProperty({ enum: MeetingType })
  @IsEnum(MeetingType)
  meetingType!: MeetingType;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsDateString()
  meetingDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: MeetingScope })
  @IsOptional()
  @IsEnum(MeetingScope)
  scope?: MeetingScope;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  taskDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  designPackageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endTime?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  agenda?: string;
}

export class UpdateMeetingDto extends PartialType(CreateMeetingDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  minutes?: string;
}

export class CreateMeetingAgendaItemDto {
  @ApiProperty()
  @IsString()
  topic!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  presenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  itemOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discussionNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decisionsMade?: string;
}

export class UpdateMeetingAgendaItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  topic?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  presenterId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  itemOrder?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discussionNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  decisionsMade?: string;
}

export class CreateMeetingAttendeeDto {
  @ApiPropertyOptional({ enum: ['INTERNAL', 'EXTERNAL'] })
  @IsOptional()
  @IsString()
  @IsIn(['INTERNAL', 'EXTERNAL'])
  attendeeType?: 'INTERNAL' | 'EXTERNAL';

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  userId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roleAtMeeting?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  attended?: boolean;
}

export class UpdateMeetingAttendeeDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  externalName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  organization?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roleAtMeeting?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  attended?: boolean;
}

export class CreateActionItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  assignedToName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  designPackageId?: string;
}

export class UpdateActionItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  ownerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateIssueFromActionItemDto {
  @ApiPropertyOptional({
    description: 'Optional subtask (design package) to link the created issue to',
  })
  @IsOptional()
  @IsEntityUuid()
  designPackageId?: string;
}

export class CreateCorrespondenceDto {
  @ApiProperty({ enum: CorrespondenceType })
  @IsEnum(CorrespondenceType)
  correspondenceType!: CorrespondenceType;

  @ApiProperty({ enum: CorrespondenceDirection })
  @IsEnum(CorrespondenceDirection)
  direction!: CorrespondenceDirection;

  @ApiProperty()
  @IsString()
  subject!: string;

  @ApiProperty()
  @IsString()
  senderName!: string;

  @ApiProperty()
  @IsString()
  recipientName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientCompany?: string;

  @ApiPropertyOptional({
    description:
      'Named internal sender (project team user). Required for outgoing.',
  })
  @IsOptional()
  @IsEntityUuid()
  senderUserId?: string;

  @ApiPropertyOptional({
    description:
      'Named internal recipient (project team user). Required for incoming.',
  })
  @IsOptional()
  @IsEntityUuid()
  recipientUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty()
  @IsDateString()
  correspondenceDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  parentId?: string;
}

export class UpdateCorrespondenceDto {
  @ApiPropertyOptional({ enum: CorrespondenceType })
  @IsOptional()
  @IsEnum(CorrespondenceType)
  correspondenceType?: CorrespondenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  correspondenceDate?: string;
}

export class RespondCorrespondenceDto {
  @ApiProperty({ enum: CorrespondenceType })
  @IsEnum(CorrespondenceType)
  correspondenceType!: CorrespondenceType;

  @ApiProperty()
  @IsString()
  subject!: string;

  @ApiProperty()
  @IsString()
  senderName!: string;

  @ApiProperty()
  @IsString()
  recipientName!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  senderCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  recipientCompany?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  senderUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  recipientUserId?: string;

  @ApiProperty()
  @IsDateString()
  correspondenceDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRiskDto {
  @ApiPropertyOptional({
    description: 'Ignored on create - the risk number is always server-generated.',
  })
  @IsOptional()
  @IsString()
  riskIdCode?: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: RiskCategory })
  @IsEnum(RiskCategory)
  category!: RiskCategory;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  probability!: number;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  impact!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mitigationPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contingencyPlan?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  reviewDate?: string;

  @ApiProperty()
  @IsEntityUuid()
  ownerId!: string;
}

export class UpdateRiskDto extends PartialType(CreateRiskDto) {
  @ApiPropertyOptional({ enum: RiskStatus })
  @IsOptional()
  @IsEnum(RiskStatus)
  status?: RiskStatus;

  @ApiPropertyOptional({
    description: 'Residual likelihood after mitigation, 1 (very low) - 5 (very high).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  residualLikelihood?: number;

  @ApiPropertyOptional({
    description: 'Residual impact after mitigation, 1 (negligible) - 5 (critical).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  residualImpact?: number;

  @ApiPropertyOptional({
    description: 'Explicitly clears the residual assessment when true.',
  })
  @IsOptional()
  @IsBoolean()
  clearResidual?: boolean;

  @ApiPropertyOptional({
    description: 'Optional note recorded on the risk review log entry for this update.',
  })
  @IsOptional()
  @IsString()
  reviewNotes?: string;
}

export class RiskStatusActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateRiskMitigationDto {
  @ApiProperty()
  @IsString()
  mitigationStrategy!: string;

  @ApiProperty({ description: 'Residual likelihood after mitigation, 1-5.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  residualLikelihood!: number;

  @ApiProperty({ description: 'Residual impact after mitigation, 1-5.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  residualImpact!: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateRiskMitigationDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  mitigationStrategy?: string;

  @ApiPropertyOptional({ description: 'Residual likelihood after mitigation, 1-5.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  residualLikelihood?: number;

  @ApiPropertyOptional({ description: 'Residual impact after mitigation, 1-5.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  residualImpact?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateIssueDto {
  @ApiProperty()
  @IsString()
  issueType!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiProperty({ enum: IssueSeverity })
  @IsEnum(IssueSeverity)
  severity!: IssueSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  taskDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  linkedDesignPackageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional({ enum: SOURCE_ENTITY_TYPES })
  @IsOptional()
  @IsString()
  @IsIn([...SOURCE_ENTITY_TYPES])
  sourceEntityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceEntityId?: string;
}

export class UpdateIssueDto extends PartialType(CreateIssueDto) {}

export class StartIssueDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  assignedTo?: string;
}

export class CloseIssueDto {
  @ApiProperty({ description: 'What was done to resolve this issue' })
  @IsString()
  resolutionNote!: string;
}

export class ReopenIssueDto {
  @ApiProperty({ description: 'Reason for reopening' })
  @IsString()
  reason!: string;
}

export class CreateIssueResponseDto {
  @ApiProperty()
  @IsString()
  responseText!: string;

  @ApiPropertyOptional({
    description:
      'Optional document id (already uploaded to the issue folder) attached to this response',
  })
  @IsOptional()
  @IsEntityUuid()
  responseDocumentId?: string;
}

export class CreatePunchItemDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  roomOrArea?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tradeResponsible?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ enum: PunchItemSeverity })
  @IsEnum(PunchItemSeverity)
  severity!: PunchItemSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  taskDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  designPackageId?: string;
}

export class UpdatePunchItemDto extends PartialType(CreatePunchItemDto) {}

export class AssignPunchItemDto {
  @ApiProperty()
  @IsEntityUuid()
  assignedTo!: string;
}

export class CorrectPunchItemDto {
  @ApiProperty()
  @IsString()
  resolutionNote!: string;
}

export class ReopenPunchItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateCloseoutDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  practicalCompletionDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  defectsLiabilityEndDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  finalCompletionDate?: string;

  @ApiPropertyOptional({ enum: CloseoutStatus })
  @IsOptional()
  @IsEnum(CloseoutStatus)
  status?: CloseoutStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  contractValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  variationsTotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  claimsTotal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  finalSettlement?: number;
}

export class UpdateCloseoutChecklistItemDto {
  @ApiProperty()
  @IsBoolean()
  isComplete!: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  verifiedBy?: string;
}

export class CreateWarrantyDto {
  @ApiProperty()
  @IsString()
  itemDescription!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  supplier?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  expiryDate?: string;
}

export class UpdateWarrantyDto extends PartialType(CreateWarrantyDto) {}

export class PmListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description:
      'Status filter. Comma-separated to match multiple statuses.',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description:
      'Severity filter (issue or punch severity values depending on module).',
  })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiPropertyOptional({
    description: 'Category filter (e.g. punch item category).',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ enum: RfiPriority })
  @IsOptional()
  @IsEnum(RfiPriority)
  priority?: RfiPriority;

  @ApiPropertyOptional({
    description:
      'Submittal purpose filter. Comma-separated to match multiple purposes.',
  })
  @IsOptional()
  @IsString()
  submittalPurpose?: string;

  @ApiPropertyOptional({ enum: CorrespondenceDirection })
  @IsOptional()
  @IsEnum(CorrespondenceDirection)
  direction?: CorrespondenceDirection;

  @ApiPropertyOptional({ enum: CorrespondenceType })
  @IsOptional()
  @IsEnum(CorrespondenceType)
  correspondenceType?: CorrespondenceType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  linkedDesignPackageId?: string;

  @ApiPropertyOptional({ description: 'Filter to a single project (company-wide lists)' })
  @IsOptional()
  @IsEntityUuid()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Risk matrix cell filter: exact probability (1-5).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  probability?: number;

  @ApiPropertyOptional({ description: 'Risk matrix cell filter: exact impact (1-5).' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  impact?: number;
}

export class DailyLogListQueryDto extends PmListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  logDateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  logDateTo?: string;
}

export class DeliverableListQueryDto extends PmListQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  disciplineId?: string;
}

export const CHANGE_REQUEST_REASONS = [
  'CLIENT_REQUEST',
  'SITE_CONDITION',
  'DESIGN_ERROR',
  'REGULATORY_COMPLIANCE',
] as const;

export type ChangeRequestReason = (typeof CHANGE_REQUEST_REASONS)[number];

export class CreateChangeRequestDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty()
  @IsEntityUuid()
  linkedDesignPackageId!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsEntityUuid({ each: true })
  affectedEdvIds!: string[];

  @ApiProperty({ enum: CHANGE_REQUEST_REASONS })
  @IsString()
  @IsIn([...CHANGE_REQUEST_REASONS])
  changeReason!: ChangeRequestReason;

  @ApiPropertyOptional({ enum: ProjectChangeRequestSource })
  @IsOptional()
  @IsEnum(ProjectChangeRequestSource)
  sourceType?: ProjectChangeRequestSource;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  sourceEntityId?: string;

  @ApiPropertyOptional({ enum: SOURCE_ENTITY_TYPES })
  @IsOptional()
  @IsString()
  @IsIn([...SOURCE_ENTITY_TYPES])
  sourceEntityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originEntityId?: string;
}

export class UpdateChangeRequestDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ProjectChangeRequestStatus })
  @IsOptional()
  @IsEnum(ProjectChangeRequestStatus)
  status?: ProjectChangeRequestStatus;

  @ApiPropertyOptional({ enum: SOURCE_ENTITY_TYPES })
  @IsOptional()
  @IsString()
  @IsIn([...SOURCE_ENTITY_TYPES])
  sourceEntityType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  originEntityId?: string;
}

export class RejectChangeRequestDto {
  @ApiProperty()
  @IsString()
  reason!: string;
}

export class CreateDeliverableDto {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  taskDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  designPackageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  engineeringDocumentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateDeliverableDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  taskDisciplineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  designPackageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  engineeringDocumentId?: string;

  @ApiPropertyOptional({ enum: DeliverableStatus })
  @IsOptional()
  @IsEnum(DeliverableStatus)
  status?: DeliverableStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class ExternalReviewTriggerListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ enum: ['PENDING', 'PROCESSED', 'PARTIAL', 'FAILED', 'CANCELLED'] })
  @IsOptional()
  @IsString()
  status?: string;
}

export class ConfigureRevisionTriggerDto {
  @ApiProperty({ enum: ['REVISION', 'NEW_PACKAGE'] })
  @IsIn(['REVISION', 'NEW_PACKAGE'])
  triggerMode!: 'REVISION' | 'NEW_PACKAGE';
}

export class ReviewSessionListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class AddReviewSessionAttachmentDto {
  @ApiProperty({ format: 'uuid' })
  @IsEntityUuid()
  documentId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purpose?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  note?: string;
}
