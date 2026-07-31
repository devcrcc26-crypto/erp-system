/**
 * Upserts overtime.view / overtime.create and grants them per product roles.
 * Usage: npx ts-node --transpile-only prisma/seed-overtime-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const viewPerm = await prisma.permission.upsert({
      where: { module_action: { module: 'overtime', action: 'view' } },
      update: { description: 'View overtime requests' },
      create: {
        module: 'overtime',
        action: 'view',
        description: 'View overtime requests',
      },
    });

    const createPerm = await prisma.permission.upsert({
      where: { module_action: { module: 'overtime', action: 'create' } },
      update: { description: 'Submit and cancel overtime requests' },
      create: {
        module: 'overtime',
        action: 'create',
        description: 'Submit and cancel overtime requests',
      },
    });

    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const viewRoles = await prisma.role.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        name: {
          in: [
            'System Administrator',
            'HR Officer',
            'General Manager',
            'Managing Director',
          ],
        },
      },
      select: { id: true, name: true },
    });

    const createRoles = await prisma.role.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        name: {
          in: [
            'System Administrator',
            'HR Officer',
            'General Manager',
            'Managing Director',
            'Employee',
          ],
        },
      },
      select: { id: true, name: true },
    });

    for (const role of viewRoles) {
      const isAdmin = role.name === 'System Administrator';
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: viewPerm.id,
          },
        },
        update: {
          canView: true,
          canCreate: isAdmin,
          canEdit: isAdmin,
          canDelete: isAdmin,
          canApprove: isAdmin,
          canExport: isAdmin,
          deletedAt: null,
          deletedBy: null,
          updatedBy: SYSTEM_USER_ID,
        },
        create: {
          roleId: role.id,
          permissionId: viewPerm.id,
          canView: true,
          canCreate: isAdmin,
          canEdit: isAdmin,
          canDelete: isAdmin,
          canApprove: isAdmin,
          canExport: isAdmin,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      });
    }

    for (const role of createRoles) {
      const isAdmin = role.name === 'System Administrator';
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
          canEdit: isAdmin,
          canDelete: isAdmin,
          canApprove: isAdmin,
          canExport: isAdmin,
          deletedAt: null,
          deletedBy: null,
          updatedBy: SYSTEM_USER_ID,
        },
        create: {
          roleId: role.id,
          permissionId: createPerm.id,
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

    console.log(
      `Overtime permissions seeded — view: ${viewRoles.map((r) => r.name).join(', ')}; create: ${createRoles.map((r) => r.name).join(', ')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
