import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class ResendActivationDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}
