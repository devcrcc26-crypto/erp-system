import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { AuthMailService } from '../services/auth-mail.service';
import { TokenService } from '../services/token.service';
import { ForgotPasswordCommand } from './forgot-password.command';
import { ForgotPasswordHandler } from './forgot-password.handler';

describe('ForgotPasswordHandler', () => {
  let authRepository: jest.Mocked<
    Pick<
      IAuthRepository,
      | 'findUserForPasswordReset'
      | 'invalidateUnusedPasswordResetTokens'
      | 'createPasswordResetToken'
    >
  >;
  let tokenService: jest.Mocked<
    Pick<
      TokenService,
      | 'generatePasswordResetToken'
      | 'hashToken'
      | 'getPasswordResetExpiryDate'
    >
  >;
  let authMailService: jest.Mocked<Pick<AuthMailService, 'sendPasswordResetEmail'>>;
  let handler: ForgotPasswordHandler;

  const genericMessage = 'If the account exists, a reset email has been sent.';

  beforeEach(() => {
    authRepository = {
      findUserForPasswordReset: jest.fn(),
      invalidateUnusedPasswordResetTokens: jest.fn(),
      createPasswordResetToken: jest.fn(),
    };
    tokenService = {
      generatePasswordResetToken: jest.fn().mockReturnValue('reset-token'),
      hashToken: jest.fn().mockResolvedValue('reset-hash'),
      getPasswordResetExpiryDate: jest.fn().mockReturnValue(new Date('2030-01-01')),
    };
    authMailService = {
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
    };
    handler = new ForgotPasswordHandler(
      authRepository as unknown as IAuthRepository,
      tokenService as unknown as TokenService,
      authMailService as unknown as AuthMailService,
    );
  });

  it('creates a reset token and sends email when the user exists', async () => {
    authRepository.findUserForPasswordReset.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.local',
      firstName: 'Test',
      isActive: true,
      employmentStatus: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-01'),
    } as Awaited<ReturnType<IAuthRepository['findUserForPasswordReset']>>);

    const result = await handler.execute(
      new ForgotPasswordCommand('user@test.local'),
    );

    expect(result.message).toBe(genericMessage);
    expect(authRepository.invalidateUnusedPasswordResetTokens).toHaveBeenCalledWith(
      'user-1',
    );
    expect(authRepository.createPasswordResetToken).toHaveBeenCalledWith({
      userId: 'user-1',
      tokenHash: 'reset-hash',
      expiresAt: new Date('2030-01-01'),
    });
    expect(authMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@test.local',
      'reset-token',
    );
  });

  it('never sends a reset to a login-disabled user, with the same generic response', async () => {
    authRepository.findUserForPasswordReset.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.local',
      firstName: 'Test',
      isActive: false,
      employmentStatus: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-01'),
    } as Awaited<ReturnType<IAuthRepository['findUserForPasswordReset']>>);

    const result = await handler.execute(
      new ForgotPasswordCommand('user@test.local'),
    );

    expect(result.message).toBe(genericMessage);
    expect(authRepository.createPasswordResetToken).not.toHaveBeenCalled();
    expect(authMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('never sends a reset to a separated user (even before the job disables login)', async () => {
    authRepository.findUserForPasswordReset.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.local',
      firstName: 'Test',
      isActive: true,
      employmentStatus: 'SEPARATED',
      emailVerifiedAt: new Date('2026-01-01'),
    } as Awaited<ReturnType<IAuthRepository['findUserForPasswordReset']>>);

    const result = await handler.execute(
      new ForgotPasswordCommand('user@test.local'),
    );

    expect(result.message).toBe(genericMessage);
    expect(authRepository.createPasswordResetToken).not.toHaveBeenCalled();
    expect(authMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('sends reset email for unverified users as well', async () => {
    authRepository.findUserForPasswordReset.mockResolvedValue({
      id: 'user-1',
      email: 'user@test.local',
      firstName: 'Test',
      isActive: true,
      employmentStatus: 'ACTIVE',
      emailVerifiedAt: null,
    } as Awaited<ReturnType<IAuthRepository['findUserForPasswordReset']>>);

    const result = await handler.execute(
      new ForgotPasswordCommand('user@test.local'),
    );

    expect(result.message).toBe(genericMessage);
    expect(authRepository.createPasswordResetToken).toHaveBeenCalled();
    expect(authMailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'user@test.local',
      'reset-token',
    );
  });

  it('returns the same message when the user does not exist', async () => {
    authRepository.findUserForPasswordReset.mockResolvedValue(null);

    const result = await handler.execute(
      new ForgotPasswordCommand('missing@test.local'),
    );

    expect(result.message).toBe(genericMessage);
    expect(authRepository.invalidateUnusedPasswordResetTokens).not.toHaveBeenCalled();
    expect(authRepository.createPasswordResetToken).not.toHaveBeenCalled();
    expect(authMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });
});
