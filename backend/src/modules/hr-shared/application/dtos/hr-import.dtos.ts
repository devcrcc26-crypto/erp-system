import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type ImportRowStatus =
  | 'ok'
  | 'error'
  | 'duplicate'
  | 'duplicate_in_file';

export class ImportRowPreviewDto {
  @ApiProperty()
  line!: number;

  @ApiProperty({
    description: 'Human-readable row label (email, name, or key)',
  })
  label!: string;

  @ApiProperty({ enum: ['ok', 'error', 'duplicate', 'duplicate_in_file'] })
  status!: ImportRowStatus;

  @ApiPropertyOptional()
  message?: string;
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

  @ApiPropertyOptional()
  label?: string;

  @ApiProperty()
  message!: string;
}

export class ImportCommitResponseDto {
  @ApiProperty()
  created!: number;

  @ApiPropertyOptional({
    description: 'Rows updated in place (e.g. leave balance upsert)',
  })
  updated?: number;

  @ApiProperty()
  skipped!: number;

  @ApiProperty({ type: [ImportCommitErrorDto] })
  errors!: ImportCommitErrorDto[];
}
