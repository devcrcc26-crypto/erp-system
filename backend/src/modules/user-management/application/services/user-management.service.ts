import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { FolderContextType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PasswordService } from '../../../auth/application/services/password.service';
import { DocumentService } from '../../../documents/application/services/document.service';
import { LeavePolicyService } from '../../../leave-policy/application/services/leave-policy.service';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import {
  buildOrderBy,
  buildPaginatedResult,
  buildPrismaPagination,
  PaginatedResult,
} from '../../../../shared/utils/pagination.util';
import {
  AssignUserRoleDto,
  CreateDataScopeDto,
  CreateRoleDto,
  CreateUserDto,
  UpdateDataScopeDto,
  UpdateRoleDto,
  UpdateRolePermissionsDto,
  UpdateUserDto,
  UsersQueryDto,
} from '../dtos/user-management.dtos';
import { UserProvisioningService } from './user-provisioning.service';

type AuditContext = { companyId: string; userId: string };

interface UploadedFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class UserManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly userProvisioningService: UserProvisioningService,
    private readonly documentService: DocumentService,
    private readonly leavePolicyService: LeavePolicyService,
  ) {}

  async listUsers(
    ctx: AuditContext,
    query: UsersQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.UserWhereInput = activeOnly({ companyId: ctx.companyId });
    if (query.search) {
      where.OR = [
        { firstName: { contains: query.search, mode: 'insensitive' } },
        { lastName: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.disciplineId) {
      where.engineeringDisciplineId = query.disciplineId;
    }
    if (query.departmentId) {
      where.departmentId = query.departmentId;
    }
    if (query.positionId) {
      where.positionId = query.positionId;
    }
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: this.userListSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildPaginatedResult(
      data.map((row) => this.mapUserResponse(row)),
      total,
      query.page,
      query.limit,
    );
  }

  /**
   * Minimal user list for assignment pickers (task assignee, project team, review routing).
   * Available to anyone with project portfolio access - not full user administration.
   */
  async listUsersDirectory(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where = activeOnly({ companyId: ctx.companyId });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        select: this.userDirectorySelect(),
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getUser(ctx: AuditContext, id: string): Promise<unknown> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      select: {
        ...this.userSelect(),
        userRoles: {
          where: activeOnly({}),
          include: {
            role: { select: { id: true, name: true } },
            dataScopes: { where: activeOnly({}) },
          },
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.mapUserResponse(user);
  }

  async createUser(ctx: AuditContext, dto: CreateUserDto): Promise<unknown> {
    const {
      password,
      email,
      firstName,
      lastName,
      chineseName,
      employeeId: requestedEmployeeId,
      ...rest
    } = dto;

    const profileInput = this.extractProfileInput(dto);

    if (rest.reportsToUserId) {
      await this.assertValidReportsTo(
        ctx.companyId,
        undefined,
        rest.reportsToUserId,
      );
    }

    const sharedInput = {
      firstName,
      lastName,
      chineseName,
      phone: rest.phone,
      branchId: rest.branchId,
      departmentId: rest.departmentId,
      positionId: rest.positionId,
      reportsToUserId: rest.reportsToUserId,
      discipline: rest.discipline,
      engineeringDisciplineId: rest.engineeringDisciplineId,
      preferredLanguage: rest.preferredLanguage,
      preferredTimezone: rest.preferredTimezone,
      preferredDateFormat: rest.preferredDateFormat,
      isActive: rest.isActive,
    };

    let provisionedUser: { id: string };

    if (!email) {
      provisionedUser = await this.userProvisioningService.provisionRecordOnlyUser(
        ctx,
        sharedInput,
      );
    } else if (password) {
      provisionedUser = await this.userProvisioningService.provisionWithPassword(
        ctx,
        { email, password, ...sharedInput },
      );
    } else {
      provisionedUser = await this.userProvisioningService.provisionInvitedUser(
        ctx,
        { email, ...sharedInput },
      );
    }

    await this.applyEmployeeProfileOnCreate(
      ctx,
      provisionedUser.id,
      firstName,
      lastName,
      requestedEmployeeId,
      profileInput,
    );

    if (email && !password) {
      const userForInvite = await this.prisma.user.findFirst({
        where: activeOnly({ id: provisionedUser.id, companyId: ctx.companyId }),
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (userForInvite?.email) {
        await this.userProvisioningService.sendActivationInvite(userForInvite);
      }
    }

    const created = await this.prisma.user.findFirst({
      where: activeOnly({ id: provisionedUser.id, companyId: ctx.companyId }),
      select: this.userSelect(),
    });

    const mapped = this.mapUserResponse(created!);
    if (email && !password) {
      return { ...mapped, invitationSent: true };
    }
    return mapped;
  }

  /**
   * Resends the account activation email for an unverified user.
   */
  async resendInvitation(
    ctx: AuditContext,
    id: string,
  ): Promise<{ message: string }> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        emailVerifiedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.email) {
      throw new BadRequestException(
        'User has no email address and cannot receive an activation invite',
      );
    }

    if (user.emailVerifiedAt) {
      throw new BadRequestException('User account is already activated');
    }

    await this.userProvisioningService.sendActivationInvite({
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
    });

    return { message: 'Activation email sent' };
  }

  async updateUser(
    ctx: AuditContext,
    id: string,
    dto: UpdateUserDto,
  ): Promise<unknown> {
    const existing = await this.prisma.user.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      select: { id: true, employeeId: true, leavePolicyId: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const { password, employeeId: dtoEmployeeId, ...rest } = dto;

    if (rest.leavePolicyId) {
      await this.assertLeavePolicy(ctx.companyId, rest.leavePolicyId);
    }

    if (rest.reportsToUserId !== undefined) {
      await this.assertValidReportsTo(
        ctx.companyId,
        id,
        rest.reportsToUserId,
      );
    }

    const profileData = this.buildProfileUpdateData(rest);
    const data: Prisma.UserUncheckedUpdateInput = {
      ...this.buildBasicUpdateData(rest),
      ...profileData,
      updatedBy: ctx.userId,
    };

    if (dtoEmployeeId !== undefined && !existing.employeeId) {
      const trimmed = dtoEmployeeId.trim();
      if (trimmed) {
        await this.assertEmployeeIdAvailable(ctx.companyId, trimmed, id);
        data.employeeId = trimmed;
      }
    }

    if (password) {
      data.passwordHash = await this.passwordService.hash(password);
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect(),
    });

    const nextPolicyId =
      rest.leavePolicyId !== undefined
        ? rest.leavePolicyId || null
        : existing.leavePolicyId;
    if (nextPolicyId && nextPolicyId !== existing.leavePolicyId) {
      await this.leavePolicyService.initializeBalances(
        id,
        ctx.companyId,
        new Date().getFullYear(),
      );
    }

    return this.mapUserResponse(updated);
  }

  async deleteUser(ctx: AuditContext, id: string): Promise<void> {
    await this.getUser(ctx, id);
    await this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId, isActive: false },
    });
  }

  async listRoles(
    ctx: AuditContext,
    query: PaginationQueryDto,
  ): Promise<PaginatedResult<unknown>> {
    const where = activeOnly({ companyId: ctx.companyId });
    const { skip, take } = buildPrismaPagination(query.page, query.limit);
    const [data, total] = await Promise.all([
      this.prisma.role.findMany({
        where,
        skip,
        take,
        orderBy: buildOrderBy(query.sortBy, query.sortOrder),
        include: { parentRole: { select: { id: true, name: true } } },
      }),
      this.prisma.role.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
  }

  async getRole(ctx: AuditContext, id: string): Promise<unknown> {
    const role = await this.prisma.role.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      include: {
        parentRole: { select: { id: true, name: true } },
        rolePermissions: {
          where: activeOnly({}),
          include: { permission: true },
        },
      },
    });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    return role;
  }

  async createRole(ctx: AuditContext, dto: CreateRoleDto): Promise<unknown> {
    if (dto.parentRoleId) {
      await this.getRole(ctx, dto.parentRoleId);
    }
    return this.prisma.role.create({
      data: {
        companyId: ctx.companyId,
        name: dto.name,
        description: dto.description,
        parentRoleId: dto.parentRoleId,
        isActive: dto.isActive ?? true,
        isSystemRole: false,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateRole(
    ctx: AuditContext,
    id: string,
    dto: UpdateRoleDto,
  ): Promise<unknown> {
    await this.getRole(ctx, id);
    if (dto.parentRoleId) {
      if (dto.parentRoleId === id) {
        throw new ConflictException('Role cannot inherit from itself');
      }
      await this.getRole(ctx, dto.parentRoleId);
    }
    return this.prisma.role.update({
      where: { id },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteRole(ctx: AuditContext, id: string): Promise<void> {
    const role = await this.getRole(ctx, id);
    if ((role as { isSystemRole: boolean }).isSystemRole) {
      throw new ConflictException('System roles cannot be deleted');
    }
    await this.prisma.role.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  async listPermissions(): Promise<unknown[]> {
    return this.prisma.permission.findMany({
      orderBy: [{ module: 'asc' }, { action: 'asc' }],
    });
  }

  async updateRolePermissions(
    ctx: AuditContext,
    roleId: string,
    dto: UpdateRolePermissionsDto,
  ): Promise<unknown> {
    await this.getRole(ctx, roleId);

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.updateMany({
        where: { roleId },
        data: { deletedAt: new Date(), deletedBy: ctx.userId },
      });

      for (const item of dto.permissions) {
        await tx.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId,
              permissionId: item.permissionId,
            },
          },
          update: {
            canView: item.canView,
            canCreate: item.canCreate,
            canEdit: item.canEdit,
            canDelete: item.canDelete,
            canApprove: item.canApprove,
            canExport: item.canExport,
            updatedBy: ctx.userId,
            deletedAt: null,
            deletedBy: null,
          },
          create: {
            roleId,
            permissionId: item.permissionId,
            canView: item.canView,
            canCreate: item.canCreate,
            canEdit: item.canEdit,
            canDelete: item.canDelete,
            canApprove: item.canApprove,
            canExport: item.canExport,
            createdBy: ctx.userId,
            updatedBy: ctx.userId,
          },
        });
      }
    });

    return this.getRole(ctx, roleId);
  }

  async assignUserRole(
    ctx: AuditContext,
    userId: string,
    dto: AssignUserRoleDto,
  ): Promise<unknown> {
    await this.getUser(ctx, userId);
    await this.getRole(ctx, dto.roleId);

    const existingPrimary = await this.prisma.userRole.findFirst({
      where: activeOnly({ userId, isPrimary: true }),
      select: { id: true },
    });

    return this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId, roleId: dto.roleId },
      },
      update: {
        assignedBy: ctx.userId,
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
        ...(existingPrimary ? {} : { isPrimary: true }),
      },
      create: {
        userId,
        roleId: dto.roleId,
        isPrimary: !existingPrimary,
        assignedBy: ctx.userId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  /**
   * Marks one active role assignment as primary (clears any previous primary).
   */
  async setPrimaryRole(
    ctx: AuditContext,
    userId: string,
    roleId: string,
  ): Promise<unknown> {
    await this.getUser(ctx, userId);
    await this.getRole(ctx, roleId);

    const assignment = await this.prisma.userRole.findFirst({
      where: activeOnly({ userId, roleId }),
      include: { role: { select: { id: true, name: true } } },
    });
    if (!assignment) {
      throw new NotFoundException('User role assignment not found');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.updateMany({
        where: activeOnly({ userId, isPrimary: true }),
        data: { isPrimary: false, updatedBy: ctx.userId },
      });
      await tx.userRole.update({
        where: { id: assignment.id },
        data: { isPrimary: true, updatedBy: ctx.userId },
      });
    });

    return this.getUser(ctx, userId);
  }

  async revokeUserRole(
    ctx: AuditContext,
    userId: string,
    roleId: string,
  ): Promise<void> {
    const userRole = await this.prisma.userRole.findFirst({
      where: activeOnly({ userId, roleId }),
    });
    if (!userRole) {
      throw new NotFoundException('User role assignment not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.update({
        where: { id: userRole.id },
        data: {
          deletedAt: new Date(),
          deletedBy: ctx.userId,
          isPrimary: false,
          updatedBy: ctx.userId,
        },
      });

      if (userRole.isPrimary) {
        const next = await tx.userRole.findFirst({
          where: activeOnly({ userId }),
          orderBy: { createdAt: 'asc' },
        });
        if (next) {
          await tx.userRole.update({
            where: { id: next.id },
            data: { isPrimary: true, updatedBy: ctx.userId },
          });
        }
      }
    });
  }

  async listDataScopes(
    ctx: AuditContext,
    userRoleId: string,
  ): Promise<unknown[]> {
    await this.assertUserRole(ctx, userRoleId);
    return this.prisma.dataScope.findMany({
      where: activeOnly({ userRoleId }),
    });
  }

  async createDataScope(
    ctx: AuditContext,
    userRoleId: string,
    dto: CreateDataScopeDto,
  ): Promise<unknown> {
    await this.assertUserRole(ctx, userRoleId);
    return this.prisma.dataScope.create({
      data: {
        userRoleId,
        scopeType: dto.scopeType,
        scopeValue: dto.scopeValue,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
  }

  async updateDataScope(
    ctx: AuditContext,
    id: string,
    dto: UpdateDataScopeDto,
  ): Promise<unknown> {
    const scope = await this.prisma.dataScope.findFirst({
      where: activeOnly({ id }),
      include: { userRole: { include: { role: true } } },
    });
    if (!scope || scope.userRole.role.companyId !== ctx.companyId) {
      throw new NotFoundException('Data scope not found');
    }
    return this.prisma.dataScope.update({
      where: { id },
      data: { ...dto, updatedBy: ctx.userId },
    });
  }

  async deleteDataScope(ctx: AuditContext, id: string): Promise<void> {
    const scope = await this.prisma.dataScope.findFirst({
      where: activeOnly({ id }),
      include: { userRole: { include: { role: true } } },
    });
    if (!scope || scope.userRole.role.companyId !== ctx.companyId) {
      throw new NotFoundException('Data scope not found');
    }
    await this.prisma.dataScope.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
    });
  }

  /** Lists profile documents for an employee. */
  async listUserDocuments(ctx: AuditContext, userId: string): Promise<unknown[]> {
    const folderId = await this.resolveProfileFolderId(ctx, userId);
    const documents = await this.prisma.document.findMany({
      where: activeOnly({ companyId: ctx.companyId, folderId, isCurrent: true }),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        fileType: true,
        fileSizeBytes: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return documents;
  }

  /** Uploads one or more labelled files to the employee profile folder. */
  async uploadUserDocuments(
    ctx: AuditContext,
    userId: string,
    files: UploadedFile[],
    labels: string[],
  ): Promise<unknown[]> {
    if (files.length === 0) {
      throw new BadRequestException('At least one file is required');
    }

    const folderId = await this.resolveProfileFolderId(ctx, userId);
    const uploaded: unknown[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      const label = labels[index]?.trim() || file.originalname;
      const document = (await this.documentService.uploadDocument(
        ctx,
        folderId,
        file,
      )) as { id: string };

      const updated = await this.prisma.document.update({
        where: { id: document.id },
        data: { name: label, updatedBy: ctx.userId },
        select: {
          id: true,
          name: true,
          fileType: true,
          fileSizeBytes: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      uploaded.push(updated);
    }

    return uploaded;
  }

  /** Soft-deletes a profile document belonging to the user. */
  async deleteUserDocument(
    ctx: AuditContext,
    userId: string,
    documentId: string,
  ): Promise<void> {
    const folderId = await this.resolveProfileFolderId(ctx, userId);
    const document = await this.prisma.document.findFirst({
      where: activeOnly({
        id: documentId,
        companyId: ctx.companyId,
        folderId,
      }),
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    await this.documentService.deleteDocument(ctx, documentId);
  }

  /**
   * Presigned download URL for a profile document (users.view; no documents.view).
   */
  async getUserDocumentDownloadUrl(
    ctx: AuditContext,
    userId: string,
    documentId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const folderId = await this.resolveProfileFolderId(ctx, userId);
    const document = await this.prisma.document.findFirst({
      where: activeOnly({
        id: documentId,
        companyId: ctx.companyId,
        folderId,
      }),
      select: { id: true },
    });
    if (!document) {
      throw new NotFoundException('Document not found');
    }
    return this.documentService.getDownloadUrl(ctx, documentId);
  }

  private static readonly PROFILE_PHOTO_MIME_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
  ]);

  /**
   * Uploads (or replaces) the employee profile picture.
   */
  async uploadUserPhoto(
    ctx: AuditContext,
    userId: string,
    file: UploadedFile,
  ): Promise<unknown> {
    if (!UserManagementService.PROFILE_PHOTO_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        'Profile photo must be a JPEG, PNG, WebP, or GIF image',
      );
    }
    if (file.size > 5 * 1024 * 1024) {
      throw new BadRequestException('Profile photo must be 5 MB or smaller');
    }

    const existing = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: { id: true, photoDocumentId: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const folderId = await this.resolveProfileFolderId(ctx, userId);
    const uploaded = (await this.documentService.uploadDocument(
      ctx,
      folderId,
      file,
    )) as { id: string };

    await this.prisma.document.update({
      where: { id: uploaded.id },
      data: {
        name: 'Profile photo',
        updatedBy: ctx.userId,
      },
    });

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        photoDocumentId: uploaded.id,
        updatedBy: ctx.userId,
      },
      select: this.userSelect(),
    });

    if (existing.photoDocumentId && existing.photoDocumentId !== uploaded.id) {
      await this.documentService.deleteDocument(ctx, existing.photoDocumentId);
    }

    return this.mapUserResponse(updated);
  }

  /**
   * Presigned download URL for the employee's profile picture.
   */
  async getUserPhotoDownloadUrl(
    ctx: AuditContext,
    userId: string,
  ): Promise<{ url: string; expiresIn: number }> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: { photoDocumentId: true },
    });
    if (!user?.photoDocumentId) {
      throw new NotFoundException('Profile photo not found');
    }
    return this.documentService.getDownloadUrl(ctx, user.photoDocumentId);
  }

  /**
   * Removes the employee profile picture link and soft-deletes the document.
   */
  async deleteUserPhoto(ctx: AuditContext, userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: { id: true, photoDocumentId: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!user.photoDocumentId) {
      return;
    }

    const documentId = user.photoDocumentId;
    await this.prisma.user.update({
      where: { id: userId },
      data: { photoDocumentId: null, updatedBy: ctx.userId },
    });
    await this.documentService.deleteDocument(ctx, documentId);
  }

  private async assertUserRole(
    ctx: AuditContext,
    userRoleId: string,
  ): Promise<void> {
    const userRole = await this.prisma.userRole.findFirst({
      where: activeOnly({ id: userRoleId }),
      include: { role: true, user: true },
    });
    if (
      !userRole ||
      userRole.role.companyId !== ctx.companyId ||
      userRole.user.companyId !== ctx.companyId
    ) {
      throw new NotFoundException('User role not found');
    }
  }

  private userSelect(): Prisma.UserSelect {
    return {
      id: true,
      companyId: true,
      branchId: true,
      departmentId: true,
      department: { select: { id: true, name: true } },
      positionId: true,
      position: { select: { id: true, title: true } },
      reportsToUserId: true,
      reportsTo: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          chineseName: true,
          employeeId: true,
        },
      },
      discipline: true,
      engineeringDisciplineId: true,
      engineeringDiscipline: { select: { id: true, name: true, nameZh: true } },
      employeeId: true,
      middleName: true,
      addressCountry: true,
      addressRegion: true,
      addressCity: true,
      addressSubcity: true,
      addressWoreda: true,
      addressHouseNumber: true,
      gender: true,
      dateOfBirth: true,
      nationalId: true,
      nationality: true,
      employeeType: true,
      educationLevel: true,
      fieldOfStudy: true,
      experienceStartDate: true,
      emergencyContacts: true,
      leavePolicyId: true,
      leavePolicy: { select: { id: true, name: true } },
      profileFolderId: true,
      photoDocumentId: true,
      firstName: true,
      lastName: true,
      chineseName: true,
      email: true,
      phone: true,
      preferredLanguage: true,
      preferredTimezone: true,
      preferredDateFormat: true,
      isActive: true,
      mfaEnabled: true,
      emailVerifiedAt: true,
      pendingEmail: true,
      lastLogin: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private userListSelect(): Prisma.UserSelect {
    return {
      ...this.userSelect(),
      userRoles: this.userRolesListSelect(),
    };
  }

  private userDirectorySelect(): Prisma.UserSelect {
    return {
      id: true,
      firstName: true,
      lastName: true,
      chineseName: true,
      email: true,
      positionId: true,
      position: { select: { id: true, title: true } },
      discipline: true,
      engineeringDisciplineId: true,
      engineeringDiscipline: { select: { id: true, name: true, nameZh: true } },
      isActive: true,
      userRoles: this.userRolesListSelect(),
    };
  }

  private userRolesListSelect(): Prisma.User$userRolesArgs {
    return {
      where: activeOnly({}),
      select: {
        id: true,
        roleId: true,
        isPrimary: true,
        role: { select: { id: true, name: true } },
      },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    };
  }

  private extractProfileInput(
    dto: CreateUserDto,
  ): Partial<{
    middleName?: string;
    addressCountry?: string;
    addressRegion?: string;
    addressCity?: string;
    addressSubcity?: string;
    addressWoreda?: string;
    addressHouseNumber?: string;
    gender?: CreateUserDto['gender'];
    dateOfBirth?: string;
    nationalId?: string;
    nationality?: CreateUserDto['nationality'];
    employeeType?: CreateUserDto['employeeType'];
    educationLevel?: CreateUserDto['educationLevel'];
    fieldOfStudy?: string;
    experienceStartDate?: string;
    emergencyContacts?: CreateUserDto['emergencyContacts'];
    leavePolicyId?: string;
  }> {
    return {
      middleName: dto.middleName,
      addressCountry: dto.addressCountry,
      addressRegion: dto.addressRegion,
      addressCity: dto.addressCity,
      addressSubcity: dto.addressSubcity,
      addressWoreda: dto.addressWoreda,
      addressHouseNumber: dto.addressHouseNumber,
      gender: dto.gender,
      dateOfBirth: dto.dateOfBirth,
      nationalId: dto.nationalId,
      nationality: dto.nationality,
      employeeType: dto.employeeType,
      educationLevel: dto.educationLevel,
      fieldOfStudy: dto.fieldOfStudy,
      experienceStartDate: dto.experienceStartDate,
      emergencyContacts: dto.emergencyContacts,
      leavePolicyId: dto.leavePolicyId,
    };
  }

  private async applyEmployeeProfileOnCreate(
    ctx: AuditContext,
    userId: string,
    firstName: string,
    lastName: string,
    requestedEmployeeId: string | undefined,
    profileInput: Partial<{
      middleName?: string;
      addressCountry?: string;
      addressRegion?: string;
      addressCity?: string;
      addressSubcity?: string;
      addressWoreda?: string;
      addressHouseNumber?: string;
      gender?: CreateUserDto['gender'];
      dateOfBirth?: string;
      nationalId?: string;
      nationality?: CreateUserDto['nationality'];
      employeeType?: CreateUserDto['employeeType'];
      educationLevel?: CreateUserDto['educationLevel'];
      fieldOfStudy?: string;
      experienceStartDate?: string;
      emergencyContacts?: CreateUserDto['emergencyContacts'];
      leavePolicyId?: string;
    }>,
  ): Promise<void> {
    const employeeId =
      requestedEmployeeId?.trim() || (await this.nextEmployeeId());
    await this.assertEmployeeIdAvailable(ctx.companyId, employeeId, userId);

    if (profileInput.leavePolicyId) {
      await this.assertLeavePolicy(ctx.companyId, profileInput.leavePolicyId);
    }

    const folderName = `${firstName} ${lastName}`.trim() || 'Employee Profile';
    const folder = await this.prisma.documentFolder.create({
      data: {
        id: randomUUID(),
        companyId: ctx.companyId,
        parentId: null,
        name: folderName,
        path: `/Employee Profiles/${userId}`,
        contextType: FolderContextType.EMPLOYEE_PROFILE,
        contextId: userId,
        isSystem: false,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      select: { id: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        employeeId,
        profileFolderId: folder.id,
        middleName: profileInput.middleName?.trim() || null,
        addressCountry: profileInput.addressCountry?.trim() || null,
        addressRegion: profileInput.addressRegion?.trim() || null,
        addressCity: profileInput.addressCity?.trim() || null,
        addressSubcity: profileInput.addressSubcity?.trim() || null,
        addressWoreda: profileInput.addressWoreda?.trim() || null,
        addressHouseNumber: profileInput.addressHouseNumber?.trim() || null,
        gender: profileInput.gender as Prisma.UserUpdateInput['gender'],
        dateOfBirth: profileInput.dateOfBirth
          ? this.parseDateOnly(profileInput.dateOfBirth)
          : null,
        nationalId: profileInput.nationalId?.trim() || null,
        nationality: profileInput.nationality as Prisma.UserUpdateInput['nationality'],
        employeeType: profileInput.employeeType as Prisma.UserUpdateInput['employeeType'],
        educationLevel:
          profileInput.educationLevel as Prisma.UserUpdateInput['educationLevel'],
        fieldOfStudy: profileInput.fieldOfStudy?.trim() || null,
        experienceStartDate: profileInput.experienceStartDate
          ? this.parseDateOnly(profileInput.experienceStartDate)
          : null,
        emergencyContacts: this.normalizeEmergencyContacts(profileInput.emergencyContacts),
        leavePolicyId: profileInput.leavePolicyId ?? null,
        updatedBy: ctx.userId,
      },
    });

    if (profileInput.leavePolicyId) {
      await this.leavePolicyService.initializeBalances(
        userId,
        ctx.companyId,
        new Date().getFullYear(),
      );
    }
  }

  private buildBasicUpdateData(
    rest: Omit<
      UpdateUserDto,
      | 'password'
      | 'employeeId'
      | 'middleName'
      | 'addressCountry'
      | 'addressRegion'
      | 'addressCity'
      | 'addressSubcity'
      | 'addressWoreda'
      | 'addressHouseNumber'
      | 'gender'
      | 'dateOfBirth'
      | 'nationalId'
      | 'nationality'
      | 'employeeType'
      | 'educationLevel'
      | 'fieldOfStudy'
      | 'experienceStartDate'
      | 'emergencyContacts'
      | 'leavePolicyId'
    >,
  ): Prisma.UserUncheckedUpdateInput {
    return {
      firstName: rest.firstName?.trim() || undefined,
      lastName: rest.lastName?.trim() || undefined,
      chineseName: rest.chineseName?.trim() || undefined,
      phone: rest.phone?.trim() || undefined,
      branchId: rest.branchId,
      departmentId: rest.departmentId,
      positionId: rest.positionId,
      reportsToUserId: rest.reportsToUserId,
      discipline: rest.discipline,
      engineeringDisciplineId: rest.engineeringDisciplineId,
      preferredLanguage: rest.preferredLanguage,
      preferredTimezone: rest.preferredTimezone,
      preferredDateFormat: rest.preferredDateFormat,
      isActive: rest.isActive,
    };
  }

  private buildProfileUpdateData(
    rest: Partial<
      Pick<
        UpdateUserDto,
        | 'middleName'
        | 'addressCountry'
        | 'addressRegion'
        | 'addressCity'
        | 'addressSubcity'
        | 'addressWoreda'
        | 'addressHouseNumber'
        | 'gender'
        | 'dateOfBirth'
        | 'nationalId'
        | 'nationality'
        | 'employeeType'
        | 'educationLevel'
        | 'fieldOfStudy'
        | 'experienceStartDate'
        | 'emergencyContacts'
        | 'leavePolicyId'
      >
    >,
  ): Prisma.UserUncheckedUpdateInput {
    const data: Prisma.UserUncheckedUpdateInput = {};

    if (rest.middleName !== undefined) {
      data.middleName = rest.middleName?.trim() || null;
    }
    if (rest.addressCountry !== undefined) {
      data.addressCountry = rest.addressCountry?.trim() || null;
    }
    if (rest.addressRegion !== undefined) {
      data.addressRegion = rest.addressRegion?.trim() || null;
    }
    if (rest.addressCity !== undefined) {
      data.addressCity = rest.addressCity?.trim() || null;
    }
    if (rest.addressSubcity !== undefined) {
      data.addressSubcity = rest.addressSubcity?.trim() || null;
    }
    if (rest.addressWoreda !== undefined) {
      data.addressWoreda = rest.addressWoreda?.trim() || null;
    }
    if (rest.addressHouseNumber !== undefined) {
      data.addressHouseNumber = rest.addressHouseNumber?.trim() || null;
    }
    if (rest.gender !== undefined) {
      data.gender = rest.gender;
    }
    if (rest.dateOfBirth !== undefined) {
      data.dateOfBirth = rest.dateOfBirth
        ? this.parseDateOnly(rest.dateOfBirth)
        : null;
    }
    if (rest.nationalId !== undefined) {
      data.nationalId = rest.nationalId?.trim() || null;
    }
    if (rest.nationality !== undefined) {
      data.nationality = rest.nationality;
    }
    if (rest.employeeType !== undefined) {
      data.employeeType = rest.employeeType;
    }
    if (rest.educationLevel !== undefined) {
      data.educationLevel = rest.educationLevel;
    }
    if (rest.fieldOfStudy !== undefined) {
      data.fieldOfStudy = rest.fieldOfStudy?.trim() || null;
    }
    if (rest.experienceStartDate !== undefined) {
      data.experienceStartDate = rest.experienceStartDate
        ? this.parseDateOnly(rest.experienceStartDate)
        : null;
    }
    if (rest.emergencyContacts !== undefined) {
      data.emergencyContacts = this.normalizeEmergencyContacts(rest.emergencyContacts);
    }
    if (rest.leavePolicyId !== undefined) {
      data.leavePolicyId = rest.leavePolicyId || null;
    }

    return data;
  }

  private async resolveProfileFolderId(
    ctx: AuditContext,
    userId: string,
  ): Promise<string> {
    await this.getUser(ctx, userId);

    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id: userId, companyId: ctx.companyId }),
      select: {
        id: true,
        profileFolderId: true,
        firstName: true,
        lastName: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.profileFolderId) {
      return user.profileFolderId;
    }

    const folderName = `${user.firstName} ${user.lastName}`.trim() || 'Employee Profile';
    const folder = await this.prisma.documentFolder.create({
      data: {
        id: randomUUID(),
        companyId: ctx.companyId,
        parentId: null,
        name: folderName,
        path: `/Employee Profiles/${userId}`,
        contextType: FolderContextType.EMPLOYEE_PROFILE,
        contextId: userId,
        isSystem: false,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
      select: { id: true },
    });

    await this.prisma.user.update({
      where: { id: userId },
      data: { profileFolderId: folder.id, updatedBy: ctx.userId },
    });

    return folder.id;
  }

  private async nextEmployeeId(): Promise<string> {
    const result = await this.prisma.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('employee_id_seq')
    `;
    const seq = Number(result[0].nextval);
    return `EMP-${String(seq).padStart(4, '0')}`;
  }

  private async assertEmployeeIdAvailable(
    companyId: string,
    employeeId: string,
    excludeUserId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        employeeId,
        companyId,
        deletedAt: null,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Employee ID already in use');
    }
  }

  private async assertLeavePolicy(
    companyId: string,
    leavePolicyId: string,
  ): Promise<void> {
    const policy = await this.prisma.leavePolicy.findFirst({
      where: activeOnly({ id: leavePolicyId, companyId, isActive: true }),
      select: { id: true },
    });
    if (!policy) {
      throw new BadRequestException('Leave policy not found or inactive');
    }
  }

  private parseDateOnly(value: string): Date {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
    if (!match) {
      throw new BadRequestException(`Invalid date: ${value}`);
    }
    return new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
    );
  }

  private computeYearsOfExperience(startDate: Date | null): number | null {
    if (!startDate) {
      return null;
    }
    const now = new Date();
    let years = now.getUTCFullYear() - startDate.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - startDate.getUTCMonth();
    const dayDiff = now.getUTCDate() - startDate.getUTCDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
      years -= 1;
    }
    return Math.max(0, years);
  }

  private normalizeEmergencyContacts(
    contacts: CreateUserDto['emergencyContacts'] | undefined,
  ): Prisma.InputJsonValue | typeof Prisma.DbNull | undefined {
    if (contacts === undefined) {
      return undefined;
    }

    const normalized = contacts
      .map((contact) => ({
        firstName: contact.firstName?.trim() ?? '',
        middleName: contact.middleName?.trim() || null,
        lastName: contact.lastName?.trim() ?? '',
        phone: contact.phone?.trim() || null,
        email: contact.email?.trim() || null,
      }))
      .filter(
        (contact) =>
          contact.firstName ||
          contact.middleName ||
          contact.lastName ||
          contact.phone ||
          contact.email,
      );

    return normalized.length > 0 ? normalized : Prisma.DbNull;
  }

  private async assertValidReportsTo(
    companyId: string,
    userId: string | undefined,
    reportsToUserId: string | null,
  ): Promise<void> {
    if (!reportsToUserId) {
      return;
    }
    if (userId && reportsToUserId === userId) {
      throw new BadRequestException('User cannot report to themselves');
    }
    const manager = await this.prisma.user.findFirst({
      where: activeOnly({ id: reportsToUserId, companyId }),
      select: { id: true },
    });
    if (!manager) {
      throw new NotFoundException('Reports-to user not found');
    }
  }

  private mapUserResponse<T extends { experienceStartDate?: Date | null }>(
    user: T | null,
  ): (T & { yearsOfExperience: number | null }) | null {
    if (!user) {
      return null;
    }
    return {
      ...user,
      yearsOfExperience: this.computeYearsOfExperience(
        user.experienceStartDate ?? null,
      ),
    };
  }
}
