/**
 * Idempotent upsert: HR Officer may view/create/edit/delete users and view roles
 * (for role assignment on employee forms).
 *
 * Usage: npx ts-node --transpile-only prisma/seed-hr-users-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const USERS_MANAGE_FLAGS = {
  canView: true,
  canCreate: true,
  canEdit: true,
  canDelete: true,
  canApprove: false,
  canExport: true,
} as const;

async function upsertRolePermission(
  prisma: PrismaClient,
  roleId: string,
  permissionId: string,
  flags: {
    canView: boolean;
    canCreate: boolean;
    canEdit: boolean;
    canDelete: boolean;
    canApprove: boolean;
    canExport: boolean;
  },
): Promise<void> {
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: { roleId, permissionId },
    },
    update: {
      ...flags,
      deletedAt: null,
      deletedBy: null,
      updatedBy: SYSTEM_USER_ID,
    },
    create: {
      roleId,
      permissionId,
      ...flags,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const hrRole = await prisma.role.findFirst({
      where: {
        companyId: company.id,
        name: 'HR Officer',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!hrRole) {
      throw new Error('HR Officer role not found');
    }

    const permissionKeys = [
      { module: 'users', action: 'view' },
      { module: 'users', action: 'create' },
      { module: 'users', action: 'edit' },
      { module: 'users', action: 'delete' },
      { module: 'roles', action: 'view' },
      { module: 'departments', action: 'view' },
    ] as const;

    const permissions = await prisma.permission.findMany({
      where: {
        OR: permissionKeys.map((key) => ({
          module: key.module,
          action: key.action,
        })),
      },
      select: { id: true, module: true, action: true },
    });

    const byKey = new Map(
      permissions.map((p) => [`${p.module}:${p.action}`, p.id] as const),
    );

    const usersViewId = byKey.get('users:view');
    const usersCreateId = byKey.get('users:create');
    const usersEditId = byKey.get('users:edit');
    const usersDeleteId = byKey.get('users:delete');
    const rolesViewId = byKey.get('roles:view');
    const departmentsViewId = byKey.get('departments:view');

    if (usersViewId) {
      await upsertRolePermission(prisma, hrRole.id, usersViewId, USERS_MANAGE_FLAGS);
    }
    if (usersCreateId) {
      await upsertRolePermission(prisma, hrRole.id, usersCreateId, {
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
    if (usersEditId) {
      await upsertRolePermission(prisma, hrRole.id, usersEditId, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canExport: true,
      });
    }
    if (usersDeleteId) {
      await upsertRolePermission(prisma, hrRole.id, usersDeleteId, {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: true,
        canApprove: false,
        canExport: false,
      });
    }
    if (rolesViewId) {
      await upsertRolePermission(prisma, hrRole.id, rolesViewId, {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
    if (departmentsViewId) {
      await upsertRolePermission(prisma, hrRole.id, departmentsViewId, {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }

    console.log(
      'HR Officer granted users manage (view/create/edit/delete) + roles.view + departments.view',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
