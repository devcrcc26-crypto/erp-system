import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditLogSource, FolderContextType, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../../audit/application/services/audit.service';
import { AUTH_AUDIT_MODULE } from '../../../auth/application/constants/login-security.constants';
import { resolveHrProcessExclusionUpdate } from '../utils/hr-process-exclusion.util';
import {
  currentYearsOfExperience,
  todayDateOnly,
  yearsOfExperienceUpdate,
} from '../../domain/years-of-experience';

const USERS_AUDIT_MODULE = 'users';
import { PasswordService } from '../../../auth/application/services/password.service';
import {
  assertPasswordPolicy,
  generateTemporaryPassword,
} from '../../../auth/application/utils/password-policy.util';
import {
  formatDisplayFullName,
  normalizeLoginName,
} from '../../../auth/application/utils/login-name.util';
import { DocumentService } from '../../../documents/application/services/document.service';
import { LeavePolicyService } from '../../../leave-policy/application/services/leave-policy.service';
import { WorkScheduleService } from '../../../work-schedule/application/services/work-schedule.service';
import {
  PROTECTED_SYSTEM_ADMIN_ID,
  SYSTEM_ADMINISTRATOR_ROLE,
} from '../../../../shared/constants/protected-accounts';
import { PaginationQueryDto } from '../../../../shared/dtos/pagination-query.dto';
import { PermissionService } from '../../../../shared/permissions/permission.service';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { activeOnly } from '../../../../shared/prisma/soft-delete.util';
import { findReportsToCycle } from '../../../../shared/org/reports-to-cycle.util';
import {
  buildOrgGapReport,
  type OrgGapReport,
} from '../../../../shared/org/org-gap-report';
import {
  buildSupervisorAccountIndex,
  resolveSupervisorUserId,
} from '../../../../shared/org-import/supervisor-lookup';
import { readDirectoryOrgRows } from '../../../../shared/org-import/directory-sheet';
import { isSupervisorInApproverJson } from '../../../../shared/org-import/approver-json';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
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

const LOGIN_NAME_CONFLICT = 'Another user already has this login name';

