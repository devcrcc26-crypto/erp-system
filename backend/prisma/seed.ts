import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/** Bootstrap actor for records created before the admin user exists. */
const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000001';

const CORE_ROLES = [
  'System Administrator',
  'Managing Director',
  'Project Manager',
  'Site Engineer',
  'Document Controller',
  'Finance Manager',
  'Accountant',
  'Procurement Officer',
  'Storekeeper',
  'HR Officer',
  'Safety Officer',
  'Employee',
] as const;

const PERMISSION_DEFINITIONS: Array<{
  module: string;
  action: string;
  description: string;
}> = [
  { module: 'company', action: 'view', description: 'View company profile' },
  { module: 'company', action: 'edit', description: 'Edit company profile' },
  { module: 'company_settings', action: 'view', description: 'View company settings' },
  { module: 'company_settings', action: 'edit', description: 'Edit company settings' },

  { module: 'branches', action: 'view', description: 'View branches' },
  { module: 'branches', action: 'create', description: 'Create branches' },
  { module: 'branches', action: 'edit', description: 'Edit branches' },
  { module: 'branches', action: 'delete', description: 'Delete branches' },

  { module: 'departments', action: 'view', description: 'View departments' },
  { module: 'departments', action: 'create', description: 'Create departments' },
  { module: 'departments', action: 'edit', description: 'Edit departments' },
  { module: 'departments', action: 'delete', description: 'Delete departments' },

  { module: 'financial_periods', action: 'view', description: 'View financial periods' },
  { module: 'financial_periods', action: 'edit', description: 'Manage financial periods' },
  { module: 'financial_periods', action: 'approve', description: 'Lock and close financial periods' },

  { module: 'users', action: 'view', description: 'View users' },
  { module: 'users', action: 'create', description: 'Create users' },
  { module: 'users', action: 'edit', description: 'Edit users' },
  { module: 'users', action: 'delete', description: 'Deactivate users' },

  { module: 'roles', action: 'view', description: 'View roles' },
  { module: 'roles', action: 'create', description: 'Create roles' },
  { module: 'roles', action: 'edit', description: 'Edit roles and permissions' },
  { module: 'roles', action: 'delete', description: 'Delete roles' },

  { module: 'audit', action: 'view', description: 'View audit logs' },
  { module: 'audit', action: 'export', description: 'Export audit logs' },

  { module: 'notifications', action: 'view', description: 'View notifications' },
  { module: 'notifications', action: 'edit', description: 'Manage notification templates' },
  
  { module: 'documents', action: 'view', description: 'View documents' },
  { module: 'documents', action: 'create', description: 'Upload documents' },
  { module: 'documents', action: 'edit', description: 'Edit document metadata' },
  { module: 'documents', action: 'delete', description: 'Delete documents' },
  
  { module: 'reports', action: 'view', description: 'View reports' },
  { module: 'reports', action: 'create', description: 'Create reports' },
  { module: 'reports', action: 'edit', description: 'Edit reports' },
  { module: 'reports', action: 'export', description: 'Export reports' },
];

const ACTION_TO_FLAG: Record<string, keyof PermissionFlags> = {
  view: 'canView',
  create: 'canCreate',
  edit: 'canEdit',
  delete: 'canDelete',
  approve: 'canApprove',
  export: 'canExport',
};

interface PermissionFlags {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

function fullPermissionFlags(): PermissionFlags {
  return {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canApprove: true,
    canExport: true,
  };
}

function employeePermissionFlags(
  module: string,
  action: string,
): PermissionFlags | null {
  const readOnlyModules = ['company', 'notifications', 'documents', 'reports'];
  const flag = ACTION_TO_FLAG[action];
  if (!flag) return null;

  if (action === 'view' && readOnlyModules.includes(module)) {
    return {
      canView: true,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
    };
  }

  return null;
}

async function createPostgresSequence(sequenceName: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `CREATE SEQUENCE IF NOT EXISTS "${sequenceName}" START WITH 1 INCREMENT BY 1`,
  );
}

