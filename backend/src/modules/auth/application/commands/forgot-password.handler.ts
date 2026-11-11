import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { AuthMailService } from '../services/auth-mail.service';
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
    private readonly authMailService: AuthMailService,
  ) {}

  /**
   * Creates a password-reset token. Always returns the same message to avoid email enumeration.
   */
  async execute(command: ForgotPasswordCommand): Promise<{ message: string }> {
    const found = await this.authRepository.findUserForPasswordReset(command.email);
    // Login-disabled or separated accounts get nothing; the response stays identical.
    const user =
      found && found.isActive && found.employmentStatus !== 'SEPARATED' ? found : null;

    if (!user) {
      if (process.env.NODE_ENV === 'development') {
        this.logger.warn(
          `No account matched forgot-password request for ${command.email}. ` +
            'Confirm the email is correct and the user was not deleted from Team.',
        );
      }
    } else {
      await this.authRepository.invalidateUnusedPasswordResetTokens(user.id);

      const token = this.tokenService.generatePasswordResetToken();
      const tokenHash = await this.tokenService.hashToken(token);

      await this.authRepository.createPasswordResetToken({
        userId: user.id,
        tokenHash,
        expiresAt: this.tokenService.getPasswordResetExpiryDate(),
      });

      if (user.email) {
        await this.authMailService.sendPasswordResetEmail(user.email, token);
      }
    }

    return {
      message: 'If the account exists, a reset email has been sent.',
    };
  }
}
