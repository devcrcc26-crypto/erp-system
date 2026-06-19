import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

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
}
