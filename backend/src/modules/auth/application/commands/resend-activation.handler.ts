import { Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { AccountActivationService } from '../services/account-activation.service';
import { ResendActivationCommand } from './resend-activation.command';

@CommandHandler(ResendActivationCommand)
export class ResendActivationHandler
  implements ICommandHandler<ResendActivationCommand, { message: string }>
{
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly accountActivationService: AccountActivationService,
  ) {}

  /**
   * Resends an activation email when the account exists and is not yet verified.
   */
  async execute(command: ResendActivationCommand): Promise<{ message: string }> {
    const user = await this.authRepository.findActiveUserByEmail(command.email);

    if (
      user &&
      user.isActive &&
      user.employmentStatus !== 'SEPARATED' &&
      user.email &&
      !user.emailVerifiedAt
    ) {
      await this.accountActivationService.sendInvitation({
        id: user.id,
        email: user.email,
        firstName: user.firstName,
      });
    }

    return {
      message:
        'If the account exists and is not yet activated, a new activation email has been sent.',
    };
  }
}
