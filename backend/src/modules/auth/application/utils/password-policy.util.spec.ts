import { BadRequestException } from '@nestjs/common';
import {
  assertPasswordPolicy,
  generateOneTimePassword,
  generateTemporaryPassword,
} from './password-policy.util';

describe('password-policy.util', () => {
  it('rejects passwords shorter than 8', () => {
    expect(() => assertPasswordPolicy('short', 'Abebe')).toThrow(
      BadRequestException,
    );
  });

  it('rejects password equal to login name (case-insensitive)', () => {
    expect(() =>
      assertPasswordPolicy('Abebe Bekele', 'abebe bekele'),
    ).toThrow(BadRequestException);
  });

  it('accepts a valid password', () => {
    expect(() =>
      assertPasswordPolicy('SecurePass1', 'Abebe Bekele'),
    ).not.toThrow();
  });

  it('generates a 12-char temporary password by default', () => {
    expect(generateTemporaryPassword()).toHaveLength(12);
  });

  it('excludes ambiguous characters (0/O, 1/l/I)', () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateTemporaryPassword(16)).not.toMatch(/[0O1lI]/);
    }
  });

  it('generates an 8-char uppercase OTP excluding 0/O/I/1', () => {
    for (let i = 0; i < 50; i += 1) {
      const otp = generateOneTimePassword(8);
      expect(otp).toHaveLength(8);
      expect(otp).toMatch(/^[A-HJ-NP-Z2-9]+$/);
      expect(otp).not.toMatch(/[0OI1]/);
    }
  });
});
