/**
 * Upserts employee-contract permissions and grants them to HR + Employee roles.
 * Usage: npx ts-node --transpile-only prisma/seed-employee-contract-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSION_DEFS = [
  {
    module: 'employee-contract',
    action: 'view',
    description: 'View employee contracts',
  },
  {
    module: 'employee-contract',
    action: 'create',
    description: 'Create employee contracts',
  },
  {
    module: 'employee-contract',
    action: 'edit',
    description: 'Update, terminate and delete employee contracts',
  },
] as const;

const MANAGE_ROLES = new Set(['HR Officer', 'System Administrator']);

const VIEW_ROLES = [
  'Employee',
  'HR Officer',
  'System Administrator',
  'General Manager',
  'Managing Director',
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
          create: { ...def },
        }),
      );
    }

    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const roles = await prisma.role.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
    });

    const viewPermission = permissions.find((p) => p.action === 'view');
    const createPermission = permissions.find((p) => p.action === 'create');
    const editPermission = permissions.find((p) => p.action === 'edit');

    if (!viewPermission || !createPermission || !editPermission) {
      throw new Error('Employee contract permissions were not created');
    }

    for (const role of roles) {
      const isManageRole = MANAGE_ROLES.has(role.name);
      const canView =
        VIEW_ROLES.includes(role.name as (typeof VIEW_ROLES)[number]) ||
        isManageRole;

      if (canView) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: viewPermission.id,
            },
          },
          update: {
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: false,
            canApprove: false,
            canExport: false,
            deletedAt: null,
            deletedBy: null,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: viewPermission.id,
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

      if (isManageRole) {
        for (const permission of [createPermission, editPermission]) {
          const isEdit = permission.action === 'edit';
          await prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: {
                roleId: role.id,
                permissionId: permission.id,
              },
            },
            update: {
              canView: true,
              canCreate: !isEdit,
              canEdit: isEdit,
              canDelete: isEdit,
              canApprove: false,
              canExport: isEdit,
              deletedAt: null,
              deletedBy: null,
              updatedBy: SYSTEM_USER_ID,
            },
            create: {
              roleId: role.id,
              permissionId: permission.id,
              canView: true,
              canCreate: !isEdit,
              canEdit: isEdit,
              canDelete: isEdit,
              canApprove: false,
              canExport: isEdit,
              createdBy: SYSTEM_USER_ID,
              updatedBy: SYSTEM_USER_ID,
            },
          });
        }
      }
    }

    console.log(
      `Employee contract permissions seeded for ${roles.length} role(s) (${permissions.length} permissions)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
