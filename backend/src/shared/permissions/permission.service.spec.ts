import { PermissionService } from './permission.service';
import { PrismaService } from '../prisma/prisma.service';

describe('PermissionService', () => {
  let prisma: {
    userRole: { findMany: jest.Mock };
    rolePermission: { findMany: jest.Mock };
    role: { findFirst: jest.Mock };
  };
  let service: PermissionService;

  beforeEach(() => {
    prisma = {
      userRole: { findMany: jest.fn() },
      rolePermission: { findMany: jest.fn() },
      role: { findFirst: jest.fn() },
    };
    service = new PermissionService(prisma as unknown as PrismaService);
  });

  it('returns false when user has no roles', async () => {
    prisma.userRole.findMany.mockResolvedValue([]);

    await expect(
      service.hasPermission('user-1', 'company-1', 'users', 'view'),
    ).resolves.toBe(false);
  });

  it('grants all permissions to System Administrator', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        roleId: 'admin-role',
        role: {
          companyId: 'company-1',
          isActive: true,
          name: 'System Administrator',
        },
      },
    ]);

    await expect(
      service.hasPermission('user-1', 'company-1', 'users', 'delete'),
    ).resolves.toBe(true);

    const flags = await service.getUserModulePermissions(
      'user-1',
      'company-1',
      'users',
    );

    expect(flags).toEqual({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
      canExport: true,
    });
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });

  it('merges permissions from role inheritance chain', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        roleId: 'child-role',
        role: { companyId: 'company-1', isActive: true },
      },
    ]);

    prisma.role.findFirst
      .mockResolvedValueOnce({ parentRoleId: 'parent-role' })
      .mockResolvedValueOnce({ parentRoleId: null });

    prisma.rolePermission.findMany.mockResolvedValue([
      {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
        permission: { module: 'users' },
      },
      {
        canView: false,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
        permission: { module: 'users' },
      },
    ]);

    const flags = await service.getUserModulePermissions(
      'user-1',
      'company-1',
      'users',
    );

    expect(flags.canView).toBe(true);
    expect(flags.canCreate).toBe(true);
    expect(prisma.role.findFirst).toHaveBeenCalledTimes(2);
  });

  it('ignores roles from another company', async () => {
    prisma.userRole.findMany.mockResolvedValue([
      {
        roleId: 'role-1',
        role: { companyId: 'other-company', isActive: true },
      },
    ]);

    const flags = await service.getUserModulePermissions(
      'user-1',
      'company-1',
      'users',
    );

    expect(flags.canView).toBe(false);
    expect(prisma.rolePermission.findMany).not.toHaveBeenCalled();
  });
});
