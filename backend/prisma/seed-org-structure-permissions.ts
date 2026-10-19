/**
 * Upserts branches.* and departments.* role grants.
 * Keys are already defined in seed.ts (lines 87–95) — this script only updates role grants.
 * Usage: npx ts-node --transpile-only prisma/seed-org-structure-permissions.ts
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
const createFlags: Flags = { canView: true, canCreate: true, canEdit: false, canDelete: false, canApprove: false, canExport: false };
const editFlags: Flags = { canView: true, canCreate: false, canEdit: true, canDelete: false, canApprove: false, canExport: false };
const deleteFlags: Flags = { canView: true, canCreate: false, canEdit: false, canDelete: true, canApprove: false, canExport: false };

const GRANTS: Array<{ module: string; action: string; roles: string[]; flags: Flags }> = [
  {
    module: 'branches', action: 'view',
    roles: ['HR Manager', 'General Manager', 'Managing Director', 'System Administrator'],
    flags: viewOnly,
  },
  {
    module: 'branches', action: 'create',
    roles: ['System Administrator'],
    flags: createFlags,
  },
  {
    module: 'branches', action: 'edit',
    roles: ['System Administrator'],
    flags: editFlags,
  },
  {
    module: 'branches', action: 'delete',
    roles: ['System Administrator'],
    flags: deleteFlags,
  },
  {
    module: 'departments', action: 'view',
    roles: ['HR Assistant', 'HR Officer', 'HR Manager', 'General Manager', 'Managing Director', 'System Administrator'],
    flags: viewOnly,
  },
  {
    module: 'departments', action: 'create',
    roles: ['HR Manager', 'System Administrator'],
    flags: createFlags,
  },
  {
    module: 'departments', action: 'edit',
    roles: ['HR Manager', 'System Administrator'],
    flags: editFlags,
  },
  {
    module: 'departments', action: 'delete',
    roles: ['HR Manager', 'System Administrator'],
    flags: deleteFlags,
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

    console.log(`Org-structure permissions seeded for ${roles.length} role(s): ${roles.map((r) => r.name).join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
