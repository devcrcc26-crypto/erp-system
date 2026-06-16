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

  { module: 'projects', action: 'view', description: 'View projects' },
  { module: 'projects', action: 'create', description: 'Create projects' },
  { module: 'projects', action: 'edit', description: 'Edit projects' },
  { module: 'projects', action: 'delete', description: 'Delete projects' },

  { module: 'schedule', action: 'view', description: 'View project schedule' },
  { module: 'schedule', action: 'create', description: 'Create schedule items' },
  { module: 'schedule', action: 'edit', description: 'Edit schedule items' },
  { module: 'schedule', action: 'delete', description: 'Delete schedule items' },

  { module: 'rfis', action: 'view', description: 'View RFIs' },
  { module: 'rfis', action: 'create', description: 'Create RFIs' },
  { module: 'rfis', action: 'edit', description: 'Edit RFIs' },
  { module: 'rfis', action: 'delete', description: 'Delete RFIs' },

  { module: 'submittals', action: 'view', description: 'View submittals' },
  { module: 'submittals', action: 'create', description: 'Create submittals' },
  { module: 'submittals', action: 'edit', description: 'Edit submittals' },
  { module: 'submittals', action: 'delete', description: 'Delete submittals' },

  { module: 'drawings', action: 'view', description: 'View drawings' },
  { module: 'drawings', action: 'create', description: 'Create drawings' },
  { module: 'drawings', action: 'edit', description: 'Edit drawings' },
  { module: 'drawings', action: 'delete', description: 'Delete drawings' },

  { module: 'daily_logs', action: 'view', description: 'View daily logs' },
  { module: 'daily_logs', action: 'create', description: 'Create daily logs' },
  { module: 'daily_logs', action: 'edit', description: 'Edit daily logs' },
  { module: 'daily_logs', action: 'delete', description: 'Delete daily logs' },

  { module: 'meetings', action: 'view', description: 'View meetings' },
  { module: 'meetings', action: 'create', description: 'Create meetings' },
  { module: 'meetings', action: 'edit', description: 'Edit meetings' },
  { module: 'meetings', action: 'delete', description: 'Delete meetings' },

  { module: 'correspondence', action: 'view', description: 'View correspondence' },
  { module: 'correspondence', action: 'create', description: 'Create correspondence' },
  { module: 'correspondence', action: 'edit', description: 'Edit correspondence' },
  { module: 'correspondence', action: 'delete', description: 'Delete correspondence' },

  { module: 'risks', action: 'view', description: 'View risks' },
  { module: 'risks', action: 'create', description: 'Create risks' },
  { module: 'risks', action: 'edit', description: 'Edit risks' },
  { module: 'risks', action: 'delete', description: 'Delete risks' },

  { module: 'issues', action: 'view', description: 'View issues' },
  { module: 'issues', action: 'create', description: 'Create issues' },
  { module: 'issues', action: 'edit', description: 'Edit issues' },
  { module: 'issues', action: 'delete', description: 'Delete issues' },

  { module: 'punch_items', action: 'view', description: 'View punch items' },
  { module: 'punch_items', action: 'create', description: 'Create punch items' },
  { module: 'punch_items', action: 'edit', description: 'Edit punch items' },
  { module: 'punch_items', action: 'delete', description: 'Delete punch items' },

  { module: 'closeout', action: 'view', description: 'View project closeout' },
  { module: 'closeout', action: 'create', description: 'Initialize closeout' },
  { module: 'closeout', action: 'edit', description: 'Edit closeout' },
  { module: 'closeout', action: 'delete', description: 'Delete closeout' },
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

function viewCreateEditFlags(): PermissionFlags {
  return {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canApprove: false,
    canExport: false,
  };
}

function viewOnlyFlags(): PermissionFlags {
  return {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canExport: false,
  };
}

const PM_MODULES = [
  'projects',
  'schedule',
  'rfis',
  'submittals',
  'drawings',
  'daily_logs',
  'meetings',
  'correspondence',
  'risks',
  'issues',
  'punch_items',
  'closeout',
] as const;

