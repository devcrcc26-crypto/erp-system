/**
 * Upserts users.* and roles.* role grants.
 * Keys are already defined in seed.ts (lines 101–104 users, 106–109 roles).
 * Usage: npx ts-node --transpile-only prisma/seed-user-management-permissions.ts
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
const viewEdit: Flags = { canView: true, canCreate: false, canEdit: true, canDelete: false, canApprove: false, canExport: true };
const viewDelete: Flags = { canView: true, canCreate: false, canEdit: false, canDelete: true, canApprove: false, canExport: false };
const fullAccess: Flags = { canView: true, canCreate: true, canEdit: true, canDelete: true, canApprove: true, canExport: true };

const GRANTS: Array<{ module: string; action: string; roles: string[]; flags: Flags }> = [
  {
    module: 'users', action: 'view',
    roles: ['HR Assistant', 'HR Officer', 'HR Manager', 'General Manager', 'Managing Director', 'System Administrator'],
    flags: viewOnly,
  },
  {
    module: 'users', action: 'create',
    roles: ['HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator'],
    flags: viewCreate,
  },
  {
    module: 'users', action: 'edit',
    roles: ['HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator'],
    flags: viewEdit,
  },
  {
    module: 'users', action: 'delete',
    roles: ['HR Officer', 'HR Manager', 'System Administrator'],
    flags: viewDelete,
  },
  {
    module: 'roles', action: 'view',
    roles: ['HR Manager', 'General Manager', 'Managing Director', 'System Administrator'],
    flags: viewOnly,
  },
  {
    module: 'roles', action: 'create',
    roles: ['System Administrator'],
    flags: fullAccess,
  },
  {
    module: 'roles', action: 'edit',
    roles: ['System Administrator'],
    flags: fullAccess,
  },
  {
    module: 'roles', action: 'delete',
    roles: ['System Administrator'],
    flags: fullAccess,
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
      const perm = await prisma.permission.findUnique({
        where: { module_action: { module, action } },
        select: { id: true },
      });
      if (!perm) {
        console.warn(`Permission not found: ${module}.${action}`);
        continue;
      }
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

    console.log(`User-management permissions seeded for ${roles.length} role(s): ${roles.map((r) => r.name).join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
