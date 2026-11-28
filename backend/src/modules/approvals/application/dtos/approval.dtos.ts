import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalRequestStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

export class SubmitRequestDto {
  @ApiProperty({ example: 'LEAVE_REQUEST' })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  categoryCode!: string;

  @ApiProperty({ example: 'Annual leave - 5 days' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  title!: string;

  @ApiProperty({
    description: 'Dynamic form payload matching the category formSchema',
    type: 'object',
    additionalProperties: true,
  })
  @IsObject()
  formData!: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Document folder for attachments' })
  @IsOptional()
  @IsEntityUuid()
  documentFolderId?: string;

  @ApiPropertyOptional({
    description: 'Optional document ids linked to the request',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsEntityUuid({ each: true })
  documentIds?: string[];
}

export class TierActionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiPropertyOptional({
    description:
      'Approve / return: full-access roles (GM, MD, HR Manager/Officer, System Administrator) act on the current tier on behalf of its assigned approver. Not accepted for reject.',
  })
  @IsOptional()
  @IsBoolean()
  onBehalf?: boolean;
}

/** Return / Reject require a reason so the submitter knows what to change. */
export class ReturnRejectTierActionDto {
  @ApiProperty({
    minLength: 5,
    maxLength: 2000,
    description: 'Required reason for the submitter (min 5 characters)',
  })
  @IsString()
  @MinLength(5, {
    message: 'Enter a reason so the submitter knows what to change.',
  })
  @MaxLength(2000)
  note!: string;

  @ApiPropertyOptional({
    description:
      'Return only: full-access roles act on the current tier on behalf of its assigned approver. Not accepted for reject.',
  })
  @IsOptional()
  @IsBoolean()
  onBehalf?: boolean;
}

export class AddConditionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
}

export class AddApprovalCommentDto {
  @ApiProperty({ minLength: 1, maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  commentText!: string;
}

/** One entry in an Approve-with-changes payload (existing id optional for adds). */
export class ApproveWithChangesEntryDto {
  @ApiPropertyOptional({
    description: 'Existing entry id. Omit when adding a new entry.',
  })
  @IsOptional()
  @IsEntityUuid()
  id?: string;

  @ApiProperty({ example: '2026-08-01' })
  @IsDateString()
  date!: string;

  @ApiProperty({ example: '18:00' })
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, { message: 'startTime must be HH:mm' })
  startTime!: string;

  @ApiProperty({ example: '21:00' })
  @IsString()
  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d|24:00$/, {
    message: 'endTime must be HH:mm or 24:00',
  })
  endTime!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  taskDescription!: string;

  @ApiPropertyOptional({
    minLength: 5,
    description: 'Required when this entry is new or changed vs the sheet',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  reason?: string;
}

export class ApproveWithChangesRemovedEntryDto {
  @ApiProperty()
  @IsEntityUuid()
  id!: string;

  @ApiProperty({ minLength: 5 })
  @IsString()
  @MinLength(5, {
    message: 'Enter a reason so the submitter knows what to change.',
  })
  @MaxLength(2000)
  reason!: string;
}

/** Reports-to approver edits OT entries then approves tier 1. */
export class ApproveWithChangesDto {
  @ApiPropertyOptional({ description: 'Optional overall note on the tier' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;

  @ApiProperty({
    type: [ApproveWithChangesEntryDto],
    description: 'Desired final set of entries (adds + updates)',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ApproveWithChangesEntryDto)
  entries!: ApproveWithChangesEntryDto[];

  @ApiPropertyOptional({
    type: [ApproveWithChangesRemovedEntryDto],
    description: 'Entries to remove (each requires a reason)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApproveWithChangesRemovedEntryDto)
  removedEntries?: ApproveWithChangesRemovedEntryDto[];
}

function toStatusArray(value: unknown): ApprovalRequestStatus[] | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value as ApprovalRequestStatus[];
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean) as ApprovalRequestStatus[];
  }
  return undefined;
}

export class ListRequestsDto {
  @ApiPropertyOptional({
    enum: ApprovalRequestStatus,
    isArray: true,
    description: 'One or more statuses (repeat query param or comma-separated)',
  })
  @IsOptional()
  @Transform(({ value }) => toStatusArray(value))
  @IsArray()
  @IsEnum(ApprovalRequestStatus, { each: true })
  status?: ApprovalRequestStatus[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityUuid()
  categoryId?: string;

  @ApiPropertyOptional({ description: 'Filter by requester user id' })
  @IsOptional()
  @IsEntityUuid()
  submittedById?: string;

  @ApiPropertyOptional({
    description:
      'Filter to requests where this user has a PENDING approval tier',
  })
  @IsOptional()
  @IsEntityUuid()
  pendingApproverId?: string;

  @ApiPropertyOptional({
    description:
      'Server-enforced inbox scope. MY_REQUESTS / PENDING_MY_ACTION always use the JWT user id. ALL is company-wide for full-access users only.',
    enum: ['MY_REQUESTS', 'PENDING_MY_ACTION', 'ALL'],
  })
  @IsOptional()
  @IsIn(['MY_REQUESTS', 'PENDING_MY_ACTION', 'ALL'])
  inbox?: 'MY_REQUESTS' | 'PENDING_MY_ACTION' | 'ALL';

  @ApiPropertyOptional({ description: 'ISO date - filter submittedAt >= dateFrom' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'ISO date - filter submittedAt <= dateTo' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @ApiPropertyOptional({
    description: 'Search title or request number (case-insensitive contains)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
