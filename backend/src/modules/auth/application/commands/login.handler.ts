import {
  ForbiddenException,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
  UserWithCompany,
} from '../../domain/repositories/auth.repository.interface';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';
import { AuthTokensDto } from '../dtos/auth-response.dto';
import { LoginCommand } from './login.command';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, AuthTokensDto> {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Authenticates a user and issues access + refresh tokens with a new session.
   */
  async execute(command: LoginCommand): Promise<AuthTokensDto> {
    const user = await this.authRepository.findActiveUserByEmail(command.email);

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordValid = await this.passwordService.verify(
      command.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message:
          'Email address not verified. Please check your inbox for the activation link.',
        error: 'EMAIL_NOT_VERIFIED',
      });
    }

    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenHash = await this.tokenService.hashToken(refreshToken);
    const expiresAt = this.tokenService.getRefreshExpiryDate();

    const session = await this.authRepository.createSession({
      userId: user.id,
      companyId: user.companyId,
      refreshTokenHash,
      deviceInfo: command.deviceInfo,
      ipAddress: command.ipAddress,
      expiresAt,
    });

    await this.authRepository.updateUserLastLogin(user.id);

    return this.buildAuthResponse(user, session.id, refreshToken);
  }

  private buildAuthResponse(
    user: UserWithCompany,
    sessionId: string,
    refreshToken: string,
  ): AuthTokensDto {
    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
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
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyId: user.companyId,
        companyName: user.company.legalName,
        preferredLanguage:
          user.preferredLanguage ?? user.company.defaultLanguage,
        preferredTimezone:
          user.preferredTimezone ?? user.company.defaultTimezone,
        preferredDateFormat:
          user.preferredDateFormat ?? user.company.defaultDateFormat,
        emailVerifiedAt: user.emailVerifiedAt,
      },
    };
  }
}
