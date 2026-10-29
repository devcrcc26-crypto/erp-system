import { Inject, UnauthorizedException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
  UserWithCompany,
} from '../../domain/repositories/auth.repository.interface';
import { TokenService } from '../services/token.service';
import { AuthTokensDto } from '../dtos/auth-response.dto';
import { RefreshTokenCommand } from './refresh-token.command';

@CommandHandler(RefreshTokenCommand)
export class RefreshTokenHandler
  implements ICommandHandler<RefreshTokenCommand, AuthTokensDto>
{
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Rotates the refresh token and issues a new access token for an active session.
   */
  async execute(command: RefreshTokenCommand): Promise<AuthTokensDto> {
    const session = await this.authRepository.findSessionById(command.sessionId);

    if (!session || session.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    const tokenValid = await this.tokenService.verifyToken(
      command.refreshToken,
      session.refreshTokenHash,
    );

    if (!tokenValid) {
      await this.authRepository.deleteSession(command.sessionId);
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.authRepository.findActiveUserById(session.userId);

    if (!user) {
      throw new UnauthorizedException('User account is inactive');
    }

    const newRefreshToken = this.tokenService.generateRefreshToken();
    const newRefreshTokenHash =
      await this.tokenService.hashToken(newRefreshToken);
    const expiresAt = this.tokenService.getRefreshExpiryDate();

    await this.authRepository.updateSessionRefreshToken(
      session.id,
      newRefreshTokenHash,
      expiresAt,
    );

    return this.buildAuthResponse(user, session.id, newRefreshToken);
  }

  private buildAuthResponse(
    user: UserWithCompany,
    sessionId: string,
    refreshToken: string,
  ): AuthTokensDto {
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email ?? '',
      companyId: user.companyId,
      sessionId,
    });

    return {
      accessToken,
      refreshToken,
      sessionId,
      expiresIn: this.tokenService.getAccessExpiresInSeconds(),
      user: {
        id: user.id,
        email: user.email ?? '',
        loginName: user.loginName,
        firstName: user.firstName,
        middleName: user.middleName ?? null,
        lastName: user.lastName,
        chineseName: user.chineseName,
        companyId: user.companyId,
        companyName: user.company.legalName,
        preferredLanguage:
          user.preferredLanguage ?? user.company.defaultLanguage,
        preferredTimezone:
          user.preferredTimezone ?? user.company.defaultTimezone,
        preferredDateFormat:
          user.preferredDateFormat ?? user.company.defaultDateFormat,
        emailVerifiedAt: user.emailVerifiedAt,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }
}
