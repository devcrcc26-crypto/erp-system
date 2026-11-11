import {
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';
import { ActivateAccountCommand } from './activate-account.command';
import { ActivateAccountHandler } from './activate-account.handler';

describe('ActivateAccountHandler', () => {
  let authRepository: jest.Mocked<
    Pick<
      IAuthRepository,
      | 'findActiveEmailVerificationTokensByPurpose'
      | 'findActiveUserById'
      | 'updateUserPassword'
      | 'markEmailVerified'
      | 'markEmailVerificationTokenUsed'
    >
  >;
  let passwordService: jest.Mocked<Pick<PasswordService, 'hash'>>;
  let tokenService: jest.Mocked<Pick<TokenService, 'verifyToken'>>;
  let handler: ActivateAccountHandler;

  beforeEach(() => {
    authRepository = {
      findActiveEmailVerificationTokensByPurpose: jest.fn(),
      findActiveUserById: jest.fn(),
      updateUserPassword: jest.fn(),
      markEmailVerified: jest.fn(),
      markEmailVerificationTokenUsed: jest.fn(),
    };
    passwordService = {
      hash: jest.fn().mockResolvedValue('new-hash'),
    };
    tokenService = {
      verifyToken: jest.fn(),
    };

    handler = new ActivateAccountHandler(
      authRepository as unknown as IAuthRepository,
      passwordService as unknown as PasswordService,
      tokenService as unknown as TokenService,
    );
  });

  it('activates an unverified account with a valid token', async () => {
    authRepository.findActiveEmailVerificationTokensByPurpose.mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hash-1',
      },
    ]);
    tokenService.verifyToken.mockResolvedValue(true);
    authRepository.findActiveUserById.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      employmentStatus: 'ACTIVE',
      emailVerifiedAt: null,
    } as Awaited<ReturnType<IAuthRepository['findActiveUserById']>>);

    const result = await handler.execute(
      new ActivateAccountCommand('plain-token', 'NewPassword1'),
    );

    expect(result.message).toContain('activated successfully');
    expect(passwordService.hash).toHaveBeenCalledWith('NewPassword1');
    expect(authRepository.updateUserPassword).toHaveBeenCalledWith(
      'user-1',
      'new-hash',
    );
    expect(authRepository.markEmailVerified).toHaveBeenCalledWith('user-1');
    expect(authRepository.markEmailVerificationTokenUsed).toHaveBeenCalledWith(
      'token-1',
    );
  });

  it('throws when the activation token is invalid', async () => {
    authRepository.findActiveEmailVerificationTokensByPurpose.mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hash-1',
      },
    ]);
    tokenService.verifyToken.mockResolvedValue(false);

    await expect(
      handler.execute(new ActivateAccountCommand('bad-token', 'NewPassword1')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws when the user no longer exists', async () => {
    authRepository.findActiveEmailVerificationTokensByPurpose.mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hash-1',
      },
    ]);
    tokenService.verifyToken.mockResolvedValue(true);
    authRepository.findActiveUserById.mockResolvedValue(null);

    await expect(
      handler.execute(new ActivateAccountCommand('plain-token', 'NewPassword1')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws when the account is already activated', async () => {
    authRepository.findActiveEmailVerificationTokensByPurpose.mockResolvedValue([
      {
        id: 'token-1',
        userId: 'user-1',
        tokenHash: 'hash-1',
      },
    ]);
    tokenService.verifyToken.mockResolvedValue(true);
    authRepository.findActiveUserById.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      employmentStatus: 'ACTIVE',
      emailVerifiedAt: new Date('2026-01-01'),
    } as Awaited<ReturnType<IAuthRepository['findActiveUserById']>>);

    await expect(
      handler.execute(new ActivateAccountCommand('plain-token', 'NewPassword1')),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('never activates a separated account', async () => {
    authRepository.findActiveEmailVerificationTokensByPurpose.mockResolvedValue([
      { id: 'token-1', userId: 'user-1', tokenHash: 'hash-1' },
    ]);
    tokenService.verifyToken.mockResolvedValue(true);
    authRepository.findActiveUserById.mockResolvedValue({
      id: 'user-1',
      isActive: true,
      employmentStatus: 'SEPARATED',
      emailVerifiedAt: null,
    } as Awaited<ReturnType<IAuthRepository['findActiveUserById']>>);

    await expect(
      handler.execute(new ActivateAccountCommand('plain-token', 'NewPassword1')),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(authRepository.updateUserPassword).not.toHaveBeenCalled();
  });
});
