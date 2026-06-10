import { UnauthorizedException } from '@nestjs/common';
import { LoginHandler } from './login.handler';
import { LoginCommand } from './login.command';
import { IAuthRepository, UserWithCompany } from '../../domain/repositories/auth.repository.interface';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';

describe('LoginHandler', () => {
  const mockUser: UserWithCompany = {
    id: 'user-1',
    companyId: 'company-1',
    email: 'user@test.local',
    passwordHash: 'hashed',
    firstName: 'Test',
    lastName: 'User',
    preferredLanguage: null,
    preferredTimezone: null,
    preferredDateFormat: null,
    company: {
      id: 'company-1',
      legalName: 'Test Co',
      defaultLanguage: 'en',
      defaultTimezone: 'UTC',
      defaultDateFormat: 'DD/MM/YYYY',
    },
  } as UserWithCompany;

  let authRepository: jest.Mocked<Pick<IAuthRepository,
    | 'findActiveUserByEmail'
    | 'createSession'
    | 'updateUserLastLogin'
  >>;
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
  let handler: LoginHandler;

  beforeEach(() => {
    authRepository = {
      findActiveUserByEmail: jest.fn(),
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

    handler = new LoginHandler(
      authRepository as unknown as IAuthRepository,
      passwordService as unknown as PasswordService,
      tokenService as unknown as TokenService,
    );
  });

  it('returns tokens for valid credentials', async () => {
    authRepository.findActiveUserByEmail.mockResolvedValue(mockUser);
    passwordService.verify.mockResolvedValue(true);
    authRepository.createSession.mockResolvedValue({
      id: 'session-1',
    } as Awaited<ReturnType<IAuthRepository['createSession']>>);

    const result = await handler.execute(
      new LoginCommand('user@test.local', 'password', 'jest', '127.0.0.1'),
    );

    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toBe('refresh-token');
    expect(result.sessionId).toBe('session-1');
    expect(result.user.email).toBe('user@test.local');
    expect(authRepository.updateUserLastLogin).toHaveBeenCalledWith('user-1');
  });

  it('throws when user is not found', async () => {
    authRepository.findActiveUserByEmail.mockResolvedValue(null);

    await expect(
      handler.execute(new LoginCommand('missing@test.local', 'password')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('throws when password is invalid', async () => {
    authRepository.findActiveUserByEmail.mockResolvedValue(mockUser);
    passwordService.verify.mockResolvedValue(false);

    await expect(
      handler.execute(new LoginCommand('user@test.local', 'wrong')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
