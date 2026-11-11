import { BadRequestException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { AUTH_PASSWORD_MIN_LENGTH } from '../constants/login-security.constants';
import { normalizeLoginName } from './login-name.util';

/**
 * Validates password length and that it is not equal to the login name.
 */
export function assertPasswordPolicy(
  password: string,
  loginName: string | null | undefined,
): void {
  if (password.length < AUTH_PASSWORD_MIN_LENGTH) {
    throw new BadRequestException(
      `Password must be at least ${AUTH_PASSWORD_MIN_LENGTH} characters`,
    );
  }

  if (
    loginName &&
    normalizeLoginName(password) === normalizeLoginName(loginName)
  ) {
    throw new BadRequestException('Password must not equal the login name');
  }
}

/**
 * Generates a random temporary password (alphanumeric, length chars).
 * Never logs the result - caller must handle display securely.
 */
export function generateTemporaryPassword(length = 12): string {
  const alphabet =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i += 1) {
    result += alphabet[bytes[i]! % alphabet.length];
  }
  return result;
}
