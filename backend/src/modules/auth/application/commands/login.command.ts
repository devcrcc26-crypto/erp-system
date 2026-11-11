import { normalizeEmail } from '../../../../shared/utils/email.util';
import {
  isEmailLoginIdentifier,
  normalizeLoginName,
} from '../utils/login-name.util';

export class LoginCommand {
  public readonly identifier: string;
  public readonly identifierKind: 'email' | 'loginName';
  public readonly email: string | null;
  public readonly loginNameNormalized: string | null;

  constructor(
    identifier: string,
    public readonly password: string,
    public readonly deviceInfo?: string,
    public readonly ipAddress?: string,
  ) {
    const trimmed = identifier.trim();
    if (isEmailLoginIdentifier(trimmed)) {
      this.identifierKind = 'email';
      this.email = normalizeEmail(trimmed);
      this.loginNameNormalized = null;
      this.identifier = this.email;
    } else {
      this.identifierKind = 'loginName';
      this.email = null;
      this.loginNameNormalized = normalizeLoginName(trimmed);
      this.identifier = trimmed;
    }
  }
}
