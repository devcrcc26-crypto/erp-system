/**
 * Upserts leave.view / leave.create permissions and grants them to System Administrator + Employee.
 * Usage: npx ts-node --transpile-only prisma/seed-leave-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const defs = [
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
    ] as const;

    const permissions = [];
    for (const def of defs) {
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
        name: { in: ['System Administrator', 'Employee', 'HR Officer'] },
      },
      select: { id: true, name: true },
    });

    for (const role of roles) {
      for (const permission of permissions) {
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
            canCreate: isAdmin || permission.action === 'create',
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
            canCreate: isAdmin || permission.action === 'create',
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
