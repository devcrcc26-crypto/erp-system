/**
 * Runtime-safe Prisma enum values.
 * Custom Prisma client output may not expose enums via @prisma/client at runtime.
 */
export const EmailVerificationPurpose = {
  ACCOUNT_ACTIVATION: 'ACCOUNT_ACTIVATION',
  EMAIL_CHANGE: 'EMAIL_CHANGE',
} as const;

export type EmailVerificationPurpose =
  (typeof EmailVerificationPurpose)[keyof typeof EmailVerificationPurpose];
