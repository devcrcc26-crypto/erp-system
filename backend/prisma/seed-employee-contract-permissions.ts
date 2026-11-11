/**
 * Upserts employee-contract.view / create / edit role grants.
 * Keys are already defined in seed.ts — this script only updates role grants.
 * Usage: npx ts-node --transpile-only prisma/seed-employee-contract-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const VIEW_ROLES = [
  'Employee',
  'Team Lead',
  'Department Head',
  'Discipline Leader',
  'HR Assistant',
  'HR Officer',
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

const CREATE_EDIT_ROLES = [
  'HR Assistant',
  'HR Officer',
  'HR Manager',
  'System Administrator',
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const [viewPerm, createPerm, editPerm] = await Promise.all([
      prisma.permission.upsert({
        where: { module_action: { module: 'employee-contract', action: 'view' } },
        update: { description: 'View employee contracts' },
        create: { module: 'employee-contract', action: 'view', description: 'View employee contracts' },
      }),
      prisma.permission.upsert({
        where: { module_action: { module: 'employee-contract', action: 'create' } },
        update: { description: 'Create employee contracts' },
        create: { module: 'employee-contract', action: 'create', description: 'Create employee contracts' },
      }),
      prisma.permission.upsert({
        where: { module_action: { module: 'employee-contract', action: 'edit' } },
        update: { description: 'Update, terminate and delete employee contracts' },
        create: { module: 'employee-contract', action: 'edit', description: 'Update, terminate and delete employee contracts' },
      }),
    ]);

    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const allRoleNames = [...new Set([...VIEW_ROLES, ...CREATE_EDIT_ROLES])];
    const roles = await prisma.role.findMany({
      where: { companyId: company.id, deletedAt: null, name: { in: allRoleNames } },
      select: { id: true, name: true },
    });

    const grant = async (
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
    ): Promise<void> => {
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: { ...flags, deletedAt: null, deletedBy: null, updatedBy: SYSTEM_USER_ID },
        create: { roleId, permissionId, ...flags, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
      });
    };

    for (const role of roles) {
      const isViewRole = (VIEW_ROLES as readonly string[]).includes(role.name);
      const isCreateEditRole = (CREATE_EDIT_ROLES as readonly string[]).includes(role.name);

      if (isViewRole) {
        await grant(role.id, viewPerm.id, {
          canView: true, canCreate: false, canEdit: false,
          canDelete: false, canApprove: false, canExport: false,
        });
      }
      if (isCreateEditRole) {
        await grant(role.id, createPerm.id, {
          canView: true, canCreate: true, canEdit: false,
          canDelete: false, canApprove: false, canExport: false,
        });
        await grant(role.id, editPerm.id, {
          canView: true, canCreate: false, canEdit: true,
          canDelete: true, canApprove: false, canExport: true,
        });
      }
    }

    console.log(
      `Employee-contract permissions seeded for ${roles.length} role(s): ${roles.map((r) => r.name).join(', ')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
