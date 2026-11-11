/**
 * Upserts leave.view / leave.create / leave.edit / leave.delete and role grants.
 * Usage: npx ts-node --transpile-only prisma/seed-leave-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSION_DEFS = [
  {
    module: 'leave',
    action: 'view',
    description: 'View leave requests and balances',
  },
  {
    module: 'leave',
    action: 'create',
    description: 'Submit and cancel leave requests',
  },
  {
    module: 'leave',
    action: 'edit',
    description: 'Edit leave requests',
  },
  {
    module: 'leave',
    action: 'delete',
    description: 'Delete leave requests',
  },
  {
    module: 'leave',
    action: 'manage',
    description: 'Manage leave company-wide, balances, and imports',
  },
] as const;

const MANAGE_ROLES = [
  'HR Assistant',
  'HR Officer',
  'HR Manager',
  'System Administrator',
] as const;

const VIEW_CREATE_ROLES = [
  'Employee',
  'Team Lead',
  'Department Head',
  'Discipline Lead',
  'HR Assistant',
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

const EDIT_ROLES = [
  'HR Assistant',
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

const DELETE_ROLES = [
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const permissions = [];
    for (const def of PERMISSION_DEFS) {
      permissions.push(
        await prisma.permission.upsert({
          where: {
            module_action: { module: def.module, action: def.action },
          },
          update: { description: def.description },
          create: def,
        }),
      );
    }

    const byAction = new Map(permissions.map((p) => [p.action, p]));

    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const roleNames = [
      ...new Set([
        ...VIEW_CREATE_ROLES,
        ...EDIT_ROLES,
        ...DELETE_ROLES,
        ...MANAGE_ROLES,
      ]),
    ];
    const roles = await prisma.role.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        name: { in: [...roleNames] },
      },
      select: { id: true, name: true },
    });

    for (const role of roles) {
      const viewPerm = byAction.get('view');
      const createPerm = byAction.get('create');
      const editPerm = byAction.get('edit');
      const deletePerm = byAction.get('delete');
      const managePerm = byAction.get('manage');

      if (
        viewPerm &&
        VIEW_CREATE_ROLES.includes(role.name as (typeof VIEW_CREATE_ROLES)[number])
      ) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: viewPerm.id,
            },
          },
          update: {
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: false,
            canApprove: false,
            canExport: false,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: viewPerm.id,
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: false,
            canApprove: false,
            canExport: false,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }

      if (
        createPerm &&
        VIEW_CREATE_ROLES.includes(role.name as (typeof VIEW_CREATE_ROLES)[number])
      ) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: createPerm.id,
            },
          },
          update: {
            canView: true,
            canCreate: true,
            canEdit: false,
            canDelete: false,
            canApprove: false,
            canExport: false,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: createPerm.id,
            canView: true,
            canCreate: true,
            canEdit: false,
            canDelete: false,
            canApprove: false,
            canExport: false,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }

      if (
        editPerm &&
        EDIT_ROLES.includes(role.name as (typeof EDIT_ROLES)[number])
      ) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: editPerm.id,
            },
          },
          update: {
            canView: true,
            canCreate: false,
            canEdit: true,
            canDelete: false,
            canApprove: false,
            canExport: false,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: editPerm.id,
            canView: true,
            canCreate: false,
            canEdit: true,
            canDelete: false,
            canApprove: false,
            canExport: false,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }

      if (
        deletePerm &&
        DELETE_ROLES.includes(role.name as (typeof DELETE_ROLES)[number])
      ) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: deletePerm.id,
            },
          },
          update: {
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: true,
            canApprove: false,
            canExport: false,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: deletePerm.id,
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: true,
            canApprove: false,
            canExport: false,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }

      if (
        managePerm &&
        MANAGE_ROLES.includes(role.name as (typeof MANAGE_ROLES)[number])
      ) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: managePerm.id,
            },
          },
          update: {
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canApprove: true,
            canExport: true,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: managePerm.id,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canApprove: true,
            canExport: true,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }
    }

    console.log(
      `Leave permissions seeded for ${roles.length} role(s): ${roles.map((r) => r.name).join(', ')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
