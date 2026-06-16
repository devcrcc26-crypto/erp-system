import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  CloseoutStatus,
  CorrespondenceStatus,
  CorrespondenceType,
  IssueSeverity,
  IssueStatus,
  MeetingStatus,
  MeetingType,
  ProjectStatus,
  ProjectType,
  PunchItemSeverity,
  PunchItemStatus,
  RfiPriority,
  RfiStatus,
  RiskCategory,
  RiskStatus,
  SubmittalStatus,
  TaskDependencyType,
  TaskStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;
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
  @IsUUID()
  clientCompanyId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  branchId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  location?: string;

  @ApiPropertyOptional({ enum: ProjectType })
  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: ProjectType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contractType?: string;

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

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  projectManagerId?: string;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualFinishDate?: string;
}

export class AddProjectTeamMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiProperty()
  @IsString()
  roleOnProject!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  assignedFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  assignedTo?: string;
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

export class CreateTaskDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  milestoneId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentTaskId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  assignedTo?: string;

  @ApiProperty()
  @IsString()
  taskIdCode!: string;

  @ApiProperty()
  @IsString()
  name!: string;

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
}

export class UpdateTaskDto extends PartialType(CreateTaskDto) {}

export class CreateTaskDependencyDto {
  @ApiProperty()
  @IsUUID()
  predecessorTaskId!: string;

  @ApiProperty()
  @IsUUID()
  successorTaskId!: string;

  @ApiProperty({ enum: TaskDependencyType })
  @IsEnum(TaskDependencyType)
  dependencyType!: TaskDependencyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  lagDays?: number;
}

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
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
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

export class CreateDrawingDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
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
  @IsUUID()
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
  @IsUUID()
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
  @IsUUID()
  assignedTo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dueDate?: string;
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
  @IsUUID()
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
  @IsUUID()
  verifiedBy?: string;
}

export class PmListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;
}
