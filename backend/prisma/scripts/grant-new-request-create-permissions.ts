/**
 * Ensures New Request create permissions for all roles, and restricts
 * vehicle-refueling.create to Driver (+ HR Officer / HR Manager / System Administrator).
 * Also backfills approval_category.permission_module from the code map.
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only prisma/scripts/grant-new-request-create-permissions.ts
 */
import { PrismaClient } from '@prisma/client';
import {
  APPROVAL_CATEGORY_PERMISSION_MODULE,
  NEW_REQUEST_PERMISSION_MODULES,
} from '../../src/modules/approvals/application/utils/approval-category-permission.util';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

/** Roles that may create vehicle refueling requests (not Employee). */
const VEHICLE_REFUELING_CREATE_ROLES = new Set([
  'Driver',
  'HR Officer',
  'HR Manager',
  'System Administrator',
]);

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    // Raw SQL so this script works before `prisma generate` (DLL often locked by npm run dev).
    for (const [code, module] of Object.entries(
      APPROVAL_CATEGORY_PERMISSION_MODULE,
    )) {
      await prisma.$executeRaw`
        UPDATE approval_category
        SET permission_module = ${module}
        WHERE company_id = ${company.id}
          AND code = ${code}
          AND deleted_at IS NULL
      `;
    }
    console.log('Backfilled approval_category.permission_module');

    let driverRole = await prisma.role.findFirst({
      where: { companyId: company.id, name: 'Driver', deletedAt: null },
      select: { id: true, name: true },
    });
    if (!driverRole) {
      driverRole = await prisma.role.create({
        data: {
          companyId: company.id,
          name: 'Driver',
          description:
            'Company vehicle drivers, refueling and fleet self-service',
          isSystemRole: false,
          isActive: true,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
        select: { id: true, name: true },
      });
      console.log('Created Driver role');
    }

    const roles = await prisma.role.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
    });

    const employeeRole = roles.find((r) => r.name === 'Employee');
    const employeeBefore = new Set<string>();
    if (employeeRole) {
      const existing = await prisma.rolePermission.findMany({
        where: {
          roleId: employeeRole.id,
          deletedAt: null,
          canCreate: true,
          permission: {
            module: { in: [...NEW_REQUEST_PERMISSION_MODULES] },
            action: 'create',
          },
        },
        include: { permission: { select: { module: true } } },
      });
      for (const row of existing) {
        employeeBefore.add(row.permission.module);
      }
    }

    for (const module of NEW_REQUEST_PERMISSION_MODULES) {
      await prisma.permission.upsert({
        where: { module_action: { module, action: 'view' } },
        update: {},
        create: { module, action: 'view', description: `View ${module}` },
      });
      const createPerm = await prisma.permission.upsert({
        where: { module_action: { module, action: 'create' } },
        update: {},
        create: { module, action: 'create', description: `Create ${module}` },
      });

      for (const role of roles) {
        const allowCreate =
          module === 'vehicle-refueling'
            ? VEHICLE_REFUELING_CREATE_ROLES.has(role.name)
            : true;

        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId: createPerm.id,
            },
          },
          update: {
            canView: true,
            canCreate: allowCreate,
            deletedAt: null,
            deletedBy: null,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: createPerm.id,
            canView: true,
            canCreate: allowCreate,
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

    const grantedToEmployee: string[] = [];
    if (employeeRole) {
      for (const module of NEW_REQUEST_PERMISSION_MODULES) {
        if (module === 'vehicle-refueling') {
          if (employeeBefore.has(module)) {
            console.log(
              'Employee: revoked vehicle-refueling.create (Driver-only for New Request)',
            );
          }
          continue;
        }
        if (!employeeBefore.has(module)) {
          grantedToEmployee.push(module);
        }
      }
    }

    console.log(
      `New Request create permissions applied for ${roles.length} role(s)`,
    );
    console.log(
      'Employee newly granted create on:',
      grantedToEmployee.length > 0
        ? grantedToEmployee.sort().join(', ')
        : '(none, already had create on all non-refueling modules)',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
