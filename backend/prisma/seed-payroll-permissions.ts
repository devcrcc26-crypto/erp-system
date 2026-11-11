/**
 * Upserts payroll.* and company_settings view/edit role grants.
 * Usage: npx ts-node --transpile-only prisma/seed-payroll-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const PAYROLL_PERMISSION_DEFS = [
  {
    module: 'payroll',
    action: 'view',
    description: 'View payroll records and payslips',
  },
  {
    module: 'payroll',
    action: 'create',
    description: 'Run payroll calculations',
  },
  {
    module: 'payroll',
    action: 'edit',
    description: 'Edit payroll entries',
  },
  {
    module: 'payroll',
    action: 'approve',
    description: 'Approve and lock payroll',
  },
  {
    module: 'payroll',
    action: 'export',
    description: 'Export payroll and bank files',
  },
] as const;

const COMPANY_SETTINGS_DEFS = [
  { module: 'company_settings', action: 'view', description: 'View company settings' },
  { module: 'company_settings', action: 'edit', description: 'Edit company settings' },
] as const;

const PAYROLL_VIEW_ROLES = [
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

const PAYROLL_CREATE_EDIT_ROLES = [
  'HR Assistant',
  'HR Manager',
  'System Administrator',
] as const;

const PAYROLL_APPROVE_ROLES = [
  'HR Manager',
  'General Manager',
  'System Administrator',
] as const;

const PAYROLL_EXPORT_ROLES = [
  'HR Assistant',
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

const COMPANY_SETTINGS_VIEW_ROLES = [
  'HR Manager',
  'General Manager',
  'Managing Director',
  'System Administrator',
] as const;

const COMPANY_SETTINGS_EDIT_ROLES = ['HR Manager', 'System Administrator'] as const;

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const permissions = [];
    for (const def of [...PAYROLL_PERMISSION_DEFS, ...COMPANY_SETTINGS_DEFS]) {
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

    const roleNames = [
      ...new Set([
        ...PAYROLL_VIEW_ROLES,
        ...PAYROLL_CREATE_EDIT_ROLES,
        ...PAYROLL_APPROVE_ROLES,
        ...PAYROLL_EXPORT_ROLES,
        ...COMPANY_SETTINGS_VIEW_ROLES,
        ...COMPANY_SETTINGS_EDIT_ROLES,
      ]),
    ];
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

      if (PAYROLL_VIEW_ROLES.includes(role.name as (typeof PAYROLL_VIEW_ROLES)[number])) {
        await grant('payroll', 'view', {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
      }
      if (
        PAYROLL_CREATE_EDIT_ROLES.includes(
          role.name as (typeof PAYROLL_CREATE_EDIT_ROLES)[number],
        )
      ) {
        await grant('payroll', 'create', {
          canView: true,
          canCreate: true,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
        await grant('payroll', 'edit', {
          canView: true,
          canCreate: false,
          canEdit: true,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
      }
      if (
        PAYROLL_APPROVE_ROLES.includes(role.name as (typeof PAYROLL_APPROVE_ROLES)[number])
      ) {
        await grant('payroll', 'approve', {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: true,
          canExport: false,
        });
      }
      if (
        PAYROLL_EXPORT_ROLES.includes(role.name as (typeof PAYROLL_EXPORT_ROLES)[number])
      ) {
        await grant('payroll', 'export', {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: true,
        });
      }
      if (
        COMPANY_SETTINGS_VIEW_ROLES.includes(
          role.name as (typeof COMPANY_SETTINGS_VIEW_ROLES)[number],
        )
      ) {
        await grant('company_settings', 'view', {
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
          canApprove: false,
          canExport: false,
        });
      }
      if (
        COMPANY_SETTINGS_EDIT_ROLES.includes(
          role.name as (typeof COMPANY_SETTINGS_EDIT_ROLES)[number],
        )
      ) {
        await grant('company_settings', 'edit', {
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
      `Payroll permissions seeded for ${roles.length} role(s): ${roles.map((r) => r.name).join(', ')}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
