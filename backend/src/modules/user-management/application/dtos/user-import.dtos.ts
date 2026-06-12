import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export type ImportRowStatus =
  | 'ok'
  | 'error'
  | 'duplicate'
  | 'duplicate_in_file';

export class ImportUsersOptionsDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  sendInvitations?: boolean = true;
}

export class ImportRowPreviewDto {
  @ApiProperty()
  line!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty()
  role!: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiProperty({ enum: ['ok', 'error', 'duplicate', 'duplicate_in_file'] })
  status!: ImportRowStatus;

  @ApiPropertyOptional()
  message?: string;

  @ApiPropertyOptional()
  roleId?: string;
}

export class ImportPreviewResponseDto {
  @ApiProperty()
  valid!: number;

  @ApiProperty()
  invalid!: number;

  @ApiProperty()
  duplicate!: number;

  @ApiProperty({ type: [ImportRowPreviewDto] })
  rows!: ImportRowPreviewDto[];
}

export class ImportCommitErrorDto {
  @ApiProperty()
  line!: number;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  message!: string;
}

export class ImportCommitResponseDto {
  @ApiProperty()
  created!: number;

  @ApiProperty()
  skipped!: number;

  @ApiProperty()
  invitationsSent!: number;

  @ApiProperty()
  invitationsFailed!: number;

  @ApiProperty({ type: [ImportCommitErrorDto] })
  errors!: ImportCommitErrorDto[];
}
