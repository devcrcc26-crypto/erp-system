import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { TokenService } from '../services/token.service';
import { ForgotPasswordCommand } from './forgot-password.command';

@CommandHandler(ForgotPasswordCommand)
export class ForgotPasswordHandler
  implements ICommandHandler<ForgotPasswordCommand, { message: string }>
{
  private readonly logger = new Logger(ForgotPasswordHandler.name);

  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Creates a password-reset token. Always returns the same message to avoid email enumeration.
   */
  async execute(command: ForgotPasswordCommand): Promise<{ message: string }> {
    const user = await this.authRepository.findActiveUserByEmail(command.email);

    if (user) {
      const token = this.tokenService.generatePasswordResetToken();
      const tokenHash = await this.tokenService.hashToken(token);

      await this.authRepository.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt: this.tokenService.getPasswordResetExpiryDate(),
      });

      if (process.env.NODE_ENV === 'development') {
        this.logger.debug(
          `Password reset token for ${user.email}: ${token}`,
        );
      }
    }

    return {
      message: 'If the account exists, a reset email has been sent.',
    };
  }
}
