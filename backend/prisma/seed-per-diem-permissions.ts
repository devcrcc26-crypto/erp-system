/**
 * Upserts per-diem.view / per-diem.create (all roles) and
 * per-diem-rates.view / per-diem-rates.edit (HR Officer + System Administrator only).
 * Usage: npx ts-node --transpile-only prisma/seed-per-diem-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const requestDefs = [
      {
        module: 'per-diem',
        action: 'view',
        description: 'View per diem requests',
      },
      {
        module: 'per-diem',
        action: 'create',
        description: 'Submit and cancel per diem requests',
      },
    ] as const;

    const rateDefs = [
      {
        module: 'per-diem-rates',
        action: 'view',
        description: 'View per diem destination rates',
      },
      {
        module: 'per-diem-rates',
        action: 'edit',
        description: 'Create, update, and delete per diem destination rates',
      },
    ] as const;

    const requestPermissions = [];
    for (const def of requestDefs) {
      requestPermissions.push(
        await prisma.permission.upsert({
          where: { module_action: { module: def.module, action: def.action } },
          update: { description: def.description },
          create: { ...def },
        }),
      );
    }

    const ratePermissions = [];
    for (const def of rateDefs) {
      ratePermissions.push(
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

    for (const role of roles) {
      const isAdmin = role.name === 'System Administrator';
      const isHr = role.name === 'HR Officer';

      for (const permission of requestPermissions) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: permission.id },
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

      if (isAdmin || isHr) {
        for (const permission of ratePermissions) {
          await prisma.rolePermission.upsert({
            where: {
              roleId_permissionId: { roleId: role.id, permissionId: permission.id },
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
              permissionId: permission.id,
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
    }

    console.log(`Per diem permissions seeded for ${roles.length} role(s)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
