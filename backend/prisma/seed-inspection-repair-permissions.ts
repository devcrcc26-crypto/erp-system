/**
 * Upserts inspection-repair permissions and grants create access to all roles.
 * HR Officer and System Administrator receive edit-level access.
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSION_DEFS = [
  {
    module: 'inspection-repair',
    action: 'view',
    description: 'View inspection and repair requests',
  },
  {
    module: 'inspection-repair',
    action: 'create',
    description: 'Submit and cancel inspection and repair requests',
  },
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const permissions = [];
    for (const def of PERMISSION_DEFS) {
      permissions.push(
        await prisma.permission.upsert({
          where: { module_action: { module: def.module, action: def.action } },
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

    const editRoles = new Set(['HR Officer', 'System Administrator']);

    for (const role of roles) {
      const isEditRole = editRoles.has(role.name);
      for (const permission of permissions) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {
            canView: true,
            canCreate: true,
            canEdit: isEditRole,
            canDelete: isEditRole,
            canApprove: isEditRole,
            canExport: isEditRole,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: permission.id,
            canView: true,
            canCreate: true,
            canEdit: isEditRole,
            canDelete: isEditRole,
            canApprove: isEditRole,
            canExport: isEditRole,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }
    }

    console.log(
      `Inspection & Repair permissions seeded for ${roles.length} role(s)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
