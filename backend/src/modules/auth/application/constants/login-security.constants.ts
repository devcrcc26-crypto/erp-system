/** Failed password attempts before the account is locked. */
export const AUTH_LOGIN_MAX_FAILED_ATTEMPTS = 5;

/** Account lockout duration after too many failed attempts. */
export const AUTH_LOGIN_LOCKOUT_MINUTES = 15;

/** Minimum password length (new passwords and resets). */
export const AUTH_PASSWORD_MIN_LENGTH = 8;

/** Generic credential failure message - never enumerate accounts. */
export const AUTH_INVALID_CREDENTIALS_MESSAGE =
  'Incorrect name or password';

/** Message when the account is temporarily locked. */
export const AUTH_ACCOUNT_LOCKED_MESSAGE =
  'Incorrect name or password';

/** Audit module name for auth security events. */
export const AUTH_AUDIT_MODULE = 'auth';
