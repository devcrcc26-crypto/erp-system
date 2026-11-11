import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';
import { AUTH_PASSWORD_MIN_LENGTH } from '../constants/login-security.constants';

export class LoginDto {
  @ApiProperty({
    description:
      'Full name (OA login name) or email. Identifiers containing "@" are treated as email.',
    example: 'Abebe Bekele Kebede',
  })
  @Transform(({ value, obj }: { value: unknown; obj: Record<string, unknown> }) => {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
    // Backward-compatible: older clients still send `email`.
    const legacy = obj.email;
    return typeof legacy === 'string' ? legacy.trim() : value;
  })
  @IsString()
  @MinLength(1)
  identifier!: string;

  @ApiPropertyOptional({
    deprecated: true,
    description: 'Deprecated - use identifier. Kept for older clients.',
  })
  @IsOptional()
  @ValidateIf((_, value) => value !== undefined)
  @IsString()
  email?: string;

  @ApiProperty({ example: '<password>' })
  @IsString()
  @MinLength(AUTH_PASSWORD_MIN_LENGTH)
  password!: string;

  @ApiPropertyOptional({ example: 'Chrome on Windows' })
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
