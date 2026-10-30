import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { FolderContextType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { EmailVerificationPurpose } from '../../../../shared/prisma/prisma-enums';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { hasDirectReports } from '../../../../shared/org/team-scope.util';
import { DocumentService } from '../../../documents/application/services/document.service';
import {
  AUTH_REPOSITORY,
  IAuthRepository,
} from '../../domain/repositories/auth.repository.interface';
import {
  ProfileEmergencyContactDto,
  ProfileResponseDto,
  UpdateProfileDto,
} from '../dtos/profile.dto';
import { assertPasswordPolicy } from '../utils/password-policy.util';
import { AuthMailService } from './auth-mail.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { currentYearsOfExperience } from '../../../user-management/domain/years-of-experience';

type SessionContext = {
  userId: string;
  companyId: string;
  sessionId: string;
};

const PROFILE_INCLUDE = {
  company: { select: { legalName: true } },
  userRoles: {
    where: { deletedAt: null },
    include: { role: { select: { id: true, name: true } } },
    orderBy: [{ isPrimary: 'desc' }, { assignedAt: 'asc' }],
  },
  department: { select: { name: true, nameZh: true } },
  position: { select: { title: true, titleZh: true } },
  seniorityLevel: { select: { name: true, nameZh: true } },
  branch: { select: { name: true } },
  reportsTo: { select: { firstName: true, lastName: true, chineseName: true } },
} satisfies Prisma.UserInclude;

type ProfileUser = Prisma.UserGetPayload<{ include: typeof PROFILE_INCLUDE }>;

/** Profile documents list shape (same fields as the HR employee documents list). */
const PROFILE_DOCUMENT_SELECT = {
  id: true,
  name: true,
  fileType: true,
  fileSizeBytes: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

function toDateOnly(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/** Emergency contacts are stored as JSON; keep only well-formed entries. */
function normalizeEmergencyContacts(
  value: Prisma.JsonValue | null,
): ProfileEmergencyContactDto[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((entry): ProfileEmergencyContactDto[] => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      return [];
    }
    const record = entry as Record<string, unknown>;
    const text = (key: string): string | null => {
      const raw = record[key];
      return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
    };
    const firstName = text('firstName');
    const lastName = text('lastName');
    if (!firstName && !lastName) {
      return [];
    }
    return [
      {
        firstName: firstName ?? '',
        middleName: text('middleName'),
        lastName: lastName ?? '',
        phone: text('phone'),
        email: text('email'),
        relationship: text('relationship'),
      },
    ];
  });
}

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
   * Returns the authenticated user's profile with role names and their
   * read-only employment record (organisation, identity, address, contacts).
   */
  async getProfile(ctx: SessionContext): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: ctx.userId, companyId: ctx.companyId }),
      include: PROFILE_INCLUDE,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return {
      ...this.mapProfile(user),
      hasDirectReports: await hasDirectReports(
        this.prisma,
        ctx.userId,
        ctx.companyId,
      ),
    };
  }

  /**
   * Lists the signed-in user's own profile documents (read-only).
   * Returns an empty list when no profile folder has been created yet.
   */
  async listMyDocuments(ctx: SessionContext): Promise<unknown[]> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: ctx.userId, companyId: ctx.companyId }),
      select: { profileFolderId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.profileFolderId) {
      return [];
    }
    return this.prisma.document.findMany({
      where: activeOnly({
        companyId: ctx.companyId,
        folderId: user.profileFolderId,
        isCurrent: true,
      }),
      orderBy: { createdAt: 'desc' },
      select: PROFILE_DOCUMENT_SELECT,
    });
  }

  /**
   * Presigned download URL for one of the signed-in user's own profile
   * documents. The document must live in the user's profile folder.
   */
  async getMyDocumentDownloadUrl(
    ctx: SessionContext,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: ctx.userId, companyId: ctx.companyId }),
      select: { profileFolderId: true },
    });
    if (!user?.profileFolderId) {
      throw new NotFoundException('Document not found');
    }
    const document = await this.prisma.document.findFirst({
      where: activeOnly({
        id: documentId,
        companyId: ctx.companyId,
        folderId: user.profileFolderId,
      }),
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return this.documentService.getDownloadUrl(ctx, documentId);
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

  private static readonly PROFILE_PHOTO_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  /**
   * Uploads or replaces the signed-in user's profile picture.
   */
  async uploadProfilePhoto(
    ctx: SessionContext,
    file: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ): Promise<ProfileResponseDto> {
    if (!ProfileService.PROFILE_PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Profile photo must be a JPEG, PNG, WebP, or GIF image',
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Profile photo must be 5 MB or smaller');
    }

    const existing = await this.prisma.user.findFirst({
      where: activeOnly({ id: ctx.userId, companyId: ctx.companyId }),
      select: {
        id: true,
        photoDocumentId: true,
        profileFolderId: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    let folderId = existing.profileFolderId;
    if (!folderId) {
      const folderName =
        `${existing.firstName} ${existing.lastName}`.trim() || 'Employee Profile';
      const folder = await this.prisma.documentFolder.create({
        data: {
          id: randomUUID(),
          companyId: ctx.companyId,
          parentId: null,
          name: folderName,
          path: `/Employee Profiles/${ctx.userId}`,
          contextType: FolderContextType.EMPLOYEE_PROFILE,
          contextId: ctx.userId,
          isSystem: false,
          createdBy: ctx.userId,
          updatedBy: ctx.userId,
        },
        select: { id: true },
      });
      folderId = folder.id;
      await this.prisma.user.update({
        where: { id: ctx.userId },
        data: { profileFolderId: folderId, updatedBy: ctx.userId },
      });
    }

    const uploaded = (await this.documentService.uploadDocument(
      ctx,
      folderId,
      file,
    )) as { id: string };

    await this.prisma.document.update({
      where: { id: uploaded.id },
      data: { name: 'Profile photo', updatedBy: ctx.userId },
    });

    await this.prisma.user.update({
      where: { id: ctx.userId },
      data: {
        photoDocumentId: uploaded.id,
        updatedBy: ctx.userId,
      },
    });

    if (existing.photoDocumentId && existing.photoDocumentId !== uploaded.id) {
      await this.documentService.deleteDocument(ctx, existing.photoDocumentId);
    }

    return this.getProfile(ctx);
  }

  /**
   * Removes the signed-in user's profile picture.
   */
  async deleteProfilePhoto(ctx: SessionContext): Promise<ProfileResponseDto> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: ctx.userId, companyId: ctx.companyId }),
      select: { photoDocumentId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.photoDocumentId) {
      const documentId = user.photoDocumentId;
      await this.prisma.user.update({
        where: { id: ctx.userId },
        data: { photoDocumentId: null, updatedBy: ctx.userId },
      });
      await this.documentService.deleteDocument(ctx, documentId);
    }
    return this.getProfile(ctx);
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

    assertPasswordPolicy(newPassword, user.loginName);

    const valid = await this.passwordService.verify(
      currentPassword,
      user.passwordHash,
    );

    if (!valid) {
      // 400, not 401: the session is valid. A 401 makes the client refresh the
      // session and resend the change (and log the user out if that fails).
      throw new BadRequestException('Current password is incorrect');
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

  private mapProfile(
    user: ProfileUser,
  ): Omit<ProfileResponseDto, 'hasDirectReports'> {
    const reportsToName = user.reportsTo
      ? `${user.reportsTo.firstName} ${user.reportsTo.lastName}`.trim()
      : null;

    return {
      id: user.id,
      email: user.email ?? '',
      loginName: user.loginName,
      pendingEmail: user.pendingEmail,
      firstName: user.firstName,
      lastName: user.lastName,
      chineseName: user.chineseName,
      mustChangePassword: user.mustChangePassword,
      excludedFromHrProcesses: user.excludedFromHrProcesses,
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
        isPrimary: assignment.isPrimary,
      })),
      employeeId: user.employeeId,
      middleName: user.middleName,
      departmentName: user.department?.name ?? null,
      departmentNameZh: user.department?.nameZh ?? null,
      positionTitle: user.position?.title ?? null,
      positionTitleZh: user.position?.titleZh ?? null,
      branchName: user.branch?.name ?? null,
      reportsToName: reportsToName || null,
      reportsToChineseName: user.reportsTo?.chineseName ?? null,
      employeeType: user.employeeType,
      nationality: user.nationality,
      dateOfBirth: toDateOnly(user.dateOfBirth),
      gender: user.gender,
      educationLevel: user.educationLevel,
      fieldOfStudy: user.fieldOfStudy,
      employmentDate: toDateOnly(user.employmentDate),
      yearsOfExperience: currentYearsOfExperience(
        user.yearsOfExperience,
        user.yearsOfExperienceAsOf,
      ),
      yearsOfExperienceAsOf: toDateOnly(user.yearsOfExperienceAsOf),
      secondaryPhone: user.secondaryPhone,
      seniorityLevelName: user.seniorityLevel?.name ?? null,
      seniorityLevelNameZh: user.seniorityLevel?.nameZh ?? null,
      addressCountry: user.addressCountry,
      addressRegion: user.addressRegion,
      addressCity: user.addressCity,
      addressSubcity: user.addressSubcity,
      addressWoreda: user.addressWoreda,
      addressHouseNumber: user.addressHouseNumber,
      emergencyContacts: normalizeEmergencyContacts(user.emergencyContacts),
      bankName: user.bankName,
      bankBranch: user.bankBranch,
      bankAccountNumber: user.bankAccountNumber,
    };
  }
}
