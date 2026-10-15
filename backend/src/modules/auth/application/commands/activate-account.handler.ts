import {
  BadRequestException,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import { EmailVerificationPurpose } from '../../../../shared/prisma/prisma-enums';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { PasswordService } from '../services/password.service';
import { TokenService } from '../services/token.service';
import { ActivateAccountCommand } from './activate-account.command';

@CommandHandler(ActivateAccountCommand)
export class ActivateAccountHandler
  implements ICommandHandler<ActivateAccountCommand, { message: string }>
{
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Verifies an activation token, sets the user password, and marks email verified.
   */
  async execute(command: ActivateAccountCommand): Promise<{ message: string }> {
    const tokens =
      await this.authRepository.findActiveEmailVerificationTokensByPurpose(
        EmailVerificationPurpose.ACCOUNT_ACTIVATION,
      );

    let matchedTokenId: string | null = null;
    let userId: string | null = null;

    for (const entry of tokens) {
      const valid = await this.tokenService.verifyToken(
        command.token,
        entry.tokenHash,
      );
      if (valid) {
        matchedTokenId = entry.id;
        userId = entry.userId;
        break;
      }
    }

    if (!matchedTokenId || !userId) {
      throw new BadRequestException('Invalid or expired activation token');
    }

    const user = await this.authRepository.findActiveUserById(userId);

    // Only a never-activated invitation on an enabled, non-separated account.
    if (!user || !user.isActive || user.employmentStatus === 'SEPARATED') {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerifiedAt) {
      throw new BadRequestException('Account is already activated');
    }

    const passwordHash = await this.passwordService.hash(command.newPassword);

    await this.authRepository.updateUserPassword(userId, passwordHash);
    await this.authRepository.markEmailVerified(userId);
    await this.authRepository.markEmailVerificationTokenUsed(matchedTokenId);

    return {
      message: 'Account activated successfully. You can now sign in.',
    };
  }
}
