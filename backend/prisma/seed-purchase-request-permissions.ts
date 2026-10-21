/**
 * Upserts purchase-request permissions and grants them to roles.
 * Usage: npx ts-node --transpile-only prisma/seed-purchase-request-permissions.ts
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
const manageFl: Flags = { canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: false };

/** HR Manager and executive roles — create, submit, and manage purchase requests. */
const PURCHASE_REQUEST_ACCESS_ROLES = [
  'System Administrator',
  'HR Manager',
  'General Manager',
  'Managing Director',
];

const GRANTS: Array<{ module: string; action: string; description: string; roles: string[]; flags: Flags }> = [
  {
    module: 'purchase-request',
    action: 'view',
    description: 'View purchase requests',
    roles: PURCHASE_REQUEST_ACCESS_ROLES,
    flags: viewOnly,
  },
  {
    module: 'purchase-request',
    action: 'create',
    description: 'Submit and cancel purchase requests',
    roles: PURCHASE_REQUEST_ACCESS_ROLES,
    flags: viewCreate,
  },
  {
    module: 'purchase-request',
    action: 'manage',
    description: 'Manage purchase requests (HR)',
    roles: PURCHASE_REQUEST_ACCESS_ROLES,
    flags: manageFl,
  },
];

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

    const allRoleNames = [...new Set(GRANTS.flatMap((g) => g.roles))];
    const roles = await prisma.role.findMany({
      where: { companyId: company.id, deletedAt: null, name: { in: allRoleNames } },
      select: { id: true, name: true },
    });
    const roleMap = new Map(roles.map((r) => [r.name, r.id]));

    for (const { module, action, description, roles: grantRoles, flags } of GRANTS) {
      const perm = await prisma.permission.upsert({
        where: { module_action: { module, action } },
        update: { description },
        create: { module, action, description },
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

    console.log(`Purchase request permissions seeded for ${roles.length} role(s).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
