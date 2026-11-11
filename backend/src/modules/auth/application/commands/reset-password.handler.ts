import { BadRequestException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';
import { ResetPasswordCommand } from './reset-password.command';

@CommandHandler(ResetPasswordCommand)
export class ResetPasswordHandler
  implements ICommandHandler<ResetPasswordCommand, { message: string }>
{
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Resets a user password using a valid one-time reset token.
   */
  async execute(command: ResetPasswordCommand): Promise<{ message: string }> {
    const user = await this.authRepository.findUserForPasswordReset(command.email);

    if (!user || !user.isActive || user.employmentStatus === 'SEPARATED') {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const tokens = await this.authRepository.findActivePasswordResetTokens(
      user.id,
    );

    let matchedTokenId: string | null = null;

    for (const token of tokens) {
      const valid = await this.tokenService.verifyToken(
        command.token,
        token.tokenHash,
      );
      if (valid) {
        matchedTokenId = token.id;
        break;
      }
    }

    if (!matchedTokenId) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await this.passwordService.hash(command.newPassword);

    await this.authRepository.updateUserPassword(user.id, passwordHash);
    if (!user.emailVerifiedAt) {
      await this.authRepository.markEmailVerified(user.id);
    }
    await this.authRepository.markPasswordResetTokenUsed(matchedTokenId);
    await this.authRepository.revokeUserSessions(user.id);

    return { message: 'Password reset successfully' };
  }
}
