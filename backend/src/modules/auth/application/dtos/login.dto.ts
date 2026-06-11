import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';
import { normalizeEmail } from '../../../../shared/utils/email.util';

export class LoginDto {
  @ApiProperty({ example: 'admin@company.local' })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin@12345' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ example: 'Chrome on Windows' })
  @IsOptional()
  @IsString()
  deviceInfo?: string;
}
