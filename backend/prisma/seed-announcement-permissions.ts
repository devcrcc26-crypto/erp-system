/**
 * Upserts the announcements module permissions and the role matrix:
 *   - HR Manager, Local HR Manager: view, create, edit, approve (publish), export
 *   - HR Specialist, HR Assistant:  view, create, edit (drafts only)
 *   - System Administrator:         full (also bypassed at runtime)
 *   - every other role:             view (own received announcements)
 * SYSTEM_UPDATE posts are additionally restricted to System Administrator in
 * AnnouncementService. Mirrors the announcements block in prisma/seed.ts.
 *
 * Usage: npx ts-node --transpile-only prisma/seed-announcement-permissions.ts
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

const VIEW: Flags = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
};
const DRAFTS: Flags = { ...VIEW, canCreate: true, canEdit: true };
const MANAGER: Flags = { ...DRAFTS, canApprove: true, canExport: true };
const FULL: Flags = { ...MANAGER, canDelete: true };

const ROLE_FLAGS: Record<string, Flags> = {
  'System Administrator': FULL,
  'HR Manager': MANAGER,
  'Local HR Manager': MANAGER,
  'HR Specialist': DRAFTS,
  'HR Assistant': DRAFTS,
};

const DEFINITIONS = [
  { module: 'announcements', action: 'view', description: 'View received announcements' },
  { module: 'announcements', action: 'create', description: 'Create announcement drafts' },
  { module: 'announcements', action: 'edit', description: 'Edit announcements' },
  {
    module: 'announcements',
    action: 'approve',
    description: 'Publish, schedule and archive announcements',
  },
  {
    module: 'announcements',
    action: 'export',
    description: 'Export announcement read statistics',
  },
] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const permissions = [];
    for (const def of DEFINITIONS) {
      permissions.push(
        await prisma.permission.upsert({
          where: { module_action: { module: def.module, action: def.action } },
          update: { description: def.description },
          create: { ...def },
        }),
      );
    }

    const companies = await prisma.company.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    const roles = await prisma.role.findMany({
      where: { companyId: { in: companies.map((company) => company.id) }, deletedAt: null },
      select: { id: true, name: true },
    });

    const matrix: Record<string, string> = {};
    for (const role of roles) {
      const flags = ROLE_FLAGS[role.name] ?? VIEW;
      matrix[role.name] = Object.entries(flags)
        .filter(([, value]) => value)
        .map(([key]) => key.replace(/^can/, '').toLowerCase())
        .join(', ');
      for (const permission of permissions) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
          update: { ...flags, deletedAt: null, updatedBy: SYSTEM_USER_ID },
          create: {
            roleId: role.id,
            permissionId: permission.id,
            ...flags,
            createdBy: SYSTEM_USER_ID,
            updatedBy: SYSTEM_USER_ID,
          },
        });
      }
    }

    console.log(`Announcement permissions seeded for ${roles.length} role(s):`);
    for (const [roleName, flags] of Object.entries(matrix).sort()) {
      console.log(`  ${roleName.padEnd(28)} ${flags}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
