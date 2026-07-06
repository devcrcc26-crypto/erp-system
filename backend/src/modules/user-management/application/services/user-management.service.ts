import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PasswordService } from '../../../auth/application/services/password.service';
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
} from '../dtos/user-management.dtos';
import { UserProvisioningService } from './user-provisioning.service';

type AuditContext = { companyId: string; userId: string };

@Injectable()
export class UserManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly userProvisioningService: UserProvisioningService,
  ) {}

  async listUsers(
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
        select: this.userListSelect(),
      }),
      this.prisma.user.count({ where }),
    ]);
    return buildPaginatedResult(data, total, query.page, query.limit);
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
        },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async createUser(ctx: AuditContext, dto: CreateUserDto): Promise<unknown> {
    const { password, email, firstName, lastName, chineseName, ...rest } = dto;

    const sharedInput = {
      firstName,
      lastName,
      chineseName,
      phone: rest.phone,
      branchId: rest.branchId,
      departmentId: rest.departmentId,
      positionId: rest.positionId,
      discipline: rest.discipline,
      engineeringDisciplineId: rest.engineeringDisciplineId,
      preferredLanguage: rest.preferredLanguage,
      preferredTimezone: rest.preferredTimezone,
      preferredDateFormat: rest.preferredDateFormat,
      isActive: rest.isActive,
    };

    // Record-only user (no email): no authentication, no invitation email.
    if (!email) {
      const user = await this.userProvisioningService.provisionRecordOnlyUser(
        ctx,
        sharedInput,
      );

      return this.prisma.user.findFirst({
        where: activeOnly({ id: user.id, companyId: ctx.companyId }),
        select: this.userSelect(),
      });
    }

    if (password) {
      const user = await this.userProvisioningService.provisionWithPassword(
        ctx,
        { email, password, ...sharedInput },
      );

      return this.prisma.user.findFirst({
        where: activeOnly({ id: user.id, companyId: ctx.companyId }),
        select: this.userSelect(),
      });
    }

    const user = await this.userProvisioningService.provisionInvitedUser(ctx, {
      email,
      ...sharedInput,
    });

    await this.userProvisioningService.sendActivationInvite(user);

    const created = await this.prisma.user.findFirst({
      where: activeOnly({ id: user.id, companyId: ctx.companyId }),
      select: this.userSelect(),
    });

    return { ...created, invitationSent: true };
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
    await this.getUser(ctx, id);
    const { password, ...rest } = dto;
    const data: Prisma.UserUpdateInput = {
      ...rest,
      updatedBy: ctx.userId,
    };
    if (password) {
      data.passwordHash = await this.passwordService.hash(password);
    }
    return this.prisma.user.update({
      where: { id },
      data,
      select: this.userSelect(),
    });
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

    return this.prisma.userRole.upsert({
      where: {
        userId_roleId: { userId, roleId: dto.roleId },
      },
      update: {
        assignedBy: ctx.userId,
        updatedBy: ctx.userId,
        deletedAt: null,
        deletedBy: null,
      },
      create: {
        userId,
        roleId: dto.roleId,
        assignedBy: ctx.userId,
        createdBy: ctx.userId,
        updatedBy: ctx.userId,
      },
    });
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
    await this.prisma.userRole.update({
      where: { id: userRole.id },
      data: { deletedAt: new Date(), deletedBy: ctx.userId },
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
      positionId: true,
      discipline: true,
      engineeringDisciplineId: true,
      engineeringDiscipline: { select: { id: true, name: true, nameZh: true } },
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
        role: { select: { id: true, name: true } },
      },
    };
  }
}
