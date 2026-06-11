import { Inject, Injectable } from '@nestjs/common';
import { EmailVerificationPurpose } from '../../../../shared/prisma/prisma-enums';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import { AuthMailService } from './auth-mail.service';
import { TokenService } from './token.service';

export interface ActivationRecipient {
  id: string;
  email: string;
  firstName: string;
}

@Injectable()
export class AccountActivationService {
  constructor(
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly tokenService: TokenService,
    private readonly authMailService: AuthMailService,
  ) {}

  /**
   * Issues a fresh account-activation token and emails the invite link.
   */
  async sendInvitation(recipient: ActivationRecipient): Promise<void> {
    await this.authRepository.invalidateUnusedEmailVerificationTokens(
      recipient.id,
      EmailVerificationPurpose.ACCOUNT_ACTIVATION,
    );

    const token = this.tokenService.generateEmailVerificationToken();
    const tokenHash = await this.tokenService.hashToken(token);

    await this.authRepository.createEmailVerificationToken({
      userId: recipient.id,
      tokenHash,
      expiresAt: this.tokenService.getEmailVerificationExpiryDate(),
      purpose: EmailVerificationPurpose.ACCOUNT_ACTIVATION,
    });

    await this.authMailService.sendActivationEmail(
      recipient.email,
      token,
      recipient.firstName,
    );
  }
}
