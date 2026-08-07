/**
 * Upserts consumables.view / consumables.create and grants them to every role.
 * Usage: npx ts-node --transpile-only prisma/seed-consumables-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const defs = [
      {
        module: 'consumables',
        action: 'view',
        description: 'View consumables requisitions',
      },
      {
        module: 'consumables',
        action: 'create',
        description: 'Submit and cancel consumables requisitions',
      },
    ] as const;

    const permissions = [];
    for (const def of defs) {
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

    for (const role of roles) {
      const isAdmin = role.name === 'System Administrator';
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
            canEdit: isAdmin,
            canDelete: isAdmin,
            canApprove: isAdmin,
            canExport: isAdmin,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: permission.id,
            canView: true,
            canCreate: true,
            canEdit: isAdmin,
            canDelete: isAdmin,
            canApprove: isAdmin,
            canExport: isAdmin,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }
    }

    console.log(
      `Consumables requisition permissions seeded for ${roles.length} role(s)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
