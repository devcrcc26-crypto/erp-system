import { normalizeEmail } from '../../../../shared/utils/email.util';

export class ForgotPasswordCommand {
  public readonly email: string;

  constructor(email: string) {
    this.email = normalizeEmail(email);
  }
}
