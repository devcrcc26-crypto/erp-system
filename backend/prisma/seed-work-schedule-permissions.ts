/**
 * Upserts work-schedule / public-holiday / wfh permissions and role grants.
 * Usage: npx ts-node --transpile-only prisma/seed-work-schedule-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const PERMISSION_DEFS = [
  {
    module: 'work-schedule',
    action: 'view',
    description: 'View work schedules and preview working days',
  },
  {
    module: 'work-schedule',
    action: 'edit',
    description: 'Create and manage work schedules and assignments',
  },
  {
    module: 'public-holiday',
    action: 'view',
    description: 'View public holidays',
  },
  {
    module: 'public-holiday',
    action: 'manage',
    description: 'Create and manage public holidays',
  },
  { module: 'wfh', action: 'view', description: 'View work-from-home days and assignable employees' },
  { module: 'wfh', action: 'create', description: 'Submit and cancel work-from-home requests' },
  {
    module: 'wfh',
    action: 'manage',
    description: 'Directly assign and manage work-from-home calendar days',
  },
] as const;

const VIEW_CREATE_ROLES = [
  'Employee',
  'Team Lead',
  'Department Head',
  'Discipline Lead',
  'HR Assistant',
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

const MANAGE_ROLES = [
  'HR Assistant',
  'HR Manager',
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

    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const roleNames = [...new Set([...VIEW_CREATE_ROLES, ...MANAGE_ROLES])];
    const roles = await prisma.role.findMany({
      where: {
        companyId: company.id,
        deletedAt: null,
        name: { in: [...roleNames] },
      },
      select: { id: true, name: true },
    });

    for (const role of roles) {
      const grant = async (
        module: string,
        action: string,
        flags: {
          canView: boolean;
          canCreate: boolean;
          canEdit: boolean;
          canDelete: boolean;
          canApprove: boolean;
          canExport: boolean;
        },
      ): Promise<void> => {
        const perm = byKey.get(`${module}:${action}`);
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

      if (VIEW_CREATE_ROLES.includes(role.name as (typeof VIEW_CREATE_ROLES)[number])) {
        await grant('work-schedule', 'view', {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
        await grant('public-holiday', 'view', {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
        await grant('wfh', 'view', {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
        await grant('wfh', 'create', {
          canView: true,
          canCreate: true,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
      }

      if (MANAGE_ROLES.includes(role.name as (typeof MANAGE_ROLES)[number])) {
        await grant('work-schedule', 'edit', {
          canView: true,
          canCreate: false,
          canEdit: true,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
        await grant('public-holiday', 'manage', {
          canView: true,
          canCreate: false,
          canEdit: true,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
        await grant('wfh', 'manage', {
          canView: true,
          canCreate: false,
          canEdit: true,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
      }
    }

    console.log(
      `Work-schedule permissions seeded for ${roles.length} role(s): ${roles.map((r) => r.name).join(', ')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
