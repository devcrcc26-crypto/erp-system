/**
 * Grants HR Officer view access to Users and Departments (Organization sidebar).
 * Usage: npx ts-node --transpile-only prisma/scripts/grant-hr-organization-nav.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const role = await prisma.role.findFirst({
      where: { name: 'HR Officer', deletedAt: null },
      select: { id: true, name: true },
    });
    if (!role) {
      throw new Error('HR Officer role not found');
    }

    const permissions = await prisma.permission.findMany({
      where: {
        OR: [
          { module: 'departments', action: 'view' },
          { module: 'users', action: 'view' },
        ],
      },
      select: { id: true, module: true, action: true },
    });

    const flags = {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
      updatedBy: SYSTEM_USER_ID,
      deletedAt: null,
      deletedBy: null,
    };

    for (const permission of permissions) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: flags,
        create: {
          roleId: role.id,
          permissionId: permission.id,
          ...flags,
          createdBy: SYSTEM_USER_ID,
        },
      });
      console.log(
        `Granted ${permission.module}.${permission.action} to ${role.name}`,
      );
    }

    console.log('Done');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
