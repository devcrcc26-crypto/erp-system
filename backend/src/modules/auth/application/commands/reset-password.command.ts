import { normalizeEmail } from '../../../../shared/utils/email.util';

export class ResetPasswordCommand {
  public readonly email: string;
  public readonly token: string;

  constructor(
    email: string,
    token: string,
    public readonly newPassword: string,
  ) {
    this.email = normalizeEmail(email);
    this.token = token.trim();
  }
}
