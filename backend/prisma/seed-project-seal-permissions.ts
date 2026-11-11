/**
 * Upserts project-seal.* role grants.
 * Defines project-seal.view, project-seal.create, project-seal.manage.
 * Usage: npx ts-node --transpile-only prisma/seed-project-seal-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

type Flags = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
};

const viewOnly: Flags = { canView: true, canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };
const viewCreate: Flags = { canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false, canExport: false };
const manage: Flags = { canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: false };

const GRANTS: Array<{ module: string; action: string; roles: string[]; flags: Flags }> = [
  {
    module: 'project-seal', action: 'view',
    roles: [
      'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
      'HR Assistant', 'HR Officer', 'HR Manager', 'General Manager',
      'Managing Director', 'System Administrator',
    ],
    flags: viewOnly,
  },
  {
    module: 'project-seal', action: 'create',
    roles: [
      'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
      'HR Assistant', 'HR Officer', 'HR Manager', 'General Manager',
      'Managing Director', 'System Administrator',
    ],
    flags: viewCreate,
  },
  {
    module: 'project-seal', action: 'manage',
    roles: ['HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator'],
    flags: manage,
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const allRoleNames = [...new Set(GRANTS.flatMap((g) => g.roles))];

    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) {
      throw new Error('No company found');
    }

    const roles = await prisma.role.findMany({
      where: { companyId: company.id, deletedAt: null, name: { in: allRoleNames } },
      select: { id: true, name: true },
    });
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    for (const { module, action, roles: grantRoles, flags } of GRANTS) {
      const perm = await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: {},
        create: { module, action, description: `${action} project seal requests` },
        select: { id: true },
      });
      for (const roleName of grantRoles) {
        const roleId = roleMap.get(roleName);
        if (!roleId) {
          console.warn(`Role not found: ${roleName}`);
          continue;
        }
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId, permissionId: perm.id } },
          update: { ...flags, deletedAt: null, deletedBy: null, updatedBy: SYSTEM_USER_ID },
          create: { roleId, permissionId: perm.id, ...flags, createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID },
        });
      }
    }

    console.log(`Project seal permissions seeded for ${roles.length} role(s): ${roles.map((r) => r.name).join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
