/**
 * Upserts overtime.view / overtime.create / overtime.edit / overtime.delete
 * and grants all four to every HR-eligible role.
 * Usage: npx ts-node --transpile-only prisma/seed-overtime-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSIONS: { action: string; description: string }[] = [
  { action: 'view', description: 'View overtime requests' },
  { action: 'create', description: 'Submit and cancel overtime requests' },
  { action: 'edit', description: 'Add, update and remove overtime entries' },
  { action: 'delete', description: 'Delete overtime sheets and entries' },
];

const MANAGE_ROLES: string[] = [
  'HR Assistant',
  'HR Officer',
  'HR Manager',
  'System Administrator',
];

const GRANT_ROLES: string[] = [
  'Employee',
  'Team Lead',
  'Department Head',
  'Discipline Leader',
  'HR Assistant',
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    // 1. Upsert all four permission keys
    const perms = await Promise.all(
      PERMISSIONS.map((p) =>
        prisma.permission.upsert({
          where: { module_action: { module: 'overtime', action: p.action } },
          update: { description: p.description },
          create: { module: 'overtime', action: p.action, description: p.description },
        }),
      ),
    );

    // 2. Resolve roles
    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const roleNames = [...new Set([...GRANT_ROLES, ...MANAGE_ROLES])];
    const roles = await prisma.role.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        name: { in: roleNames },
      },
      select: { id: true, name: true },
    });

    const managePerm = await prisma.permission.upsert({
      where: { module_action: { module: 'overtime', action: 'manage' } },
      update: {
        description: 'Manage overtime company-wide and imports',
      },
      create: {
        module: 'overtime',
        action: 'manage',
        description: 'Manage overtime company-wide and imports',
      },
    });

    // 3. Grant all four permissions to every resolved role
    for (const role of roles) {
      for (const perm of perms) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: perm.id },
          },
          update: {
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canApprove: false,
            canExport: false,
            deletedAt: null,
            deletedBy: null,
            updatedBy: SYSTEM_USER_ID,
          },
          create: {
            roleId: role.id,
            permissionId: perm.id,
            canView: true,
            canCreate: true,
            canEdit: true,
            canDelete: true,
            canApprove: false,
            canExport: false,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }
    }

    for (const role of roles) {
      if (!MANAGE_ROLES.includes(role.name)) {
        continue;
      }
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: { roleId: role.id, permissionId: managePerm.id },
        },
        update: {
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
          canApprove: true,
          canExport: true,
          deletedAt: null,
          deletedBy: null,
          updatedBy: SYSTEM_USER_ID,
        },
        create: {
          roleId: role.id,
          permissionId: managePerm.id,
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: true,
          canApprove: true,
          canExport: true,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      });
    }

    console.log(
      `Overtime permissions seeded — keys: ${[...perms.map((p) => `overtime.${p.action}`), 'overtime.manage'].join(', ')}; roles: ${roles.map((r) => r.name).join(', ')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