async function main(): Promise<void> {
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
  const adminPassword =
    process.env.SEED_ADMIN_PASSWORD ?? 'Admin@12345';

  console.log('Seeding Core Foundation data...');

  // ── Company ──────────────────────────────────────────────────────────────
  const company = await prisma.company.upsert({
    where: { id: SYSTEM_USER_ID },
    update: {},
    create: {
      id: SYSTEM_USER_ID,
      legalName: 'Construction ERP Demo Company',
      registrationNumber: 'REG-001',
      vatNumber: 'VAT-001',
      baseCurrency: 'USD',
      defaultLanguage: 'en',
      defaultTimezone: 'Asia/Dubai',
      defaultDateFormat: 'DD/MM/YYYY',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });

  // ── Permissions (global) ─────────────────────────────────────────────────
  const permissions = await Promise.all(
    PERMISSION_DEFINITIONS.map((perm) =>
      prisma.permission.upsert({
        where: {
          module_action: { module: perm.module, action: perm.action },
        },
        update: { description: perm.description },
        create: perm,
      }),
    ),
  );

  // ── Roles ────────────────────────────────────────────────────────────────
  const roleMap = new Map<string, string>();

  for (const roleName of CORE_ROLES) {
    const role = await prisma.role.upsert({
      where: {
        companyId_name: { companyId: company.id, name: roleName },
      },
      update: {},
      create: {
        companyId: company.id,
        name: roleName,
        description: `${roleName} system role`,
        isSystemRole: true,
        isActive: true,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
    roleMap.set(roleName, role.id);
  }

  const adminRoleId = roleMap.get('System Administrator');
  const employeeRoleId = roleMap.get('Employee');

  if (!adminRoleId || !employeeRoleId) {
    throw new Error('Failed to seed required system roles');
  }

  // ── Role permissions ─────────────────────────────────────────────────────
  for (const permission of permissions) {
    const adminFlags = fullPermissionFlags();
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRoleId,
          permissionId: permission.id,
        },
      },
      update: adminFlags,
      create: {
        roleId: adminRoleId,
        permissionId: permission.id,
        ...adminFlags,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });

    const employeeFlags = employeePermissionFlags(
      permission.module,
      permission.action,
    );
    if (employeeFlags) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: employeeRoleId,
            permissionId: permission.id,
          },
        },
        update: employeeFlags,
        create: {
          roleId: employeeRoleId,
          permissionId: permission.id,
          ...employeeFlags,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      });
    }
  }

  // ── Organisation bootstrap ─────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: '00000000-0000-0000-0000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      companyId: company.id,
      name: 'Head Office',
      address: '1 Main Street',
      city: 'Dubai',
      country: 'UAE',
      phone: '+971-4-000-0000',
      isHeadOffice: true,
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });

  const division = await prisma.division.upsert({
    where: {
      companyId_code: { companyId: company.id, code: 'OPS' },
    },
    update: {},
    create: {
      companyId: company.id,
      name: 'Operations',
      code: 'OPS',
      description: 'Main operations division',
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });

  const department = await prisma.department.upsert({
    where: {
      companyId_code: { companyId: company.id, code: 'IT' },
    },
    update: {},
    create: {
      companyId: company.id,
      divisionId: division.id,
      branchId: branch.id,
      name: 'Information Technology',
      code: 'IT',
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });

  const position = await prisma.position.upsert({
    where: { id: '00000000-0000-0000-0000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000020',
      companyId: company.id,
      departmentId: department.id,
      title: 'System Administrator',
      grade: 'L5',
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });

  await prisma.costCentre.upsert({
    where: {
      companyId_code: { companyId: company.id, code: 'CC-IT' },
    },
    update: {},
    create: {
      companyId: company.id,
      departmentId: department.id,
      name: 'IT Overhead',
      code: 'CC-IT',
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });

  // ── Admin user ───────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const adminUser = await prisma.user.upsert({
    where: {
      companyId_email: { companyId: company.id, email: adminEmail },
    },
    update: {
      passwordHash,
      updatedBy: SYSTEM_USER_ID,
    },
    create: {
      companyId: company.id,
      branchId: branch.id,
      departmentId: department.id,
      positionId: position.id,
      firstName: 'System',
      lastName: 'Administrator',
      email: adminEmail,
      phone: '+971-50-000-0000',
      passwordHash,
      isActive: true,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });

  // Update company audit fields to reference admin
  await prisma.company.update({
    where: { id: company.id },
    data: { createdBy: adminUser.id, updatedBy: adminUser.id },
  });

  // ── Assign admin role ────────────────────────────────────────────────────
  await prisma.userRole.upsert({
    where: {
      userId_roleId: { userId: adminUser.id, roleId: adminRoleId },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRoleId,
      assignedBy: adminUser.id,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  // ── Company settings ─────────────────────────────────────────────────────
  const settings: Array<{
    module: string;
    key: string;
    value: string;
    dataType: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
    isPublic: boolean;
  }> = [
    { module: 'core', key: 'app_name', value: 'Construction ERP', dataType: 'STRING', isPublic: true },
    { module: 'core', key: 'fiscal_year_start_month', value: '1', dataType: 'NUMBER', isPublic: false },
    { module: 'auth', key: 'mfa_required', value: 'false', dataType: 'BOOLEAN', isPublic: false },
    { module: 'documents', key: 'max_upload_mb', value: '50', dataType: 'NUMBER', isPublic: false },
    { module: 'notifications', key: 'email_enabled', value: 'true', dataType: 'BOOLEAN', isPublic: false },
  ];

  for (const setting of settings) {
    await prisma.companySetting.upsert({
      where: {
        companyId_module_key: {
          companyId: company.id,
          module: setting.module,
          key: setting.key,
        },
      },
      update: { value: setting.value },
      create: {
        companyId: company.id,
        ...setting,
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
      },
    });
  }

  // ── Financial year & periods ─────────────────────────────────────────────
  const yearStart = new Date('2026-01-01');
  const yearEnd = new Date('2026-12-31');

  const financialYear = await prisma.financialYear.upsert({
    where: { id: '00000000-0000-0000-0000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000030',
      companyId: company.id,
      name: 'FY 2026',
      startDate: yearStart,
      endDate: yearEnd,
      status: 'OPEN',
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  for (let i = 0; i < 12; i++) {
    const periodStart = new Date(2026, i, 1);
    const periodEnd = new Date(2026, i + 1, 0);

    await prisma.financialPeriod.upsert({
      where: {
        financialYearId_periodNumber: {
          financialYearId: financialYear.id,
          periodNumber: i + 1,
        },
      },
      update: {},
      create: {
        companyId: company.id,
        financialYearId: financialYear.id,
        name: `${monthNames[i]} 2026`,
        periodNumber: i + 1,
        startDate: periodStart,
        endDate: periodEnd,
        status: 'OPEN',
        isAdjustmentPeriod: false,
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
      },
    });
  }

  // ── Number series + PostgreSQL sequences ─────────────────────────────────
  const documentTypes = ['PURCHASE_ORDER', 'INVOICE', 'RFI', 'SUBMITTAL'];

  for (const docType of documentTypes) {
    const sequenceName = `seq_${company.id.replace(/-/g, '_')}_${docType.toLowerCase()}`;
    await createPostgresSequence(sequenceName);

    await prisma.numberSeries.upsert({
      where: {
        companyId_documentType: { companyId: company.id, documentType: docType },
      },
      update: {},
      create: {
        companyId: company.id,
        documentType: docType,
        prefix: `${docType.substring(0, 3)}-`,
        suffix: '',
        sequenceName,
        padding: 5,
        resetFrequency: 'YEARLY',
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
      },
    });
  }

  // ── System document folder ───────────────────────────────────────────────
  await prisma.documentFolder.upsert({
    where: { id: '00000000-0000-0000-0000-000000000040' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000040',
      companyId: company.id,
      name: 'System Documents',
      path: '/system',
      contextType: 'SYSTEM',
      contextId: null,
      isSystem: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  // ── Notification template ────────────────────────────────────────────────
  await prisma.notificationTemplate.upsert({
    where: {
      companyId_eventType_channel: {
        companyId: company.id,
        eventType: 'user.welcome',
        channel: 'EMAIL',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      eventType: 'user.welcome',
      channel: 'EMAIL',
      subjectTemplate: 'Welcome to {{companyName}}',
      bodyTemplate: 'Hello {{firstName}}, your account has been created.',
      isActive: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  console.log('Seed completed successfully.');
  console.log(`  Company ID : ${company.id}`);
  console.log(`  Admin email: ${adminEmail}`);
  console.log(`  Admin password: (from SEED_ADMIN_PASSWORD env or default)`);
  console.log(`  Roles seeded: ${CORE_ROLES.length}`);
  console.log(`  Permissions seeded: ${permissions.length}`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
