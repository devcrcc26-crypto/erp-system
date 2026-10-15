import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { normalizeEmail } from '../../../../shared/utils/email.util';
import type { EmailVerificationPurpose } from '../../../../shared/prisma/prisma-enums';
import {
  CreateEmailVerificationInput,
  CreatePasswordResetInput,
  CreateSessionInput,
  IAuthRepository,
  UserWithCompany,
} from '../../domain/repositories/auth.repository.interface';

@Injectable()
export class AuthRepository implements IAuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveUserByEmail(email: string): Promise<UserWithCompany | null> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    return this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        employmentStatus: { not: 'SEPARATED' },
        email: {
          equals: normalizedEmail,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      include: this.userCompanyInclude(),
    });
  }

  async findActiveUserByLoginNameNormalized(
    loginNameNormalized: string,
  ): Promise<UserWithCompany | null> {
    if (!loginNameNormalized) {
      return null;
    }

    return this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        employmentStatus: { not: 'SEPARATED' },
        loginNameNormalized,
      },
      include: this.userCompanyInclude(),
    });
  }

  async findUserForPasswordReset(email: string): Promise<UserWithCompany | null> {
    const normalizedEmail = normalizeEmail(email);
    if (!normalizedEmail) {
      return null;
    }

    // Login-disabled or separated accounts never get a reset (and are never reactivated by one).
    return this.prisma.user.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        employmentStatus: { not: 'SEPARATED' },
        email: {
          equals: normalizedEmail,
          mode: Prisma.QueryMode.insensitive,
        },
      },
      include: this.userCompanyInclude(),
    });
  }

  async findActiveUserById(userId: string): Promise<UserWithCompany | null> {
    return this.prisma.user.findFirst({
      where: activeOnly({
        id: userId,
        isActive: true,
        employmentStatus: { not: 'SEPARATED' as const },
      }),
      include: this.userCompanyInclude(),
    });
  }

  private userCompanyInclude(): {
    company: {
      select: {
        id: true;
        legalName: true;
        defaultLanguage: true;
        defaultTimezone: true;
        defaultDateFormat: true;
      };
    };
  } {
    return {
      company: {
        select: {
          id: true,
          legalName: true,
          defaultLanguage: true,
          defaultTimezone: true,
          defaultDateFormat: true,
        },
      },
    };
  }

  async findSessionById(sessionId: string): Promise<import('@prisma/client').UserSession | null> {
    return this.prisma.userSession.findUnique({
      where: { id: sessionId },
    });
  }

  async createSession(input: CreateSessionInput): Promise<import('@prisma/client').UserSession> {
    return this.prisma.userSession.create({
      data: {
        userId: input.userId,
        companyId: input.companyId,
        refreshTokenHash: input.refreshTokenHash,
        deviceInfo: input.deviceInfo,
        ipAddress: input.ipAddress,
        expiresAt: input.expiresAt,
      },
    });
  }

  async updateSessionRefreshToken(
    sessionId: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<import('@prisma/client').UserSession> {
    return this.prisma.userSession.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash,
        expiresAt,
        lastUsedAt: new Date(),
      },
    });
  }

  async touchSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { lastUsedAt: new Date() },
    });
  }

  async deleteSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.delete({
      where: { id: sessionId },
    });
  }

  async updateUserLastLogin(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLogin: new Date() },
    });
  }

  async updateUserPassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: false,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async createPasswordResetToken(input: CreatePasswordResetInput): Promise<void> {
    await this.prisma.passwordResetToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findActivePasswordResetTokens(userId: string): Promise<
    Array<{ id: string; tokenHash: string }>
  > {
    return this.prisma.passwordResetToken.findMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, tokenHash: true },
    });
  }

  async markPasswordResetTokenUsed(tokenId: string): Promise<void> {
    await this.prisma.passwordResetToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    });
  }

  async invalidateUnusedPasswordResetTokens(userId: string): Promise<void> {
    await this.prisma.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
  }

  async createEmailVerificationToken(
    input: CreateEmailVerificationInput,
  ): Promise<void> {
    await this.prisma.emailVerificationToken.create({
      data: {
        userId: input.userId,
        tokenHash: input.tokenHash,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
      },
    });
  }

  async findActiveEmailVerificationTokens(
    userId: string,
    purpose: EmailVerificationPurpose,
  ): Promise<Array<{ id: string; tokenHash: string }>> {
    return this.prisma.emailVerificationToken.findMany({
      where: {
        userId,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, tokenHash: true },
    });
  }

  async findActiveEmailVerificationTokensByPurpose(
    purpose: EmailVerificationPurpose,
  ): Promise<Array<{ id: string; userId: string; tokenHash: string }>> {
    return this.prisma.emailVerificationToken.findMany({
      where: {
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true, userId: true, tokenHash: true },
    });
  }

  async markEmailVerificationTokenUsed(tokenId: string): Promise<void> {
    await this.prisma.emailVerificationToken.update({
      where: { id: tokenId },
      data: { usedAt: new Date() },
    });
  }

  async invalidateUnusedEmailVerificationTokens(
    userId: string,
    purpose: EmailVerificationPurpose,
  ): Promise<void> {
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        userId,
        purpose,
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      data: { usedAt: new Date() },
    });
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    });
  }

  async setUserPendingEmail(
    userId: string,
    pendingEmail: string | null,
  ): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { pendingEmail },
    });
  }

  async updateUserEmail(userId: string, email: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { email, pendingEmail: null },
    });
  }

  async revokeUserSessions(userId: string): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: { userId },
    });
  }

  async revokeUserSessionsExcept(
    userId: string,
    exceptSessionId: string,
  ): Promise<void> {
    await this.prisma.userSession.deleteMany({
      where: {
        userId,
        id: { not: exceptSessionId },
      },
    });
  }
}
