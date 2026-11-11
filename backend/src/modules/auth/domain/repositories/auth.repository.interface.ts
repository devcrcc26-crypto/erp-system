import { User, UserSession } from '@prisma/client';
import type { EmailVerificationPurpose } from '../../../../shared/prisma/prisma-enums';

export type { EmailVerificationPurpose };

export const AUTH_REPOSITORY = Symbol('AUTH_REPOSITORY');

export interface UserWithCompany extends User {
  company: {
    id: string;
    legalName: string;
    defaultLanguage: string;
    defaultTimezone: string;
    defaultDateFormat: string;
  };
}

export interface CreateSessionInput {
  userId: string;
  companyId: string;
  refreshTokenHash: string;
  deviceInfo?: string;
  ipAddress?: string;
  expiresAt: Date;
}

export interface CreatePasswordResetInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface CreateEmailVerificationInput {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  purpose: EmailVerificationPurpose;
}

export interface IAuthRepository {
  findActiveUserByEmail(email: string): Promise<UserWithCompany | null>;
  findActiveUserByLoginNameNormalized(
    loginNameNormalized: string,
  ): Promise<UserWithCompany | null>;
  findUserForPasswordReset(email: string): Promise<UserWithCompany | null>;
  findActiveUserById(userId: string): Promise<UserWithCompany | null>;
  findSessionById(sessionId: string): Promise<UserSession | null>;
  createSession(input: CreateSessionInput): Promise<UserSession>;
  updateSessionRefreshToken(
    sessionId: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<UserSession>;
  touchSession(sessionId: string): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  updateUserLastLogin(userId: string): Promise<void>;
  updateUserPassword(userId: string, passwordHash: string): Promise<void>;
  createPasswordResetToken(input: CreatePasswordResetInput): Promise<void>;
  findActivePasswordResetTokens(userId: string): Promise<
    Array<{
      id: string;
      tokenHash: string;
    }>
  >;
  markPasswordResetTokenUsed(tokenId: string): Promise<void>;
  invalidateUnusedPasswordResetTokens(userId: string): Promise<void>;
  createEmailVerificationToken(input: CreateEmailVerificationInput): Promise<void>;
  findActiveEmailVerificationTokens(
    userId: string,
    purpose: EmailVerificationPurpose,
  ): Promise<Array<{ id: string; tokenHash: string }>>;
  findActiveEmailVerificationTokensByPurpose(
    purpose: EmailVerificationPurpose,
  ): Promise<Array<{ id: string; userId: string; tokenHash: string }>>;
  markEmailVerificationTokenUsed(tokenId: string): Promise<void>;
  invalidateUnusedEmailVerificationTokens(
    userId: string,
    purpose: EmailVerificationPurpose,
  ): Promise<void>;
  markEmailVerified(userId: string): Promise<void>;
  setUserPendingEmail(userId: string, pendingEmail: string | null): Promise<void>;
  updateUserEmail(userId: string, email: string): Promise<void>;
  revokeUserSessions(userId: string): Promise<void>;
  revokeUserSessionsExcept(userId: string, exceptSessionId: string): Promise<void>;
}
