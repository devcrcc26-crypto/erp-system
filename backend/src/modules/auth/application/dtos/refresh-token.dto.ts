import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { IsEntityUuid } from '../../../../shared/validators/is-entity-uuid.decorator';

export class RefreshTokenDto {
  @ApiProperty()
  @IsEntityUuid()
  sessionId!: string;

  @ApiProperty()
  @IsString()
  @MinLength(32)
  refreshToken!: string;
}
