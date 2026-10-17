import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ApprovalRequestStatus } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
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

export class AddConditionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text!: string;
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
