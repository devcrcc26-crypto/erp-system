import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import {
  ApprovalLevel,
  CloseoutStatus,
  CommissionMode,
  CompletionStatus,
  CorrespondenceStatus,
  CorrespondenceType,
  IssueSeverity,
  IssueStatus,
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
  PunchItemStatus,
  RfiPriority,
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
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
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
  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

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

  @ApiPropertyOptional({ enum: ProjectStatus })
  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;

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
      'Client name — suggested presets: CCECC Ethiopia, CCECC Djibouti, CCECC Kenya; custom names allowed.',
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
      'Client name — null clears the client. Custom names allowed beyond presets.',
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
    description: 'Deprecated — derived from disciplineId.',
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
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  discipline?: string;

  @ApiPropertyOptional({ enum: RfiPriority })
  @IsOptional()
  @IsEnum(RfiPriority)
  priority?: RfiPriority;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  revisionNumber?: number;
}

export class CreateDesignSubmittalDto {
  @ApiProperty()
  @IsString()
  category!: string;

  @ApiProperty()
  @IsString()
  title!: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @IsEntityUuid({ each: true })
  designPackageIds!: string[];

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  shift?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  weatherCondition?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  temperatureC?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  rainfallMm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workSummary?: string;
}

export class UpdateDailyLogDto extends PartialType(CreateDailyLogDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  purpose?: string;
}

export class CreateDailyLogIncidentDto {
  @ApiProperty()
  @IsString()
  incidentType!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  severity?: string;
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
}

export class UpdateMeetingDto extends PartialType(CreateMeetingDto) {
  @ApiPropertyOptional({ enum: MeetingStatus })
  @IsOptional()
  @IsEnum(MeetingStatus)
  status?: MeetingStatus;
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
  @IsBoolean()
  attended?: boolean;
}

export class CreateActionItemDto {
  @ApiProperty()
  @IsEntityUuid()
  ownerId!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateActionItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}

export class CreateCorrespondenceDto {
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

  @ApiProperty()
  @IsDateString()
  correspondenceDate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  referenceNumber?: string;
}

export class UpdateCorrespondenceDto extends PartialType(CreateCorrespondenceDto) {
  @ApiPropertyOptional({ enum: CorrespondenceStatus })
  @IsOptional()
  @IsEnum(CorrespondenceStatus)
  status?: CorrespondenceStatus;
}

export class CreateRiskDto {
  @ApiProperty()
  @IsString()
  riskIdCode!: string;

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

export class UpdateIssueDto extends PartialType(CreateIssueDto) {
  @ApiPropertyOptional({ enum: IssueStatus })
  @IsOptional()
  @IsEnum(IssueStatus)
  status?: IssueStatus;
}

export class CreatePunchItemDto {
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
}

export class UpdatePunchItemDto extends PartialType(CreatePunchItemDto) {
  @ApiPropertyOptional({ enum: PunchItemStatus })
  @IsOptional()
  @IsEnum(PunchItemStatus)
  status?: PunchItemStatus;
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: SubmittalPurpose })
  @IsOptional()
  @IsEnum(SubmittalPurpose)
  submittalPurpose?: SubmittalPurpose;
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

export class CreateChangeRequestDto {
  @ApiProperty()
  @IsString()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

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