function pmPermissionFlags(
  roleName: string,
  module: string,
  action: string,
): PermissionFlags | null {
  if (!PM_MODULES.includes(module as (typeof PM_MODULES)[number])) {
    return null;
  }

  if (roleName === 'Project Manager' || roleName === 'Managing Director') {
    return fullPermissionFlags();
  }

  const siteModules = [
    'projects',
    'schedule',
    'rfis',
    'daily_logs',
    'issues',
    'punch_items',
    'risks',
  ];
  const docModules = ['projects', 'submittals', 'drawings', 'correspondence'];
  const safetyModules = ['projects', 'risks', 'issues', 'daily_logs'];

  let allowedModules: string[] = [];
  if (roleName === 'Site Engineer') {
    allowedModules = siteModules;
  } else if (roleName === 'Document Controller') {
    allowedModules = docModules;
  } else if (roleName === 'Safety Officer') {
    allowedModules = safetyModules;
  } else {
    return null;
  }

  if (allowedModules.includes(module)) {
    if (action === 'delete') {
      return null;
    }
    const flag = ACTION_TO_FLAG[action];
    if (!flag) {
      return null;
    }
    return {
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
      [flag]: true,
    };
  }

  if (action === 'view') {
    return viewOnlyFlags();
  }

  return null;
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

  const pmRoleNames = [
    'Managing Director',
    'Project Manager',
    'Site Engineer',
    'Document Controller',
    'Safety Officer',
  ] as const;

  for (const roleName of pmRoleNames) {
    const roleId = roleMap.get(roleName);
    if (!roleId) {
      continue;
    }
    for (const permission of permissions) {
      const flags = pmPermissionFlags(roleName, permission.module, permission.action);
      if (!flags) {
        continue;
      }
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId,
            permissionId: permission.id,
          },
        },
        update: flags,
        create: {
          roleId,
          permissionId: permission.id,
          ...flags,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      });
    }
  }

  // Employee gets read-only project portfolio access
  const employeePmViewFlags = viewOnlyFlags();
  for (const permission of permissions) {
    if (!PM_MODULES.includes(permission.module as (typeof PM_MODULES)[number])) {
      continue;
    }
    if (permission.action !== 'view') {
      continue;
    }
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: employeeRoleId,
          permissionId: permission.id,
        },
      },
      update: employeePmViewFlags,
      create: {
        roleId: employeeRoleId,
        permissionId: permission.id,
        ...employeePmViewFlags,
        createdBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
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
      emailVerifiedAt: new Date(),
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
      emailVerifiedAt: new Date(),
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
  const documentTypes = [
    'PURCHASE_ORDER',
    'INVOICE',
    'RFI',
    'SUBMITTAL',
    'ISSUE',
    'PUNCH_ITEM',
    'MEETING',
    'CORRESPONDENCE',
  ];

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

  // ── Sample report definition ─────────────────────────────────────────────
  await prisma.reportDefinition.upsert({
    where: { id: '00000000-0000-0000-0000-000000000050' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000050',
      companyId: company.id,
      createdBy: adminUser.id,
      name: 'Active Users',
      dataSource: 'users',
      fields: [
        { field: 'email' },
        { field: 'firstName' },
        { field: 'lastName' },
        { field: 'isActive' },
      ],
      filters: [],
      grouping: [],
      sorting: [{ field: 'createdAt', direction: 'desc' }],
      isSystem: true,
      isShared: true,
      updatedBy: adminUser.id,
    },
  });

  // ── Dashboard widget for System Administrator ────────────────────────────
  if (adminRoleId) {
    await prisma.dashboardWidget.upsert({
      where: { id: '00000000-0000-0000-0000-000000000060' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000060',
        companyId: company.id,
        roleId: adminRoleId,
        widgetType: 'kpi_card',
        title: 'Active Users',
        config: { dataSource: 'users', metric: 'count', filter: { isActive: true } },
        positionX: 0,
        positionY: 0,
        width: 4,
        height: 2,
        createdBy: adminUser.id,
        updatedBy: adminUser.id,
      },
    });
  }

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

  // ── Sample project (demo data) ───────────────────────────────────────────
  const demoProject = await prisma.project.upsert({
    where: {
      companyId_projectCode: {
        companyId: company.id,
        projectCode: 'DEMO-001',
      },
    },
    update: {},
    create: {
      companyId: company.id,
      branchId: branch.id,
      projectCode: 'DEMO-001',
      name: 'Marina Tower Construction',
      location: 'Dubai Marina',
      projectType: 'COMMERCIAL',
      contractType: 'LUMP_SUM',
      status: 'ACTIVE',
      startDate: new Date('2026-01-15'),
      plannedFinishDate: new Date('2027-06-30'),
      budget: 12500000,
      currency: 'USD',
      projectManagerId: adminUser.id,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  await prisma.projectTeam.upsert({
    where: { id: '00000000-0000-0000-0000-000000000070' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000070',
      projectId: demoProject.id,
      userId: adminUser.id,
      roleOnProject: 'Project Manager',
      assignedFrom: new Date('2026-01-15'),
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  const milestone = await prisma.milestone.upsert({
    where: { id: '00000000-0000-0000-0000-000000000071' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000071',
      projectId: demoProject.id,
      name: 'Structure Complete',
      plannedDate: new Date('2026-09-30'),
      status: 'PLANNED',
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000072' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000072',
      projectId: demoProject.id,
      milestoneId: milestone.id,
      assignedTo: adminUser.id,
      taskIdCode: 'T-100',
      name: 'Foundation works',
      startDate: new Date('2026-01-15'),
      finishDate: new Date('2026-04-30'),
      durationDays: 105,
      progressPct: 75,
      status: 'IN_PROGRESS',
      isCritical: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  await prisma.task.upsert({
    where: { id: '00000000-0000-0000-0000-000000000073' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000073',
      projectId: demoProject.id,
      milestoneId: milestone.id,
      assignedTo: adminUser.id,
      taskIdCode: 'T-200',
      name: 'Superstructure',
      startDate: new Date('2026-05-01'),
      finishDate: new Date('2026-09-30'),
      durationDays: 152,
      progressPct: 20,
      status: 'NOT_STARTED',
      isCritical: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  await prisma.rfi.upsert({
    where: { id: '00000000-0000-0000-0000-000000000074' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000074',
      projectId: demoProject.id,
      raisedBy: adminUser.id,
      assignedTo: adminUser.id,
      rfiNumber: 'RFI-00001',
      title: 'Clarification on pile cap reinforcement',
      description: 'Please confirm bar spacing at grid B4.',
      discipline: 'Structural',
      priority: 'HIGH',
      status: 'UNDER_REVIEW',
      dateRaised: new Date('2026-03-01'),
      dueDate: new Date('2026-03-15'),
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  await prisma.issue.upsert({
    where: { id: '00000000-0000-0000-0000-000000000075' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000075',
      projectId: demoProject.id,
      raisedBy: adminUser.id,
      issueNumber: 'ISS-00001',
      issueType: 'Quality',
      description: 'Honeycombing observed at column C2',
      location: 'Level 3',
      severity: 'MEDIUM',
      status: 'OPEN',
      dueDate: new Date('2026-03-20'),
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  await prisma.punchItem.upsert({
    where: { id: '00000000-0000-0000-0000-000000000076' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000076',
      projectId: demoProject.id,
      raisedBy: adminUser.id,
      punchNumber: 'PUN-00001',
      description: 'Touch-up paint required in lobby',
      roomOrArea: 'Ground floor lobby',
      tradeResponsible: 'Painting',
      severity: 'MINOR',
      status: 'RAISED',
      dueDate: new Date('2026-04-01'),
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  await prisma.documentFolder.upsert({
    where: { id: '00000000-0000-0000-0000-000000000077' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000077',
      companyId: company.id,
      name: 'Marina Tower Documents',
      path: `/projects/${demoProject.id}`,
      contextType: 'PROJECT',
      contextId: demoProject.id,
      isSystem: false,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  console.log(`  Demo project: ${demoProject.projectCode} (${demoProject.id})`);
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
