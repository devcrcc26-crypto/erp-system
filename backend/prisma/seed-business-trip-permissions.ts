/**
 * Upserts business-trip.view / create / manage and grants to roles.
 * Usage: npx ts-node --transpile-only prisma/seed-business-trip-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const defs = [
      {
        module: 'business-trip',
        action: 'view',
        description: 'View business trip applications',
      },
      {
        module: 'business-trip',
        action: 'create',
        description: 'Submit and cancel business trip applications',
      },
      {
        module: 'business-trip',
        action: 'manage',
        description: 'Attach business trip tickets after approval',
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

    const view = permissions.find((p) => p.action === 'view')!;
    const create = permissions.find((p) => p.action === 'create')!;
    const manage = permissions.find((p) => p.action === 'manage')!;

    for (const role of roles) {
      const isAdmin = role.name === 'System Administrator';
      const isHr = role.name === 'HR Officer';

      for (const permission of [view, create]) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
            },
          },
          update: {
            canView: true,
            canCreate: permission.action === 'create' || isAdmin,
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
            canCreate: permission.action === 'create' || isAdmin,
            canEdit: isAdmin,
            canDelete: isAdmin,
            canApprove: isAdmin,
            canExport: isAdmin,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }

      if (isAdmin || isHr) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: manage.id,
            },
          },
          update: {
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: isAdmin,
            canApprove: isAdmin,
            canExport: isAdmin,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: manage.id,
            canView: true,
            canCreate: true,
            canEdit: true,
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
      `Business trip permissions seeded for ${roles.length} role(s)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
