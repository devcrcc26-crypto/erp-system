import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { EmailVerificationPurpose } from '../../../../shared/prisma/prisma-enums';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { DocumentService } from '../../../documents/application/services/document.service';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import {
  ProfileResponseDto,
  UpdateProfileDto,
} from '../dtos/profile.dto';
import { AuthMailService } from './auth-mail.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

type SessionContext = {
  userId: string;
  companyId: string;
  sessionId: string;
};

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AUTH_REPOSITORY)
    private readonly authRepository: IAuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly authMailService: AuthMailService,
    private readonly documentService: DocumentService,
  ) {}

  /**
   * Returns the authenticated user's profile with role names.
   */
  async getProfile(ctx: SessionContext): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: ctx.userId, companyId: ctx.companyId }),
      include: {
        company: { select: { legalName: true } },
        userRoles: {
          where: activeOnly({}),
          include: { role: { select: { id: true, name: true } } },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapProfile(user);
  }

  /**
   * Presigned download URL for the signed-in user's profile picture.
   */
  async getProfilePhotoDownloadUrl(
    ctx: SessionContext,
  ): Promise<{ url: string; expiresIn: number }> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: ctx.userId, companyId: ctx.companyId }),
      select: { photoDocumentId: true },
    });
    if (!user?.photoDocumentId) {
      throw new NotFoundException('Profile photo not found');
    }
    return this.documentService.getDownloadUrl(ctx, user.photoDocumentId);
  }

  /**
   * Updates editable profile fields for the authenticated user.
   */
  async updateProfile(
    ctx: SessionContext,
    dto: UpdateProfileDto,
  ): Promise<ProfileResponseDto> {
    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: {
        ...dto,
        updatedBy: ctx.userId,
      },
    });

    return this.getProfile(ctx);
  }

  /**
   * Changes password after verifying the current password.
   */
  async changePassword(
    ctx: SessionContext,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const user = await this.authRepository.findActiveUserById(ctx.userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const valid = await this.passwordService.verify(
      currentPassword,
      user.passwordHash,
    );

    if (!valid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await this.passwordService.hash(newPassword);
    await this.authRepository.updateUserPassword(ctx.userId, passwordHash);
    await this.authRepository.revokeUserSessionsExcept(
      ctx.userId,
      ctx.sessionId,
    );

    return { message: 'Password changed successfully' };
  }

  /**
   * Starts an email change by sending a confirmation link to the new address.
   */
  async requestEmailChange(
    ctx: SessionContext,
    newEmail: string,
  ): Promise<{ message: string }> {
    const user = await this.authRepository.findActiveUserById(ctx.userId);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.email) {
      throw new ConflictException(
        'This account has no email address and cannot use email change',
      );
    }

    if (user.email.toLowerCase() === newEmail.toLowerCase()) {
      throw new ConflictException('New email must differ from the current email');
    }

    const existing = await this.prisma.user.findFirst({
      where: activeOnly({
        companyId: ctx.companyId,
        email: newEmail,
      }),
    });

    if (existing) {
      throw new ConflictException('Email already in use');
    }

    await this.authRepository.setUserPendingEmail(ctx.userId, newEmail);
    await this.authRepository.invalidateUnusedEmailVerificationTokens(
      ctx.userId,
      EmailVerificationPurpose.EMAIL_CHANGE,
    );

    const token = this.tokenService.generateEmailVerificationToken();
    const tokenHash = await this.tokenService.hashToken(token);

    await this.authRepository.createEmailVerificationToken({
      userId: ctx.userId,
      tokenHash,
      expiresAt: this.tokenService.getEmailVerificationExpiryDate(),
      purpose: EmailVerificationPurpose.EMAIL_CHANGE,
    });

    await this.authMailService.sendEmailChangeConfirmation(newEmail, token);

    return {
      message: 'Confirmation email sent to the new address',
    };
  }

  /**
   * Completes a pending email change using a one-time token.
   */
  async confirmEmailChange(token: string): Promise<{ message: string }> {
    const tokens =
      await this.authRepository.findActiveEmailVerificationTokensByPurpose(
        EmailVerificationPurpose.EMAIL_CHANGE,
      );

    let matchedTokenId: string | null = null;
    let userId: string | null = null;

    for (const entry of tokens) {
      const valid = await this.tokenService.verifyToken(token, entry.tokenHash);
      if (valid) {
        matchedTokenId = entry.id;
        userId = entry.userId;
        break;
      }
    }

    if (!matchedTokenId || !userId) {
      throw new UnauthorizedException('Invalid or expired confirmation token');
    }

    const user = await this.authRepository.findActiveUserById(userId);

    if (!user?.pendingEmail) {
      throw new UnauthorizedException('Invalid or expired confirmation token');
    }

    const duplicate = await this.prisma.user.findFirst({
      where: activeOnly({
        companyId: user.companyId,
        email: user.pendingEmail,
      }),
    });

    if (duplicate && duplicate.id !== userId) {
      throw new ConflictException('Email already in use');
    }

    await this.authRepository.updateUserEmail(userId, user.pendingEmail);
    await this.authRepository.markEmailVerificationTokenUsed(matchedTokenId);

    return { message: 'Email address updated successfully' };
  }

  private mapProfile(user: {
    id: string;
    email: string | null;
    pendingEmail: string | null;
    firstName: string;
    lastName: string;
    chineseName: string | null;
    phone: string | null;
    companyId: string;
    preferredLanguage: string | null;
    preferredTimezone: string | null;
    preferredDateFormat: string | null;
    emailVerifiedAt: Date | null;
    photoDocumentId: string | null;
    company: { legalName: string };
    userRoles: Array<{ role: { id: string; name: string } }>;
  }): ProfileResponseDto {
    return {
      id: user.id,
      email: user.email ?? '',
      pendingEmail: user.pendingEmail,
      firstName: user.firstName,
      lastName: user.lastName,
      chineseName: user.chineseName,
      phone: user.phone,
      companyId: user.companyId,
      companyName: user.company.legalName,
      preferredLanguage: user.preferredLanguage,
      preferredTimezone: user.preferredTimezone,
      preferredDateFormat: user.preferredDateFormat,
      emailVerifiedAt: user.emailVerifiedAt,
      photoDocumentId: user.photoDocumentId,
      roles: user.userRoles.map((assignment) => ({
        id: assignment.role.id,
        name: assignment.role.name,
      })),
    };
  }
}
