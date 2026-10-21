/**
 * Upserts site-assignment.view / create / manage and role grants.
 * Usage: npx ts-node --transpile-only prisma/seed-site-assignment-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSION_DEFS = [
  {
    module: 'site-assignment',
    action: 'view',
    description: 'View site assignment requests',
  },
  {
    module: 'site-assignment',
    action: 'create',
    description: 'Submit and cancel site assignment requests',
  },
  {
    module: 'site-assignment',
    action: 'manage',
    description: 'HR manage site assignments (cancel approved, shorten, OT impact)',
  },
] as const;

const VIEW_CREATE_ROLES = [
  'Employee',
  'Team Lead',
  'Department Head',
  'Discipline Lead',
  'HR Assistant',
  'HR Officer',
  'HR Manager',
  'Local HR Manager',
  'HR Specialist',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

const MANAGE_ROLES = [
  'HR Assistant',
  'HR Officer',
  'HR Manager',
  'Local HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const permissions = [];
    for (const def of PERMISSION_DEFS) {
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

    const byKey = new Map(
      permissions.map((p) => [`${p.module}:${p.action}`, p] as const),
    );

    const roleNames = [...new Set([...VIEW_CREATE_ROLES, ...MANAGE_ROLES])];
    const roles = await prisma.role.findMany({
      where: {
        deletedAt: null,
        name: { in: [...roleNames] },
      },
      select: { id: true, name: true, companyId: true },
    });

    for (const role of roles) {
      const grant = async (
        action: 'view' | 'create' | 'manage',
        flags: {
          canView: boolean;
          canCreate: boolean;
          canEdit: boolean;
          canDelete: boolean;
          canApprove: boolean;
          canExport: boolean;
        },
      ): Promise<void> => {
        const perm = byKey.get(`site-assignment:${action}`);
        if (!perm) {
          return;
        }
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: { roleId: role.id, permissionId: perm.id },
          },
          update: { ...flags, updatedBy: SYSTEM_USER_ID },
          create: {
            roleId: role.id,
            permissionId: perm.id,
            ...flags,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      };

      if (
        VIEW_CREATE_ROLES.includes(role.name as (typeof VIEW_CREATE_ROLES)[number])
      ) {
        await grant('view', {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
        await grant('create', {
          canView: true,
          canCreate: true,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
      }

      if (MANAGE_ROLES.includes(role.name as (typeof MANAGE_ROLES)[number])) {
        await grant('manage', {
          canView: true,
          canCreate: false,
          canEdit: true,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
      }
    }

    const roleSummary = [...new Set(roles.map((r) => r.name))].sort().join(', ');
    console.log(
      `Site-assignment permissions seeded for ${roles.length} role row(s): ${roleSummary}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
