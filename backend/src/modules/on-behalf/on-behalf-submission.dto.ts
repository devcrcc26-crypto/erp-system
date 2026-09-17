import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

/**
 * On-behalf fields shared by every HR request create DTO.
 * Works for JSON and multipart bodies (booleans may arrive as "true"/"false").
 */
export class OnBehalfSubmissionDto {
  @ApiPropertyOptional({
    description:
      'Submit on behalf of this employee. Requires on-behalf permission.',
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    value === '' || value === null ? undefined : value,
  )
  @IsUUID()
  onBehalfOfEmployeeId?: string;

  @ApiPropertyOptional({
    description:
      "On-behalf only: approve the creator's own tier in the approval chain on submission.",
    default: false,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === undefined || value === null || value === '') {
      return undefined;
    }
    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true';
    }
    return value;
  })
  @IsBoolean()
  autoApproveTier?: boolean;
}
