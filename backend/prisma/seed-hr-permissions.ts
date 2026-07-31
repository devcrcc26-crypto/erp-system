/**
 * Idempotent upsert of hr.view for HR-access roles.
 * Usage: npx ts-node --transpile-only prisma/seed-hr-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const HR_VIEW_ROLE_NAMES = [
  'General Manager',
  'Managing Director',
  'HR Officer',
  'System Administrator',
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const permission = await prisma.permission.upsert({
      where: {
        module_action: { module: 'hr', action: 'view' },
      },
      update: {
        description: 'Access Human Resources module and HR workflows',
      },
      create: {
        module: 'hr',
        action: 'view',
        description: 'Access Human Resources module and HR workflows',
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

    const roles = await prisma.role.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        name: { in: [...HR_VIEW_ROLE_NAMES] },
      },
      select: { id: true, name: true },
    });

    for (const role of roles) {
      const isAdmin = role.name === 'System Administrator';
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
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
          permissionId: permission.id,
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

    const employee = await prisma.role.findFirst({
      where: {
        companyId: company.id,
        name: 'Employee',
        deletedAt: null,
      },
      select: { id: true },
    });
    if (employee) {
      const leavePermissions = await prisma.permission.findMany({
        where: { module: 'leave' },
        select: { id: true },
      });
      if (leavePermissions.length > 0) {
        await prisma.rolePermission.updateMany({
          where: {
            roleId: employee.id,
            permissionId: { in: leavePermissions.map((p) => p.id) },
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }
    }

    console.log(
      `hr.view seeded for ${roles.length} role(s): ${roles.map((r) => r.name).join(', ')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
