import { ApiProperty } from '@nestjs/swagger';

export class AuthUserDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty()
  firstName!: string;

  @ApiProperty()
  lastName!: string;

  @ApiProperty({ nullable: true })
  chineseName!: string | null;

  @ApiProperty()
  companyId!: string;

  @ApiProperty()
  companyName!: string;

  @ApiProperty({ nullable: true })
  preferredLanguage!: string | null;

  @ApiProperty({ nullable: true })
  preferredTimezone!: string | null;

  @ApiProperty({ nullable: true })
  preferredDateFormat!: string | null;

  @ApiProperty({ nullable: true })
  emailVerifiedAt!: Date | null;
}

export class AuthTokensDto {
  @ApiProperty()
  accessToken!: string;

  @ApiProperty()
  refreshToken!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ example: 900 })
  expiresIn!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;
}

export class MessageResponseDto {
  @ApiProperty({ example: 'If the account exists, a reset email has been sent.' })
  message!: string;
}
