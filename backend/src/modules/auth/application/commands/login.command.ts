import { normalizeEmail } from '../../../../shared/utils/email.util';

export class LoginCommand {
  public readonly email: string;

  constructor(
    email: string,
    public readonly password: string,
    public readonly deviceInfo?: string,
    public readonly ipAddress?: string,
  ) {
    this.email = normalizeEmail(email);
  }
}
