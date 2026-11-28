/**
 * Upserts contracts.view (contracts.view_salary) and grants it to HR Manager,
 * Local HR Manager, General Manager, Managing Director and System Administrator.
 *
 * Usage: npx ts-node --transpile-only prisma/seed-contract-salary-permission.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const SALARY_VIEW_ROLES = [
  'HR Manager',
  'Local HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const permission = await prisma.permission.upsert({
      where: { module_action: { module: 'contracts', action: 'view' } },
      update: {
        description: 'View employee contract salaries (contracts.view_salary)',
      },
      create: {
        module: 'contracts',
        action: 'view',
        description: 'View employee contract salaries (contracts.view_salary)',
      },
    });

    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });

    for (const company of companies) {
      const roles = await prisma.role.findMany({
        where: {
          companyId: company.id,
          deletedAt: null,
          name: { in: [...SALARY_VIEW_ROLES] },
        },
        select: { id: true, name: true },
      });

      for (const role of roles) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: permission.id,
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
            permissionId: permission.id,
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
    }

    console.log(
      `contracts.view_salary seeded for ${SALARY_VIEW_ROLES.join(', ')} across ${companies.length} company(ies)`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
