import { Injectable } from '@nestjs/common';
import { AuditLogSource } from '@prisma/client';
import { AuditService } from '../../../audit/application/services/audit.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  AUTH_AUDIT_MODULE,
  AUTH_LOGIN_LOCKOUT_MINUTES,
  AUTH_LOGIN_MAX_FAILED_ATTEMPTS,
} from '../constants/login-security.constants';

export interface LoginFailureContext {
  userId?: string;
  companyId?: string;
  ipAddress?: string;
  identifierKind: 'email' | 'loginName' | 'unknown';
  reason: 'invalid_credentials' | 'locked' | 'no_password';
}

/**
 * Tracks failed login attempts and applies per-account lockouts.
 * IP rate limiting is enforced by the auth controller Throttler as well.
 */
@Injectable()
export class LoginLockoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Returns true when the account is currently locked.
   */
  isLocked(lockedUntil: Date | null | undefined): boolean {
    return Boolean(lockedUntil && lockedUntil.getTime() > Date.now());
  }

  /**
   * Clears failed-attempt counters after a successful login.
   */
  async clearFailures(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  /**
   * Records a failed login for a known user; locks after max attempts.
   * Returns whether the account is now locked.
   */
  async recordFailedAttempt(
    userId: string,
    companyId: string,
    currentAttempts: number,
    ipAddress?: string,
  ): Promise<{ locked: boolean; attempts: number }> {
    const nextAttempts = currentAttempts + 1;
    const shouldLock = nextAttempts >= AUTH_LOGIN_MAX_FAILED_ATTEMPTS;
    const lockedUntil = shouldLock
      ? new Date(Date.now() + AUTH_LOGIN_LOCKOUT_MINUTES * 60_000)
      : null;

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        failedLoginAttempts: nextAttempts,
        lockedUntil,
      },
    });

    await this.auditService.create({
      userId,
      companyId,
      module: AUTH_AUDIT_MODULE,
      action: shouldLock ? 'LOGIN_LOCKED' : 'LOGIN_FAILED',
      recordType: 'User',
      recordId: userId,
      afterValue: {
        attempts: nextAttempts,
        locked: shouldLock,
        lockoutMinutes: shouldLock ? AUTH_LOGIN_LOCKOUT_MINUTES : undefined,
      },
      ipAddress,
      source: AuditLogSource.USER_ACTION,
    });

    return { locked: shouldLock, attempts: nextAttempts };
  }

  /**
   * Audits a failed attempt when no user was resolved (no enumeration).
   */
  async auditUnknownFailure(ctx: LoginFailureContext): Promise<void> {
    if (!ctx.companyId) {
      return;
    }

    await this.auditService.create({
      companyId: ctx.companyId,
      module: AUTH_AUDIT_MODULE,
      action: 'LOGIN_FAILED',
      recordType: 'User',
      recordId: ctx.userId ?? 'unknown',
      afterValue: {
        identifierKind: ctx.identifierKind,
        reason: ctx.reason,
      },
      ipAddress: ctx.ipAddress,
      source: AuditLogSource.USER_ACTION,
    });
  }

  /**
   * Audits that a locked account was presented credentials again.
   */
  async auditLockedAttempt(
    userId: string,
    companyId: string,
    ipAddress?: string,
  ): Promise<void> {
    await this.auditService.create({
      userId,
      companyId,
      module: AUTH_AUDIT_MODULE,
      action: 'LOGIN_LOCKED',
      recordType: 'User',
      recordId: userId,
      afterValue: { reason: 'still_locked' },
      ipAddress,
      source: AuditLogSource.USER_ACTION,
    });
  }
}
