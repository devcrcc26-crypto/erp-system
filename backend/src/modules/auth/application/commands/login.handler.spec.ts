import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoginHandler } from './login.handler';
import { LoginCommand } from './login.command';
import {
  IAuthRepository,
  UserWithCompany,
} from '../../domain/repositories/auth.repository.interface';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';
import { LoginLockoutService } from '../services/login-lockout.service';
import { AUTH_INVALID_CREDENTIALS_MESSAGE } from '../constants/login-security.constants';

describe('LoginHandler', () => {
  const mockUser: UserWithCompany = {
    id: 'user-1',
    companyId: 'company-1',
    email: 'user@test.local',
    loginName: 'Abebe Bekele Kebede',
    loginNameNormalized: 'abebe bekele kebede',
    passwordHash: 'hashed',
    firstName: 'Abebe',
    lastName: 'Kebede',
    middleName: 'Bekele',
    preferredLanguage: null,
    preferredTimezone: null,
    preferredDateFormat: null,
    emailVerifiedAt: new Date('2026-01-01'),
    mustChangePassword: false,
    failedLoginAttempts: 0,
    lockedUntil: null,
    company: {
      id: 'company-1',
      legalName: 'Test Co',
      defaultLanguage: 'en',
      defaultTimezone: 'UTC',
      defaultDateFormat: 'DD/MM/YYYY',
    },
  } as UserWithCompany;

  let authRepository: jest.Mocked<
    Pick<
      IAuthRepository,
      | 'findActiveUserByEmail'
      | 'findActiveUserByLoginNameNormalized'
      | 'createSession'
      | 'updateUserLastLogin'
    >
  >;
  let passwordService: jest.Mocked<Pick<PasswordService, 'verify'>>;
  let tokenService: jest.Mocked<
    Pick<
      TokenService,
      | 'generateRefreshToken'
      | 'hashToken'
      | 'getRefreshExpiryDate'
      | 'generateAccessToken'
      | 'getAccessExpiresInSeconds'
    >
  >;
  let loginLockoutService: jest.Mocked<
    Pick<
      LoginLockoutService,
      | 'isLocked'
      | 'clearFailures'
      | 'recordFailedAttempt'
      | 'auditLockedAttempt'
    >
  >;
  let configService: jest.Mocked<Pick<ConfigService, 'get'>>;
  let handler: LoginHandler;

  beforeEach(() => {
    authRepository = {
      findActiveUserByEmail: jest.fn(),
      findActiveUserByLoginNameNormalized: jest.fn(),
      createSession: jest.fn(),
      updateUserLastLogin: jest.fn(),
    };
    passwordService = { verify: jest.fn() };
    tokenService = {
      generateRefreshToken: jest.fn().mockReturnValue('refresh-token'),
      hashToken: jest.fn().mockResolvedValue('refresh-hash'),
      getRefreshExpiryDate: jest.fn().mockReturnValue(new Date('2030-01-01')),
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
      getAccessExpiresInSeconds: jest.fn().mockReturnValue(900),
    };
    loginLockoutService = {
      isLocked: jest.fn().mockReturnValue(false),
      clearFailures: jest.fn(),
      recordFailedAttempt: jest.fn().mockResolvedValue({ locked: false, attempts: 1 }),
      auditLockedAttempt: jest.fn(),
    };
    configService = {
      get: jest.fn().mockReturnValue('true'), // EMAIL_DISABLED
    };

    handler = new LoginHandler(
      authRepository as unknown as IAuthRepository,
      passwordService as unknown as PasswordService,
      tokenService as unknown as TokenService,
      loginLockoutService as unknown as LoginLockoutService,
      configService as unknown as ConfigService,
    );
  });

  async function expectGenericFailure(
    command: LoginCommand,
  ): Promise<void> {
    try {
      await handler.execute(command);
      fail('expected UnauthorizedException');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(UnauthorizedException);
      expect((error as UnauthorizedException).message).toBe(
        AUTH_INVALID_CREDENTIALS_MESSAGE,
      );
    }
  }

  it('logs in with exact full name', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue(
      mockUser,
    );
    passwordService.verify.mockResolvedValue(true);
    authRepository.createSession.mockResolvedValue({
      id: 'session-1',
    } as Awaited<ReturnType<IAuthRepository['createSession']>>);

    const result = await handler.execute(
      new LoginCommand('Abebe Bekele Kebede', 'password', 'jest', '127.0.0.1'),
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.user.loginName).toBe('Abebe Bekele Kebede');
    expect(authRepository.findActiveUserByLoginNameNormalized).toHaveBeenCalledWith(
      'abebe bekele kebede',
    );
  });

  it('accepts different case and extra spaces', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue(
      mockUser,
    );
    passwordService.verify.mockResolvedValue(true);
    authRepository.createSession.mockResolvedValue({
      id: 'session-1',
    } as Awaited<ReturnType<IAuthRepository['createSession']>>);

    await handler.execute(
      new LoginCommand('  ABEBE   bekele  KEBEDE ', 'password'),
    );

    expect(authRepository.findActiveUserByLoginNameNormalized).toHaveBeenCalledWith(
      'abebe bekele kebede',
    );
  });

  it('rejects misspelt name with generic error', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue(null);
    await expectGenericFailure(
      new LoginCommand('Abebe Bekele Kebeda', 'password'),
    );
  });

  it('rejects reversed order with generic error', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue(null);
    await expectGenericFailure(
      new LoginCommand('Kebede Bekele Abebe', 'password'),
    );
  });

  it('rejects partial name with generic error', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue(null);
    await expectGenericFailure(new LoginCommand('Abebe', 'password'));
  });

  it('rejects wrong password with generic error', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue(
      mockUser,
    );
    passwordService.verify.mockResolvedValue(false);
    await expectGenericFailure(
      new LoginCommand('Abebe Bekele Kebede', 'wrong-password'),
    );
    expect(loginLockoutService.recordFailedAttempt).toHaveBeenCalled();
  });

  it('locks after failed attempts when lockout service reports locked', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue({
      ...mockUser,
      failedLoginAttempts: 4,
    });
    passwordService.verify.mockResolvedValue(false);
    loginLockoutService.recordFailedAttempt.mockResolvedValue({
      locked: true,
      attempts: 5,
    });

    await expectGenericFailure(
      new LoginCommand('Abebe Bekele Kebede', 'wrong'),
    );
  });

  it('rejects locked account with generic error', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue(
      mockUser,
    );
    loginLockoutService.isLocked.mockReturnValue(true);

    await expect(
      handler.execute(new LoginCommand('Abebe Bekele Kebede', 'password')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(loginLockoutService.auditLockedAttempt).toHaveBeenCalled();
  });

  it('still supports email login when identifier contains @', async () => {
    authRepository.findActiveUserByEmail.mockResolvedValue(mockUser);
    passwordService.verify.mockResolvedValue(true);
    authRepository.createSession.mockResolvedValue({
      id: 'session-1',
    } as Awaited<ReturnType<IAuthRepository['createSession']>>);

    const result = await handler.execute(
      new LoginCommand('user@test.local', 'password'),
    );

    expect(result.user.email).toBe('user@test.local');
    expect(authRepository.findActiveUserByEmail).toHaveBeenCalled();
    expect(
      authRepository.findActiveUserByLoginNameNormalized,
    ).not.toHaveBeenCalled();
  });

  it('returns mustChangePassword in the auth payload', async () => {
    authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue({
      ...mockUser,
      mustChangePassword: true,
    });
    passwordService.verify.mockResolvedValue(true);
    authRepository.createSession.mockResolvedValue({
      id: 'session-1',
    } as Awaited<ReturnType<IAuthRepository['createSession']>>);

    const result = await handler.execute(
      new LoginCommand('Abebe Bekele Kebede', 'password'),
    );
    expect(result.user.mustChangePassword).toBe(true);
  });

  describe('when EMAIL_DISABLED is false', () => {
    beforeEach(() => {
      configService.get.mockReturnValue('false');
    });

    it('blocks unverified users who have an email', async () => {
      authRepository.findActiveUserByEmail.mockResolvedValue({
        ...mockUser,
        email: 'user@test.local',
        emailVerifiedAt: null,
      });
      passwordService.verify.mockResolvedValue(true);

      await expect(
        handler.execute(new LoginCommand('user@test.local', 'password')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('allows full-name login for users with email = null (never treated as unverified)', async () => {
      authRepository.findActiveUserByLoginNameNormalized.mockResolvedValue({
        ...mockUser,
        email: null,
        emailVerifiedAt: null,
      });
      passwordService.verify.mockResolvedValue(true);
      authRepository.createSession.mockResolvedValue({
        id: 'session-1',
      } as Awaited<ReturnType<IAuthRepository['createSession']>>);

      const result = await handler.execute(
        new LoginCommand('Abebe Bekele Kebede', 'password'),
      );

      expect(result.accessToken).toBe('access-token');
      expect(result.user.email).toBe('');
    });
  });
});

