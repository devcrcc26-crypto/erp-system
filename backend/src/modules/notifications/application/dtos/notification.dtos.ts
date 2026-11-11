import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

export class MarkNotificationsReadForRouteDto {
  @ApiProperty({
    description:
      'Current app route (pathname and optional query), e.g. /approvals/uuid or /profile?tab=leave',
    example: '/approvals/550e8400-e29b-41d4-a716-446655440000',
  })
  @IsString()
  path!: string;
}

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'When true, return only unread in-app notifications',
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === true || value === 'true' || value === '1') {
      return true;
    }
    if (value === false || value === 'false' || value === '0') {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  unreadOnly?: boolean;
}

export class CreateNotificationTemplateDto {
  @ApiProperty()
  @IsString()
  eventType!: string;

  @ApiProperty({ enum: ['IN_APP', 'EMAIL', 'SMS'] })
  @IsEnum(['IN_APP', 'EMAIL', 'SMS'])
  channel!: 'IN_APP' | 'EMAIL' | 'SMS';

  @ApiProperty()
  @IsString()
  subjectTemplate!: string;

  @ApiProperty()
  @IsString()
  bodyTemplate!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdateNotificationTemplateDto extends PartialType(
  CreateNotificationTemplateDto,
) {}

export class UpsertNotificationPreferenceDto {
  @ApiProperty()
  @IsString()
  eventType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  inApp?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  email?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sms?: boolean;
}

export class SendNotificationDto {
  @ApiProperty()
  @IsEntityUuid()
  recipientId!: string;

  @ApiProperty()
  @IsString()
  eventType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  channel?: 'IN_APP' | 'EMAIL' | 'SMS';

  @ApiPropertyOptional()
  @IsOptional()
  subject?: string;

  @ApiPropertyOptional()
  @IsOptional()
  body?: string;

  @ApiPropertyOptional({ description: 'Template variables e.g. { firstName: "John" }' })
  @IsOptional()
  variables?: Record<string, string>;

  @ApiPropertyOptional({ description: 'In-app link to navigate to when the notification is clicked' })
  @IsOptional()
  @IsString()
  link?: string;
}
