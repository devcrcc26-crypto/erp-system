import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail } from 'class-validator';
import { normalizeEmail } from '../../../../shared/utils/email.util';

export class ResendActivationDto {
  @ApiProperty()
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail()
  email!: string;
}
