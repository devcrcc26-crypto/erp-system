import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'admin@company.local' })
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(32)
  token!: string;

  @ApiProperty({ example: 'NewPassword@12345' })
  @IsString()
  @MinLength(8)
  newPassword!: string;
}
