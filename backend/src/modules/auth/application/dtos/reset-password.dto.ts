import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MinLength } from 'class-validator';
import { normalizeEmail } from '../../../../shared/utils/email.util';

export class ResetPasswordDto {
  @ApiProperty({ example: 'admin@company.local' })
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  email!: string;

  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(32)
  token!: string;

  @ApiProperty({ example: 'NewPassword@12345' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
