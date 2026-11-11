import { BadRequestException } from '@nestjs/common';
import { IAuthRepository } from '../../domain/repositories/auth.repository.interface';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';
import { ResetPasswordCommand } from './reset-password.command';
import { ResetPasswordHandler } from './reset-password.handler';

type User = Awaited<ReturnType<IAuthRepository['findUserForPasswordReset']>>;

function makeHandler(user: User) {
  const repo = {
    findUserForPasswordReset: jest.fn().mockResolvedValue(user),
    findActivePasswordResetTokens: jest
      .fn()
      .mockResolvedValue([{ id: 'tok-1', tokenHash: 'hash' }]),
    updateUserPassword: jest.fn(),
    markEmailVerified: jest.fn(),
    markPasswordResetTokenUsed: jest.fn(),
    revokeUserSessions: jest.fn(),
  };
  const passwords = { hash: jest.fn().mockResolvedValue('new-hash') };
  const tokens = { verifyToken: jest.fn().mockResolvedValue(true) };
  const handler = new ResetPasswordHandler(
    repo as unknown as IAuthRepository,
    passwords as unknown as PasswordService,
    tokens as unknown as TokenService,
  );
  return { handler, repo };
}

const command = (): ResetPasswordCommand =>
  new ResetPasswordCommand('user@test.local', 'raw-token', 'N3w-Password!');

describe('ResetPasswordHandler', () => {
  it('resets the password for an active user and revokes sessions', async () => {
    const { handler, repo } = makeHandler({
      id: 'u1',
      isActive: true,
      employmentStatus: 'ACTIVE',
      emailVerifiedAt: new Date(),
    } as User);
    await handler.execute(command());
    expect(repo.updateUserPassword).toHaveBeenCalledWith('u1', 'new-hash');
    expect(repo.revokeUserSessions).toHaveBeenCalledWith('u1');
  });

  it('rejects a login-disabled user and never reactivates them', async () => {
    const { handler, repo } = makeHandler({
      id: 'u1',
      isActive: false,
      employmentStatus: 'ACTIVE',
      emailVerifiedAt: new Date(),
    } as User);
    await expect(handler.execute(command())).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.updateUserPassword).not.toHaveBeenCalled();
    expect(repo).not.toHaveProperty('reactivateUser');
  });

  it('rejects a separated user with the generic error', async () => {
    const { handler, repo } = makeHandler({
      id: 'u1',
      isActive: true,
      employmentStatus: 'SEPARATED',
      emailVerifiedAt: new Date(),
    } as User);
    await expect(handler.execute(command())).rejects.toThrow('Invalid or expired reset token');
    expect(repo.updateUserPassword).not.toHaveBeenCalled();
  });
});
