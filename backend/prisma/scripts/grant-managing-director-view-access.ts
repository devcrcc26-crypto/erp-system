/**
 * Gives the Managing Director role VIEW-ONLY access to payroll and the
 * employee list, for one company. Touches only Managing Director
 * role_permission rows in these modules; no deletes, no other roles.
 *
 *   payroll.view              own payslips (every employee has this)
 *   payroll-oversight.view    all payroll runs, read-only, bank details masked
 *   company_settings.view     payroll letterhead / bank-letter settings (read)
 *   users.view                employee list and profiles (read)
 *
 * Any existing Managing Director row in payroll, payroll-oversight, users or
 * company_settings is set to view-only (create/edit/delete/approve/export off).
 *
 * Run: cd backend && npx ts-node --transpile-only prisma/scripts/grant-managing-director-view-access.ts [--apply]
 * Dry run unless --apply. Set COMPANY_ID=<uuid> when more than one company exists.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ROLE_NAME = 'Managing Director';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const VIEW_ONLY = {
  canView: true,
  canCreate: false,
  canEdit: false,
  canDelete: false,
  canApprove: false,
  canExport: false,
} as const;

const GRANTS: ReadonlyArray<{ module: string; action: string; description: string }> = [
  { module: 'payroll', action: 'view', description: 'View payroll records and payslips' },
  {
    module: 'payroll-oversight',
    action: 'view',
    description: 'View all payroll runs (read-only; bank details masked)',
  },
  { module: 'company_settings', action: 'view', description: 'View company settings' },
  { module: 'users', action: 'view', description: 'View users' },
];

const VIEW_ONLY_MODULES = ['payroll', 'payroll-oversight', 'users', 'company_settings'];

async function resolveCompanyId(): Promise<string> {
  const fromEnv = process.env.COMPANY_ID?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const companies = await prisma.company.findMany({
    where: { deletedAt: null },
    select: { id: true },
    take: 2,
  });
  if (companies.length !== 1) {
    throw new Error('Expected exactly one company. Set COMPANY_ID to choose one.');
  }
  return companies[0].id;
}

function describeFlags(flags: {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}): string {
  const on = Object.entries(flags)
    .filter(([key, value]) => key.startsWith('can') && value)
    .map(([key]) => key.slice(3).toLowerCase());
  return on.length > 0 ? on.join(',') : '(none)';
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const companyId = await resolveCompanyId();

  const role = await prisma.role.findFirst({
    where: { companyId, name: ROLE_NAME, deletedAt: null },
    select: { id: true },
  });
  if (!role) {
    throw new Error(`Role "${ROLE_NAME}" not found in company ${companyId}`);
  }

  const existing = await prisma.rolePermission.findMany({
    where: { roleId: role.id, permission: { module: { in: VIEW_ONLY_MODULES } } },
    select: {
      id: true,
      deletedAt: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
      canExport: true,
      permission: { select: { module: true, action: true } },
    },
  });

  console.log(`${ROLE_NAME}: current rows in ${VIEW_ONLY_MODULES.join(', ')}`);
  for (const row of existing) {
    console.log(
      `  ${row.permission.module}.${row.permission.action}: ${describeFlags(row)}` +
        (row.deletedAt ? ' (deleted)' : ''),
    );
  }
  if (existing.length === 0) {
    console.log('  (none)');
  }

  const grantKeys = new Set(GRANTS.map((g) => `${g.module}.${g.action}`));
  const toDowngrade = existing.filter(
    (row) =>
      !row.deletedAt &&
      !grantKeys.has(`${row.permission.module}.${row.permission.action}`) &&
      (row.canCreate || row.canEdit || row.canDelete || row.canApprove || row.canExport),
  );

  console.log('\nPlanned:');
  for (const g of GRANTS) {
    console.log(`  upsert ${g.module}.${g.action} → view only`);
  }
  for (const row of toDowngrade) {
    console.log(`  downgrade ${row.permission.module}.${row.permission.action} → view only`);
  }

  if (!apply) {
    console.log('\nDry run - nothing written. Re-run with --apply to commit.');
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const g of GRANTS) {
      const permission = await tx.permission.upsert({
        where: { module_action: { module: g.module, action: g.action } },
        update: {},
        create: { module: g.module, action: g.action, description: g.description },
        select: { id: true },
      });
      await tx.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: { ...VIEW_ONLY, deletedAt: null, deletedBy: null, updatedBy: SYSTEM_USER_ID },
        create: {
          roleId: role.id,
          permissionId: permission.id,
          ...VIEW_ONLY,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      });
    }
    for (const row of toDowngrade) {
      await tx.rolePermission.update({
        where: { id: row.id },
        data: { ...VIEW_ONLY, updatedBy: SYSTEM_USER_ID },
      });
    }
  });

  console.log(`\nDone. ${GRANTS.length} grants upserted, ${toDowngrade.length} rows downgraded.`);
}

main()
  .catch((error: unknown) => {
    console.error('Managing Director view-access grant failed (nothing committed):', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
