import { randomBytes } from 'crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AccountActivationService } from '../../../auth/application/services/account-activation.service';
import { PasswordService } from '../../../auth/application/services/password.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { normalizeEmail } from '../../../../shared/utils/email.util';

type AuditContext = { companyId: string; userId: string };

export interface ProvisionInvitedUserInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  branchId?: string;
  departmentId?: string;
  positionId?: string;
  preferredLanguage?: string;
  preferredTimezone?: string;
  preferredDateFormat?: string;
  isActive?: boolean;
}

export interface ProvisionedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

@Injectable()
export class UserProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly accountActivationService: AccountActivationService,
  ) {}

  /**
   * Creates an unverified user pending email activation (no password set).
   */
  async provisionInvitedUser(
    ctx: AuditContext,
    input: ProvisionInvitedUserInput,
  ): Promise<ProvisionedUser> {
    const email = normalizeEmail(input.email);
    const passwordHash = await this.passwordService.hash(
      randomBytes(32).toString('hex'),
    );

    const existing = await this.findUserRecordByEmail(ctx.companyId, email);

    if (existing?.deletedAt === null) {
      throw new ConflictException('Email already in use');
    }

    if (existing) {
      return this.reactivateInvitedUser(ctx, existing.id, input, passwordHash);
    }

    const user = await this.prisma.user.create({
      data: {
        companyId: ctx.companyId,
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || null,
        branchId: input.branchId ?? null,
        departmentId: input.departmentId ?? null,
        positionId: input.positionId ?? null,
        preferredLanguage: input.preferredLanguage ?? null,
        preferredTimezone: input.preferredTimezone ?? null,
        preferredDateFormat: input.preferredDateFormat ?? null,
        isActive: input.isActive ?? true,
        passwordHash,
        emailVerifiedAt: null,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    return user;
  }

  /**
   * Creates a verified user with an admin-supplied password.
   */
  async provisionWithPassword(
    ctx: AuditContext,
    input: ProvisionInvitedUserInput & { password: string },
  ): Promise<ProvisionedUser> {
    const email = normalizeEmail(input.email);
    await this.assertEmailAvailable(ctx.companyId, email);

    const passwordHash = await this.passwordService.hash(input.password);

    const user = await this.prisma.user.create({
      data: {
        companyId: ctx.companyId,
        email,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || null,
        branchId: input.branchId ?? null,
        departmentId: input.departmentId ?? null,
        positionId: input.positionId ?? null,
        preferredLanguage: input.preferredLanguage ?? null,
        preferredTimezone: input.preferredTimezone ?? null,
        preferredDateFormat: input.preferredDateFormat ?? null,
        isActive: input.isActive ?? true,
        passwordHash,
        emailVerifiedAt: new Date(),
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    return user;
  }

  /**
   * Sends the standard account activation invite email.
   */
  async sendActivationInvite(user: ProvisionedUser): Promise<void> {
    await this.accountActivationService.sendInvitation({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
    });
  }

  /**
   * Returns any user record for the email, including soft-deleted rows.
   */
  async findExistingUserByEmail(
    companyId: string,
    email: string,
  ): Promise<{
    id: string;
    emailVerifiedAt: Date | null;
    deletedAt: Date | null;
  } | null> {
    return this.findUserRecordByEmail(companyId, email);
  }

  private async findUserRecordByEmail(
    companyId: string,
    email: string,
  ): Promise<{
    id: string;
    emailVerifiedAt: Date | null;
    deletedAt: Date | null;
  } | null> {
    return this.prisma.user.findFirst({
      where: { companyId, email: normalizeEmail(email) },
      select: { id: true, emailVerifiedAt: true, deletedAt: true },
    });
  }

  private async reactivateInvitedUser(
    ctx: AuditContext,
    userId: string,
    input: ProvisionInvitedUserInput,
    passwordHash: string,
  ): Promise<ProvisionedUser> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        deletedAt: null,
        deletedBy: null,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || null,
        branchId: input.branchId ?? null,
        departmentId: input.departmentId ?? null,
        positionId: input.positionId ?? null,
        preferredLanguage: input.preferredLanguage ?? null,
        preferredTimezone: input.preferredTimezone ?? null,
        preferredDateFormat: input.preferredDateFormat ?? null,
        isActive: input.isActive ?? true,
        passwordHash,
        emailVerifiedAt: null,
        updatedBy: ctx.userId,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });
  }

  private async assertEmailAvailable(
    companyId: string,
    email: string,
  ): Promise<void> {
    const existing = await this.findUserRecordByEmail(companyId, email);
    if (existing?.deletedAt === null) {
      throw new ConflictException('Email already in use');
    }
    if (existing) {
      throw new ConflictException(
        'Email belongs to a deactivated user. Import the user instead of creating manually.',
      );
    }
  }
}