/** Masks account numbers for viewers without hr.view (and not the employee). */
function maskBankAccountNumber(
  account: string | null | undefined,
): string | null {
  if (account == null || account.trim() === '') {
    return null;
  }
  const trimmed = account.trim();
  if (trimmed.length <= 4) {
    return '••••';
  }
  return `••••${trimmed.slice(-4)}`;
}

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
    private readonly auditService: AuditService,
    private readonly documentService: DocumentService,
    private readonly leavePolicyService: LeavePolicyService,
    private readonly workScheduleService: WorkScheduleService,
    private readonly permissionService: PermissionService,
  ) {}

  async listUsers(
    ctx: AuditContext,
    query: UsersQueryDto,
    /** Supervisor team view: only these users. */
    onlyIds?: readonly string[],
  ): Promise<PaginatedResult<unknown>> {
    const where: Prisma.UserWhereInput = activeOnly({ companyId: ctx.companyId });
    if (onlyIds) {
      where.id = { in: [...onlyIds] };
    }
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
    if (query.employmentStatus) {
      where.employmentStatus = query.employmentStatus;
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
    const canViewBank = await this.canViewFullBankDetails(ctx, null);
    // listUsers requires users.view (HR/admin) - loginName is allowed for the optional column.
    const canViewLoginName = await this.canViewLoginName(ctx, null);
    return buildPaginatedResult(
      data.map((row) =>
        this.applyLoginNameVisibility(
          this.applyBankVisibility(
            this.mapUserResponse(row),
            canViewBank,
            false,
          ),
          canViewLoginName,
        ),
      ),
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
    const mapped = this.mapUserResponse(user);
    const canViewBank = await this.canViewFullBankDetails(ctx, id);
    const withBank = this.applyBankVisibility(
      mapped,
      canViewBank,
      id === ctx.userId,
    );
    const canViewLoginName = await this.canViewLoginName(ctx, id);
    return this.applyLoginNameVisibility(withBank, canViewLoginName);
  }

  async createUser(ctx: AuditContext, dto: CreateUserDto): Promise<unknown> {
    const {
      password,
      issueTemporaryPassword,
      email,
      firstName,
      lastName,
      chineseName,
      loginName: dtoLoginName,
      employeeId: requestedEmployeeId,
      ...rest
    } = dto;

    const profileInput = this.extractProfileInput(dto);
    const middleName =
      typeof profileInput.middleName === 'string'
        ? profileInput.middleName
        : null;

    const resolvedLoginName = (
      dtoLoginName?.trim() ||
      formatDisplayFullName({
        firstName,
        middleName,
        lastName: lastName?.trim() ?? '',
      })
    ).trim();

    if (!resolvedLoginName) {
      throw new BadRequestException('Login name is required');
    }

    const loginNameNormalized = normalizeLoginName(resolvedLoginName);
    await this.assertLoginNameAvailable(loginNameNormalized);

    if (password) {
      assertPasswordPolicy(password, resolvedLoginName);
    }

    if (rest.reportsToUserId) {
      await this.assertValidReportsTo(
        ctx.companyId,
        undefined,
        rest.reportsToUserId,
      );
    }

    const sharedInput = {
      firstName,
      lastName: lastName?.trim() ?? '',
      chineseName,
      loginName: resolvedLoginName,
      loginNameNormalized,
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
    let temporaryPasswordPlain: string | null = null;
    let invitationSent = false;

    if (issueTemporaryPassword === true && !email) {
      throw new BadRequestException(
        'issueTemporaryPassword requires an email address',
      );
    }

    if (!email) {
      provisionedUser = await this.userProvisioningService.provisionRecordOnlyUser(
        ctx,
        sharedInput,
      );
    } else if (issueTemporaryPassword === true) {
      let plainPassword = password?.trim() || generateTemporaryPassword(12);
      while (normalizeLoginName(plainPassword) === loginNameNormalized) {
        plainPassword = generateTemporaryPassword(12);
      }
      assertPasswordPolicy(plainPassword, resolvedLoginName);
      temporaryPasswordPlain = plainPassword;
      provisionedUser = await this.userProvisioningService.provisionWithPassword(
        ctx,
        {
          email,
          password: plainPassword,
          mustChangePassword: true,
          ...sharedInput,
        },
      );
    } else if (password?.trim()) {
      assertPasswordPolicy(password.trim(), resolvedLoginName);
      provisionedUser = await this.userProvisioningService.provisionWithPassword(
        ctx,
        { email, password: password.trim(), ...sharedInput },
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
      lastName?.trim() ?? '',
      requestedEmployeeId,
      profileInput,
    );

    if (email && !password?.trim() && issueTemporaryPassword !== true) {
      const userForInvite = await this.prisma.user.findFirst({
        where: activeOnly({ id: provisionedUser.id, companyId: ctx.companyId }),
        select: { id: true, email: true, firstName: true, lastName: true },
      });
      if (userForInvite?.email) {
        await this.userProvisioningService.sendActivationInvite(userForInvite);
        invitationSent = true;
      }
    }

    const created = await this.prisma.user.findFirst({
      where: activeOnly({ id: provisionedUser.id, companyId: ctx.companyId }),
      select: this.userSelect(),
    });

    const mapped = this.mapUserResponse(created!);
    const visible = this.applyLoginNameVisibility(
      mapped,
      await this.canViewLoginName(ctx, provisionedUser.id),
    );
    if (temporaryPasswordPlain) {
      return {
        ...visible,
        temporaryPassword: temporaryPasswordPlain,
        mustChangePassword: true,
      };
    }
    if (invitationSent) {
      return { ...visible, invitationSent: true };
    }
    return visible;
  }

  /**
   * Resends the account activation email for an unverified user.
   */
  /**
   * Admin/HR reset: sets a random temporary password shown once to the caller,
   * forces mustChangePassword, and audit-logs the action (password never logged).
   */
  async adminResetPassword(
    ctx: AuditContext,
    id: string,
  ): Promise<{ temporaryPassword: string; mustChangePassword: true }> {
    const user = await this.prisma.user.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      select: { id: true, loginName: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    let temporaryPassword = generateTemporaryPassword(12);
    // Avoid accidental equality with login name (extremely unlikely).
    while (
      user.loginName &&
      normalizeLoginName(temporaryPassword) ===
        normalizeLoginName(user.loginName)
    ) {
      temporaryPassword = generateTemporaryPassword(12);
    }

    const passwordHash = await this.passwordService.hash(temporaryPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        mustChangePassword: true,
        failedLoginAttempts: 0,
        lockedUntil: null,
        updatedBy: ctx.userId,
      },
    });

    await this.auditService.create({
      userId: ctx.userId,
      companyId: ctx.companyId,
      module: AUTH_AUDIT_MODULE,
      action: 'ADMIN_PASSWORD_RESET',
      recordType: 'User',
      recordId: user.id,
      afterValue: { mustChangePassword: true },
      source: AuditLogSource.USER_ACTION,
    });

    return { temporaryPassword, mustChangePassword: true };
  }

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
      select: {
        id: true,
        employeeId: true,
        leavePolicyId: true,
        workScheduleId: true,
        loginName: true,
        excludedFromHrProcesses: true,
        excludedReason: true,
        employmentStatus: true,
        isActive: true,
        yearsOfExperience: true,
        yearsOfExperienceAsOf: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    // Deactivation via isActive=false is not a personal-data update - same rules as delete.
    if (dto.isActive === false) {
      await this.assertCanDeactivateOrDeleteUser(ctx, id);
    }
    if (dto.isActive === true && !existing.isActive && existing.employmentStatus === 'SEPARATED') {
      throw new BadRequestException(
        'This employee is separated. Cancel the separation (or rehire) instead of re-enabling login.',
      );
    }

    const {
      password,
      employeeId: dtoEmployeeId,
      workScheduleId,
      loginName: dtoLoginName,
      excludedFromHrProcesses: dtoExcluded,
      excludedReason: dtoExcludedReason,
      ...rest
    } = dto;

    if (rest.leavePolicyId) {
      await this.assertLeavePolicy(ctx.companyId, rest.leavePolicyId);
    }
    if (rest.seniorityLevelId) {
      await this.assertSeniorityLevel(ctx.companyId, rest.seniorityLevelId);
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
      ...yearsOfExperienceUpdate(rest.yearsOfExperience, existing),
      updatedBy: ctx.userId,
    };

    // loginName is never auto-derived from first/middle/last on profile edits.
    let nextLoginName: string | null = existing.loginName;
    if (dtoLoginName !== undefined) {
      const prepared = await this.prepareLoginNameUpdate(
        id,
        dtoLoginName,
      );
      data.loginName = prepared.loginName;
      data.loginNameNormalized = prepared.loginNameNormalized;
      nextLoginName = prepared.loginName;
    }

    if (dtoEmployeeId !== undefined && !existing.employeeId) {
      const trimmed = dtoEmployeeId.trim();
      if (trimmed) {
        await this.assertEmployeeIdAvailable(ctx.companyId, trimmed, id);
        data.employeeId = trimmed;
      }
    }

    if (password) {
      assertPasswordPolicy(password, nextLoginName);
      data.passwordHash = await this.passwordService.hash(password);
    }

    const exclusion = resolveHrProcessExclusionUpdate(existing, {
      excludedFromHrProcesses: dtoExcluded,
      excludedReason: dtoExcludedReason,
    });
    if (exclusion) {
      data.excludedFromHrProcesses = exclusion.excludedFromHrProcesses;
      data.excludedReason = exclusion.excludedReason;
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect(),
    });

    if (exclusion) {
      await this.auditService.create({
        userId: ctx.userId,
        companyId: ctx.companyId,
        module: USERS_AUDIT_MODULE,
        action: 'HR_PROCESS_EXCLUSION_UPDATED',
        recordType: 'User',
        recordId: id,
        beforeValue: {
          excludedFromHrProcesses: existing.excludedFromHrProcesses,
          excludedReason: existing.excludedReason,
        },
        afterValue: { ...exclusion },
        source: AuditLogSource.USER_ACTION,
      });
    }

    if (
      dtoLoginName !== undefined &&
      existing.loginName !== nextLoginName
    ) {
      await this.auditLoginNameChange(
        ctx,
        id,
        existing.loginName,
        nextLoginName,
      );
    }

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

    if (workScheduleId && workScheduleId !== existing.workScheduleId) {
      await this.workScheduleService.syncEmployeeSchedule(
        id,
        workScheduleId,
        ctx.companyId,
        ctx.userId,
      );
    }

    const withSchedule =
      workScheduleId && workScheduleId !== existing.workScheduleId
        ? await this.prisma.user.findFirst({
            where: activeOnly({ id, companyId: ctx.companyId }),
            select: this.userSelect(),
          })
        : updated;

    return this.applyLoginNameVisibility(
      this.applyBankVisibility(
        this.mapUserResponse(withSchedule),
        await this.canViewFullBankDetails(ctx, id),
        id === ctx.userId,
      ),
      await this.canViewLoginName(ctx, id),
    );
  }

  /**
   * Sets or replaces the OA login name (HR/admin). Audited. Does not touch name fields.
   */
  async updateLoginName(
    ctx: AuditContext,
    id: string,
    loginName: string,
  ): Promise<unknown> {
    const existing = await this.prisma.user.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      select: { id: true, loginName: true },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const prepared = await this.prepareLoginNameUpdate(id, loginName);
    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        loginName: prepared.loginName,
        loginNameNormalized: prepared.loginNameNormalized,
        updatedBy: ctx.userId,
      },
      select: this.userSelect(),
    });

    await this.auditLoginNameChange(
      ctx,
      id,
      existing.loginName,
      prepared.loginName,
    );

    return this.applyLoginNameVisibility(
      this.applyBankVisibility(
        this.mapUserResponse(updated),
        await this.canViewFullBankDetails(ctx, id),
        id === ctx.userId,
      ),
      true,
    );
  }

  /**
   * Sets loginName to the displayed full name (first + middle + last). Audited.
   */
  async setLoginNameToFullName(
    ctx: AuditContext,
    id: string,
  ): Promise<unknown> {
    const existing = await this.prisma.user.findFirst({
      where: activeOnly({ id, companyId: ctx.companyId }),
      select: {
        id: true,
        loginName: true,
        firstName: true,
        middleName: true,
        lastName: true,
      },
    });
    if (!existing) {
      throw new NotFoundException('User not found');
    }

    const fullName = formatDisplayFullName({
      firstName: existing.firstName,
      middleName: existing.middleName,
      lastName: existing.lastName,
    });
    if (!fullName) {
      throw new BadRequestException('Cannot derive login name from empty full name');
    }

    return this.updateLoginName(ctx, id, fullName);
  }

  async deleteUser(ctx: AuditContext, id: string): Promise<void> {
    await this.assertCanDeactivateOrDeleteUser(ctx, id);
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
    const role = await this.getRole(ctx, dto.roleId);
    await this.assertCanAssignOrRevokeSystemAdminRole(
      ctx,
      (role as { name: string }).name,
      'assign',
    );

    const existingPrimary = await this.prisma.userRole.findFirst({
      where: activeOnly({ userId, isPrimary: true }),
      select: { id: true },
    });

    const forcePrimary = dto.isPrimary === true;
    const forceSecondary = dto.isPrimary === false;
    // Always keep at least one primary: secondary only when another primary exists.
    const isPrimary = forcePrimary || !existingPrimary;

    if (forcePrimary && existingPrimary) {
      await this.prisma.userRole.updateMany({
        where: activeOnly({ userId, isPrimary: true }),
        data: { isPrimary: false, updatedBy: ctx.userId },
      });
    }

    return this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId, roleId: dto.roleId },
      },
      update: {
        assignedBy: ctx.userId,
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
        ...(forcePrimary || forceSecondary || !existingPrimary
          ? { isPrimary: forcePrimary ? true : forceSecondary && existingPrimary ? false : isPrimary }
          : {}),
      },
      create: {
        userId,
        roleId: dto.roleId,
        isPrimary: forcePrimary
          ? true
          : forceSecondary && existingPrimary
            ? false
            : !existingPrimary,
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

    await this.assertCanAssignOrRevokeSystemAdminRole(
      ctx,
      assignment.role.name,
      'assign',
    );

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
      include: { role: { select: { name: true } } },
    });
    if (!userRole) {
      throw new NotFoundException('User role assignment not found');
    }

    if (userRole.role.name === SYSTEM_ADMINISTRATOR_ROLE) {
      const actingUserIsAdmin = await this.isSystemAdmin(ctx.userId);
      if (!actingUserIsAdmin) {
        throw new ForbiddenException(
          'Only a System Administrator can remove the System Administrator role.',
        );
      }
      if (userId === PROTECTED_SYSTEM_ADMIN_ID) {
        throw new ForbiddenException(
          "This account's System Administrator access is permanently protected and cannot be revoked.",
        );
      }
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

  private async assertLoginNameAvailable(
    loginNameNormalized: string,
    excludeUserId?: string,
  ): Promise<void> {
    const existing = await this.prisma.user.findFirst({
      where: {
        loginNameNormalized,
        ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(LOGIN_NAME_CONFLICT);
    }
  }

  private async prepareLoginNameUpdate(
    userId: string,
    rawLoginName: string,
  ): Promise<{ loginName: string; loginNameNormalized: string }> {
    const loginName = rawLoginName.trim();
    if (!loginName) {
      throw new BadRequestException('Login name is required');
    }
    const loginNameNormalized = normalizeLoginName(loginName);
    await this.assertLoginNameAvailable(loginNameNormalized, userId);
    return { loginName, loginNameNormalized };
  }

  private async auditLoginNameChange(
    ctx: AuditContext,
    userId: string,
    before: string | null,
    after: string | null,
  ): Promise<void> {
    await this.auditService.create({
      userId: ctx.userId,
      companyId: ctx.companyId,
      module: AUTH_AUDIT_MODULE,
      action: 'LOGIN_NAME_UPDATED',
      recordType: 'User',
      recordId: userId,
      beforeValue: { loginName: before },
      afterValue: { loginName: after },
      source: AuditLogSource.USER_ACTION,
    });
  }

  /**
   * Login name is visible to HR/admin (users.view) and to the employee themself.
   * Pass targetUserId=null for list endpoints (viewer permissions only).
   */
  private async canViewLoginName(
    ctx: AuditContext,
    targetUserId: string | null,
  ): Promise<boolean> {
    if (targetUserId != null && targetUserId === ctx.userId) {
      return true;
    }
    return this.permissionService.hasPermission(
      ctx.userId,
      ctx.companyId,
      'users',
      'view',
    );
  }

  private applyLoginNameVisibility<
    T extends { loginName?: string | null } | null,
  >(user: T, canView: boolean): T {
    if (!user || canView) {
      return user;
    }
    const { loginName: _omit, ...rest } = user as {
      loginName?: string | null;
    } & Record<string, unknown>;
    return rest as T;
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
      seniorityLevelId: true,
      seniorityLevel: { select: { id: true, name: true, nameZh: true } },
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
      tin: true,
      nationality: true,
      employeeType: true,
      educationLevel: true,
      fieldOfStudy: true,
      employmentDate: true,
      employmentStatus: true,
      yearsOfExperience: true,
      yearsOfExperienceAsOf: true,
      emergencyContacts: true,
      excludedFromHrProcesses: true,
      excludedReason: true,
      leavePolicyId: true,
      leavePolicy: { select: { id: true, name: true } },
      workScheduleId: true,
      workSchedule: { select: { id: true, name: true, isDefault: true } },
      profileFolderId: true,
      photoDocumentId: true,
      firstName: true,
      lastName: true,
      chineseName: true,
      loginName: true,
      email: true,
      phone: true,
      secondaryPhone: true,
      preferredLanguage: true,
      preferredTimezone: true,
      preferredDateFormat: true,
      bankName: true,
      bankBranch: true,
      bankAccountNumber: true,
      includeInPayroll: true,
      attendanceMode: true,
      isActive: true,
      mfaEnabled: true,
      mustChangePassword: true,
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
      middleName: true,
      lastName: true,
      chineseName: true,
      email: true,
      positionId: true,
      position: { select: { id: true, title: true } },
      discipline: true,
      engineeringDisciplineId: true,
      engineeringDiscipline: { select: { id: true, name: true, nameZh: true } },
      isActive: true,
      employmentStatus: true,
      excludedFromHrProcesses: true,
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
    tin?: string;
    nationality?: CreateUserDto['nationality'];
    employeeType?: CreateUserDto['employeeType'];
    educationLevel?: CreateUserDto['educationLevel'];
    fieldOfStudy?: string;
    employmentDate?: string;
    secondaryPhone?: string;
    seniorityLevelId?: string;
    yearsOfExperience?: number | null;
    emergencyContacts?: CreateUserDto['emergencyContacts'];
    leavePolicyId?: string;
    workScheduleId?: string;
    bankName?: string;
    bankBranch?: string;
    bankAccountNumber?: string;
    includeInPayroll?: boolean;
    attendanceMode?: CreateUserDto['attendanceMode'];
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
      tin: dto.tin,
      nationality: dto.nationality,
      employeeType: dto.employeeType,
      educationLevel: dto.educationLevel,
      fieldOfStudy: dto.fieldOfStudy,
      employmentDate: dto.employmentDate,
      secondaryPhone: dto.secondaryPhone,
      seniorityLevelId: dto.seniorityLevelId,
      yearsOfExperience: dto.yearsOfExperience,
      emergencyContacts: dto.emergencyContacts,
      leavePolicyId: dto.leavePolicyId,
      workScheduleId: dto.workScheduleId,
      bankName: dto.bankName,
      bankBranch: dto.bankBranch,
      bankAccountNumber: dto.bankAccountNumber,
      includeInPayroll: dto.includeInPayroll,
      attendanceMode: dto.attendanceMode,
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
      tin?: string;
      nationality?: CreateUserDto['nationality'];
      employeeType?: CreateUserDto['employeeType'];
      educationLevel?: CreateUserDto['educationLevel'];
      fieldOfStudy?: string;
      employmentDate?: string;
      secondaryPhone?: string;
      seniorityLevelId?: string;
      yearsOfExperience?: number | null;
      emergencyContacts?: CreateUserDto['emergencyContacts'];
      leavePolicyId?: string;
      workScheduleId?: string;
      bankName?: string;
      bankBranch?: string;
      bankAccountNumber?: string;
      includeInPayroll?: boolean;
      attendanceMode?: CreateUserDto['attendanceMode'];
    }>,
  ): Promise<void> {
    const employeeId =
      requestedEmployeeId?.trim() || (await this.nextEmployeeId());
    await this.assertEmployeeIdAvailable(ctx.companyId, employeeId, userId);

    if (profileInput.leavePolicyId) {
      await this.assertLeavePolicy(ctx.companyId, profileInput.leavePolicyId);
    }
    if (profileInput.seniorityLevelId) {
      await this.assertSeniorityLevel(ctx.companyId, profileInput.seniorityLevelId);
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
        tin: profileInput.tin?.trim() || null,
        nationality: profileInput.nationality as Prisma.UserUpdateInput['nationality'],
        employeeType: profileInput.employeeType as Prisma.UserUpdateInput['employeeType'],
        educationLevel:
          profileInput.educationLevel as Prisma.UserUpdateInput['educationLevel'],
        fieldOfStudy: profileInput.fieldOfStudy?.trim() || null,
        employmentDate: profileInput.employmentDate
          ? this.parseDateOnly(profileInput.employmentDate)
          : null,
        secondaryPhone: profileInput.secondaryPhone?.trim() || null,
        seniorityLevelId: profileInput.seniorityLevelId ?? null,
        yearsOfExperience: profileInput.yearsOfExperience ?? null,
        yearsOfExperienceAsOf:
          profileInput.yearsOfExperience != null ? todayDateOnly() : null,
        emergencyContacts: this.normalizeEmergencyContacts(profileInput.emergencyContacts),
        leavePolicyId: profileInput.leavePolicyId ?? null,
        bankName: profileInput.bankName?.trim() || null,
        bankBranch: profileInput.bankBranch?.trim() || null,
        bankAccountNumber: profileInput.bankAccountNumber?.trim() || null,
        includeInPayroll: profileInput.includeInPayroll ?? true,
        attendanceMode:
          (profileInput.attendanceMode as Prisma.UserUpdateInput['attendanceMode']) ??
          (profileInput.employeeType === 'FREELANCER' ? 'EXEMPT' : 'SCANNER'),
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

    if (profileInput.workScheduleId) {
      await this.workScheduleService.syncEmployeeSchedule(
        userId,
        profileInput.workScheduleId,
        ctx.companyId,
        ctx.userId,
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
      | 'tin'
      | 'nationality'
      | 'employeeType'
      | 'educationLevel'
      | 'fieldOfStudy'
      | 'employmentDate'
      | 'yearsOfExperience'
      | 'emergencyContacts'
      | 'leavePolicyId'
      | 'workScheduleId'
    >,
  ): Prisma.UserUncheckedUpdateInput {
    return {
      firstName: rest.firstName?.trim() || undefined,
      lastName:
        rest.lastName !== undefined ? rest.lastName.trim() : undefined,
      chineseName: rest.chineseName?.trim() || undefined,
      phone: rest.phone?.trim() || undefined,
      secondaryPhone:
        rest.secondaryPhone !== undefined
          ? rest.secondaryPhone?.trim() || null
          : undefined,
      branchId: rest.branchId,
      departmentId: rest.departmentId,
      positionId: rest.positionId,
      seniorityLevelId: rest.seniorityLevelId,
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
        | 'tin'
        | 'nationality'
        | 'employeeType'
        | 'educationLevel'
        | 'fieldOfStudy'
        | 'employmentDate'
        | 'emergencyContacts'
        | 'leavePolicyId'
        | 'bankName'
        | 'bankBranch'
        | 'bankAccountNumber'
        | 'includeInPayroll'
        | 'attendanceMode'
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
    if (rest.tin !== undefined) {
      data.tin = rest.tin?.trim() || null;
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
    if (rest.employmentDate !== undefined) {
      data.employmentDate = rest.employmentDate
        ? this.parseDateOnly(rest.employmentDate)
        : null;
    }
    if (rest.emergencyContacts !== undefined) {
      data.emergencyContacts = this.normalizeEmergencyContacts(rest.emergencyContacts);
    }
    if (rest.leavePolicyId !== undefined) {
      data.leavePolicyId = rest.leavePolicyId || null;
    }
    if (rest.bankName !== undefined) {
      data.bankName = rest.bankName?.trim() || null;
    }
    if (rest.bankBranch !== undefined) {
      data.bankBranch = rest.bankBranch?.trim() || null;
    }
    if (rest.bankAccountNumber !== undefined) {
      data.bankAccountNumber = rest.bankAccountNumber?.trim() || null;
    }
    if (rest.includeInPayroll !== undefined) {
      data.includeInPayroll = rest.includeInPayroll;
    }
    if (rest.attendanceMode !== undefined) {
      data.attendanceMode = rest.attendanceMode;
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

  private async assertSeniorityLevel(
    companyId: string,
    seniorityLevelId: string,
  ): Promise<void> {
    const level = await this.prisma.seniorityLevel.findFirst({
      where: activeOnly({ id: seniorityLevelId, companyId, isActive: true }),
      select: { id: true },
    });
    if (!level) {
      throw new BadRequestException('Seniority level not found or inactive');
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
      select: { id: true, excludedFromHrProcesses: true },
    });
    if (!manager) {
      throw new NotFoundException('Reports-to user not found');
    }
    if (!manager.excludedFromHrProcesses) {
      throw new BadRequestException(
        'Reports-to must be an approver-only employee',
      );
    }
    if (userId) {
      const cycle = await findReportsToCycle(
        userId,
        reportsToUserId,
        async (id) => {
          const row = await this.prisma.user.findFirst({
            where: activeOnly({ id, companyId }),
            select: { reportsToUserId: true },
          });
          return row?.reportsToUserId ?? null;
        },
      );
      if (cycle) {
        throw new BadRequestException(
          'Reports-to assignment would create a reporting cycle',
        );
      }
    }
  }

  /**
   * Read-only org-structure gap report for HR (employees, units, directory supervisors).
   */
  async getOrgGapReport(companyId: string): Promise<OrgGapReport> {
    const users = await this.prisma.user.findMany({
      where: activeOnly({ companyId }),
      select: {
        id: true,
        employeeId: true,
        firstName: true,
        middleName: true,
        lastName: true,
        loginName: true,
        chineseName: true,
        excludedFromHrProcesses: true,
        departmentId: true,
        engineeringDisciplineId: true,
        reportsToUserId: true,
        employmentStatus: true,
        isActive: true,
        department: { select: { name: true } },
        engineeringDiscipline: { select: { name: true } },
      },
    });

    const managerActive = (id: string | null): boolean => {
      if (!id) return false;
      const u = users.find((x) => x.id === id);
      return Boolean(u?.isActive && u.employmentStatus === 'ACTIVE');
    };

    let supervisorsWithoutAccount: string[] = [];
    try {
      const rows = readDirectoryOrgRows();
      const index = buildSupervisorAccountIndex(users);
      const approverPath = join(
        process.cwd(),
        'data',
        'private',
        'approver-only-users.json',
      );
      const approverJson = existsSync(approverPath)
        ? (JSON.parse(readFileSync(approverPath, 'utf8')) as Array<{
            fullName: string;
          }>)
        : [];
      const missing = new Set<string>();
      for (const row of rows) {
        if (!row.reportToRaw) continue;
        const { userId, canonical } = resolveSupervisorUserId(
          row.reportToRaw,
          index,
        );
        if (!userId && canonical && !isSupervisorInApproverJson(canonical, approverJson)) {
          missing.add(canonical);
        }
      }
      supervisorsWithoutAccount = [...missing].sort((a, b) =>
        a.localeCompare(b),
      );
    } catch {
      supervisorsWithoutAccount = [];
    }

    const departments = await this.prisma.department.findMany({
      where: activeOnly({ companyId }),
      select: { id: true, name: true, leaderUserId: true },
    });

    const disciplines = await this.prisma.discipline.findMany({
      where: activeOnly({ companyId }),
      select: { id: true, name: true, leaderId: true },
    });

    return buildOrgGapReport({
      users: users.map((u) => ({
        id: u.id,
        employeeId: u.employeeId,
        name: formatDisplayFullName(u),
        approverOnly: u.excludedFromHrProcesses,
        departmentId: u.departmentId,
        departmentName: u.department?.name ?? null,
        disciplineId: u.engineeringDisciplineId,
        disciplineName: u.engineeringDiscipline?.name ?? null,
        reportsToUserId: u.reportsToUserId,
        reportsToVacant:
          u.reportsToUserId != null && !managerActive(u.reportsToUserId),
      })),
      departments: departments.map((d) => ({
        id: d.id,
        name: d.name,
        leaderUserId: d.leaderUserId,
        leaderVacant:
          d.leaderUserId != null && !managerActive(d.leaderUserId),
      })),
      disciplines: disciplines.map((d) => ({
        id: d.id,
        name: d.name,
        leaderUserId: d.leaderId,
        leaderVacant: d.leaderId != null && !managerActive(d.leaderId),
      })),
      supervisorsWithoutAccount,
    });
  }

  /** Replaces the stored years of experience with today's value. */
  private mapUserResponse<
    T extends {
      yearsOfExperience?: number | null;
      yearsOfExperienceAsOf?: Date | null;
    },
  >(user: T | null): (T & { yearsOfExperience: number | null }) | null {
    if (!user) {
      return null;
    }
    return {
      ...user,
      yearsOfExperience: currentYearsOfExperience(
        user.yearsOfExperience,
        user.yearsOfExperienceAsOf,
      ),
    };
  }

  /**
   * Full bank account numbers only for users.edit (HR staff) or the employee themself.
   */
  private async canViewFullBankDetails(
    ctx: AuditContext,
    targetUserId: string | null,
  ): Promise<boolean> {
    if (targetUserId != null && targetUserId === ctx.userId) {
      return true;
    }
    return this.permissionService.hasPermission(
      ctx.userId,
      ctx.companyId,
      'users',
      'edit',
    );
  }

  private applyBankVisibility<
    T extends {
      bankName?: string | null;
      bankBranch?: string | null;
      bankAccountNumber?: string | null;
    } | null,
  >(
    user: T,
    canViewFull: boolean,
    isSelf: boolean,
  ): T {
    if (!user) {
      return user;
    }
    if (canViewFull || isSelf) {
      return user;
    }
    return {
      ...user,
      bankAccountNumber: maskBankAccountNumber(user.bankAccountNumber),
    };
  }

  /**
   * True when the user holds an active System Administrator role assignment
   * (primary or secondary).
   */
  private async isSystemAdmin(userId: string): Promise<boolean> {
    const adminRole = await this.prisma.userRole.findFirst({
      where: {
        userId,
        deletedAt: null,
        role: {
          name: SYSTEM_ADMINISTRATOR_ROLE,
          deletedAt: null,
          isActive: true,
        },
      },
      select: { id: true },
    });
    return adminRole !== null;
  }

  /**
   * Blocks assign/revoke of the System Administrator role for non-admins.
   */
  private async assertCanAssignOrRevokeSystemAdminRole(
    ctx: AuditContext,
    roleName: string,
    action: 'assign' | 'revoke',
  ): Promise<void> {
    if (roleName !== SYSTEM_ADMINISTRATOR_ROLE) {
      return;
    }
    const actingUserIsAdmin = await this.isSystemAdmin(ctx.userId);
    if (!actingUserIsAdmin) {
      throw new ForbiddenException(
        action === 'assign'
          ? 'Only a System Administrator can assign the System Administrator role.'
          : 'Only a System Administrator can remove the System Administrator role.',
      );
    }
  }

  /**
   * Blocks deactivate/delete of the protected account, and of other System
   * Administrators unless the actor is also a System Administrator.
   */
  private async assertCanDeactivateOrDeleteUser(
    ctx: AuditContext,
    userId: string,
  ): Promise<void> {
    if (userId === PROTECTED_SYSTEM_ADMIN_ID) {
      throw new ForbiddenException(
        'This account is permanently protected and cannot be deactivated.',
      );
    }

    const targetIsAdmin = await this.isSystemAdmin(userId);
    if (targetIsAdmin) {
      const actingUserIsAdmin = await this.isSystemAdmin(ctx.userId);
      if (!actingUserIsAdmin) {
        throw new ForbiddenException(
          'Only a System Administrator can deactivate another System Administrator account.',
        );
      }
    }
  }
}
