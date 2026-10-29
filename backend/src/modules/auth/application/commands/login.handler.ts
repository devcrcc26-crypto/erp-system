import {
  ForbiddenException,
  Inject,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
  UserWithCompany,
} from '../../domain/repositories/auth.repository.interface';
import {
  AUTH_ACCOUNT_LOCKED_MESSAGE,
  AUTH_INVALID_CREDENTIALS_MESSAGE,
} from '../constants/login-security.constants';
import { AuthTokensDto } from '../dtos/auth-response.dto';
import { LoginLockoutService } from '../services/login-lockout.service';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';
import { LoginCommand } from './login.command';

@CommandHandler(LoginCommand)
export class LoginHandler implements ICommandHandler<LoginCommand, AuthTokensDto> {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly loginLockoutService: LoginLockoutService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Authenticates by login name or email and issues access + refresh tokens.
   */
  async execute(command: LoginCommand): Promise<AuthTokensDto> {
    const user =
      command.identifierKind === 'email'
        ? await this.authRepository.findActiveUserByEmail(command.email ?? '')
        : await this.authRepository.findActiveUserByLoginNameNormalized(
            command.loginNameNormalized ?? '',
          );

    if (!user) {
      throw new UnauthorizedException(AUTH_INVALID_CREDENTIALS_MESSAGE);
    }

    if (this.loginLockoutService.isLocked(user.lockedUntil)) {
      await this.loginLockoutService.auditLockedAttempt(
        user.id,
        user.companyId,
        command.ipAddress,
      );
      throw new UnauthorizedException(AUTH_ACCOUNT_LOCKED_MESSAGE);
    }

    if (!user.passwordHash) {
      await this.loginLockoutService.recordFailedAttempt(
        user.id,
        user.companyId,
        user.failedLoginAttempts,
        command.ipAddress,
      );
      throw new UnauthorizedException(AUTH_INVALID_CREDENTIALS_MESSAGE);
    }

    const passwordValid = await this.passwordService.verify(
      command.password,
      user.passwordHash,
    );

    if (!passwordValid) {
      await this.loginLockoutService.recordFailedAttempt(
        user.id,
        user.companyId,
        user.failedLoginAttempts,
        command.ipAddress,
      );
      throw new UnauthorizedException(AUTH_INVALID_CREDENTIALS_MESSAGE);
    }

    // When EMAIL_DISABLED is off, verification applies only to users who have an
    // email. Users with email = null (full-name OA login) are never blocked for
    // being unverified.
    const emailDisabled = this.configService.get<string>('EMAIL_DISABLED');
    const emailVerificationRequired =
      emailDisabled !== 'true' && emailDisabled !== '1';

    if (
      emailVerificationRequired &&
      user.email != null &&
      user.email.length > 0 &&
      !user.emailVerifiedAt
    ) {
      throw new ForbiddenException({
        message:
          'Email address not verified. Please check your inbox for the activation link.',
        error: 'EMAIL_NOT_VERIFIED',
      });
    }

    await this.loginLockoutService.clearFailures(user.id);

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
