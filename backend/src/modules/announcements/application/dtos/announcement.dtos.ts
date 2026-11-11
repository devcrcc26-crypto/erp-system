import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  AnnouncementPriority,
  AnnouncementScope,
  AnnouncementStatus,
  AnnouncementType,
} from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class CreateAnnouncementDto {
  @ApiPropertyOptional({ enum: AnnouncementType, default: AnnouncementType.COMPANY })
  @IsOptional()
  @IsEnum(AnnouncementType)
  type?: AnnouncementType;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  titleZh?: string | null;

  @ApiProperty({ description: 'Markdown. Raw HTML is removed.' })
  @IsString()
  @MaxLength(20000)
  body!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20000)
  bodyZh?: string | null;

  @ApiPropertyOptional({ enum: AnnouncementPriority })
  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @ApiPropertyOptional({ enum: AnnouncementScope })
  @IsOptional()
  @IsEnum(AnnouncementScope)
  audienceScope?: AnnouncementScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  disciplineIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireAcknowledgement?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ description: 'ISO date-time; empty clears it' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  expiresAt?: string | null;
}

/** Every field optional; after publish only content, pin and expiry may change. */
export class UpdateAnnouncementDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(200)
  titleZh?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20000)
  body?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(20000)
  bodyZh?: string | null;

  @ApiPropertyOptional({ enum: AnnouncementPriority })
  @IsOptional()
  @IsEnum(AnnouncementPriority)
  priority?: AnnouncementPriority;

  @ApiPropertyOptional({ enum: AnnouncementScope })
  @IsOptional()
  @IsEnum(AnnouncementScope)
  audienceScope?: AnnouncementScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  disciplineIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(2000)
  @IsUUID('all', { each: true })
  employeeIds?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  requireAcknowledgement?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  sendEmail?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  pinned?: boolean;

  @ApiPropertyOptional({ description: 'ISO date-time; empty clears it' })
  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  expiresAt?: string | null;
}

export class PublishAnnouncementDto {
  @ApiPropertyOptional({
    description: 'Future ISO date-time schedules the post; omit to publish now',
  })
  @IsOptional()
  @Transform(emptyToNull)
  @IsDateString()
  publishAt?: string | null;
}

export class AudiencePreviewDto {
  @ApiProperty({ enum: AnnouncementScope })
  @IsEnum(AnnouncementScope)
  audienceScope!: AnnouncementScope;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  departmentIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  disciplineIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  roleIds?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsUUID('all', { each: true })
  employeeIds?: string[];
}

export class ListAnnouncementsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: AnnouncementStatus })
  @IsOptional()
  @IsEnum(AnnouncementStatus)
  status?: AnnouncementStatus;

  @ApiPropertyOptional({ enum: AnnouncementType })
  @IsOptional()
  @IsEnum(AnnouncementType)
  type?: AnnouncementType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class ListMyAnnouncementsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ enum: ['all', 'unread'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'unread'])
  filter: 'all' | 'unread' = 'all';

  @ApiPropertyOptional({ enum: AnnouncementType, default: AnnouncementType.COMPANY })
  @IsOptional()
  @IsEnum(AnnouncementType)
  type: AnnouncementType = AnnouncementType.COMPANY;
}

export class ListRecipientsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 50, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 50;

  @ApiPropertyOptional({ enum: ['all', 'unread', 'unacknowledged'], default: 'all' })
  @IsOptional()
  @IsIn(['all', 'unread', 'unacknowledged'])
  filter: 'all' | 'unread' | 'unacknowledged' = 'all';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

export class MarkAnnouncementsReadDto {
  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('all', { each: true })
  ids!: string[];
}
