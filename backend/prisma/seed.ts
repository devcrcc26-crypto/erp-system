import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  resolveSeedAdminPassword,
  seedAdminPasswordSourceLabel,
} from '../src/shared/script-guards/seed-admin-password';
import { seedPmDemoData } from './seed-pm-demo';
import { seedAllProjectTypes } from './seed-all-project-types';
import { appendRichDemoProjects } from './seed-demo-projects';
import { seedComment8Walkthrough } from './seed-comment8-walkthrough';
import { seedApprovalCategories } from './seeds/approval-categories.seed';
import { seedOrgStructure } from './seeds/org-structure.seed';
import { seedLeavePolicies } from './seed-leave-policies';
import { seedWorkSchedules } from './seed/work-schedules.seed';
import { seedEvaluationTemplate } from './seeds/evaluation-template.seed';

const prisma = new PrismaClient();

/** Bootstrap actor for records created before the admin user exists. */
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const CORE_ROLES = [
  'System Administrator',
  'Project Administrator',
  'Managing Director',
  'Project Manager',
  'Site Engineer',
  'Document Controller',
  'Finance Manager',
  'Accountant',
  'Procurement Officer',
  'Storekeeper',
  'HR Officer', // keep - legacy, maps to HR Manager going forward
  'HR Manager', // NEW - Ms. Dong, full HR access + final approver
  'Local HR Manager', // NEW - Mekides, full HR access except approvals
  'HR Specialist', // NEW - Ms. Tang, view all HR + manage flight tickets
  'HR Assistant', // NEW - Asli, limited HR view + data entry
  'Department Head', // NEW - view own department employees
  'Safety Officer',
  'Employee',
  'General Manager',
  'Project Director',
  'Planning Engineer',
  'Chief Engineer',
  'Designer',
  'Dispatcher',
  'Reviewer',
  'Discipline Owner',
  'Discipline Lead',
  'Department Chief',
  'Institute Chief',
  'Deputy Chief',
  'Site Coordinator',
  'Client Consultant',
] as const;

const DESIGN_WORKFLOW_ROLES = [
  'General Manager',
  'Project Director',
  'Planning Engineer',
  'Chief Engineer',
  'Designer',
  'Dispatcher',
] as const;

const EPC_WORKFLOW_ROLES = [
  'Discipline Owner',
  'Reviewer',
  'Discipline Lead',
  'Department Chief',
  'Deputy Chief',
  'Institute Chief',
  'Site Coordinator',
  'Client Consultant',
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

  { module: 'approvals', action: 'view', description: 'View approval categories and requests' },
  { module: 'approvals', action: 'create', description: 'Submit approval requests' },
  { module: 'approvals', action: 'approve', description: 'Approve, reject, return, or condition approval tiers' },
  { module: 'approvals', action: 'edit', description: 'Edit approval categories' },

  { module: 'hr', action: 'view', description: 'Access Human Resources module and HR workflows' },

  { module: 'leave', action: 'view', description: 'View leave requests and balances' },
  { module: 'leave', action: 'create', description: 'Submit and cancel leave requests' },
  { module: 'leave', action: 'edit', description: 'Edit leave requests' },
  { module: 'leave', action: 'delete', description: 'Delete leave requests' },

  { module: 'overtime', action: 'view', description: 'View overtime requests' },
  { module: 'overtime', action: 'create', description: 'Submit and cancel overtime requests' },

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

  {
    module: 'site-assignment',
    action: 'view',
    description: 'View site assignment requests',
  },
  {
    module: 'site-assignment',
    action: 'create',
    description: 'Submit and cancel site assignment requests',
  },
  {
    module: 'site-assignment',
    action: 'manage',
    description: 'HR manage site assignments (cancel approved, shorten, OT impact)',
  },

  { module: 'employee-contract', action: 'view', description: 'View employee contracts' },
  { module: 'employee-contract', action: 'create', description: 'Create employee contracts' },
  {
    module: 'employee-contract',
    action: 'edit',
    description: 'Update, terminate and delete employee contracts',
  },

  { module: 'flight', action: 'view', description: 'View flight applications' },
  { module: 'flight', action: 'create', description: 'Submit and cancel flight applications' },
  { module: 'flight', action: 'manage', description: 'Attach flight tickets after approval' },
  { module: 'business-trip', action: 'view', description: 'View business trip applications' },
  { module: 'business-trip', action: 'create', description: 'Submit and cancel business trip applications' },
  { module: 'business-trip', action: 'manage', description: 'Attach business trip tickets after approval' },
  
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
  { module: 'projects', action: 'export', description: 'Export projects' },

  { module: 'schedule', action: 'view', description: 'View project schedule' },
  { module: 'schedule', action: 'create', description: 'Create schedule items' },
  { module: 'schedule', action: 'edit', description: 'Edit schedule items' },
  { module: 'schedule', action: 'delete', description: 'Delete schedule items' },
  { module: 'schedule', action: 'approve', description: 'Approve design packages and EDVs' },
  { module: 'schedule', action: 'export', description: 'Export schedule tasks' },

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

  { module: 'change_requests', action: 'view', description: 'View change requests' },
  { module: 'change_requests', action: 'create', description: 'Create change requests' },
  { module: 'change_requests', action: 'edit', description: 'Edit change requests' },
  { module: 'change_requests', action: 'delete', description: 'Delete change requests' },

  { module: 'deliverables', action: 'view', description: 'View deliverables' },
  { module: 'deliverables', action: 'create', description: 'Create deliverables' },
  { module: 'deliverables', action: 'edit', description: 'Edit deliverables' },
  { module: 'deliverables', action: 'delete', description: 'Delete deliverables' },

  { module: 'engineering_documents', action: 'view', description: 'View engineering documents' },
  { module: 'engineering_documents', action: 'create', description: 'Create engineering documents' },
  { module: 'engineering_documents', action: 'edit', description: 'Edit engineering documents' },
  { module: 'engineering_documents', action: 'delete', description: 'Delete engineering documents' },
  { module: 'engineering_documents', action: 'approve', description: 'Lock engineering documents' },

  { module: 'design_packages', action: 'view', description: 'View design packages' },
  { module: 'design_packages', action: 'create', description: 'Create design packages' },
  { module: 'design_packages', action: 'edit', description: 'Edit design packages' },
  { module: 'design_packages', action: 'delete', description: 'Delete design packages' },

  { module: 'review_sessions', action: 'view', description: 'View review sessions' },
  { module: 'review_sessions', action: 'create', description: 'Create review sessions' },
  { module: 'review_sessions', action: 'approve', description: 'Approve review sessions' },

  { module: 'review_comments', action: 'view', description: 'View review comments' },
  { module: 'review_comments', action: 'create', description: 'Create review comments' },
  { module: 'review_comments', action: 'edit', description: 'Edit review comments' },
  { module: 'review_comments', action: 'delete', description: 'Delete review comments' },

  // Attendance module
  { module: 'attendance', action: 'view', description: 'View attendance records' },
  { module: 'attendance', action: 'create', description: 'Import attendance data' },
  { module: 'attendance', action: 'edit', description: 'Correct attendance records' },
  { module: 'attendance', action: 'approve', description: 'Approve monthly attendance' },
  { module: 'attendance', action: 'export', description: 'Export attendance data' },

  // Field movement log
  { module: 'field-movement', action: 'view', description: 'View field movement logs' },
  { module: 'field-movement', action: 'create', description: 'Submit field movement logs' },
  { module: 'field-movement', action: 'approve', description: 'Approve field movement logs' },

  // Exit permit
  { module: 'exit-permit', action: 'view', description: 'View exit permits' },
  { module: 'exit-permit', action: 'create', description: 'Submit exit permits' },
  { module: 'exit-permit', action: 'approve', description: 'Approve exit permits' },

  // Per diem
  { module: 'per-diem', action: 'view', description: 'View per diem requests' },
  { module: 'per-diem', action: 'create', description: 'Submit per diem requests' },
  { module: 'per-diem', action: 'approve', description: 'Approve per diem requests' },
  { module: 'per-diem', action: 'export', description: 'Export per diem data' },

  // Payroll (future module - seed now)
  { module: 'payroll', action: 'view', description: 'View payroll records and payslips' },
  { module: 'payroll', action: 'create', description: 'Run payroll calculations' },
  { module: 'payroll', action: 'edit', description: 'Edit payroll entries' },
  { module: 'payroll', action: 'approve', description: 'Approve and lock payroll' },
  { module: 'payroll', action: 'export', description: 'Export payroll and bank files' },

  // Announcements - company news and system "What's new" posts
  { module: 'announcements', action: 'view', description: 'View received announcements' },
  { module: 'announcements', action: 'create', description: 'Create announcement drafts' },
  { module: 'announcements', action: 'edit', description: 'Edit announcements' },
  { module: 'announcements', action: 'approve', description: 'Publish, schedule and archive announcements' },
  { module: 'announcements', action: 'export', description: 'Export announcement read statistics' },
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

function viewExportFlags(): PermissionFlags {
  return {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canExport: true,
  };
}

function viewCreateFlags(): PermissionFlags {
  return {
    canView: true,
    canCreate: true,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canExport: false,
  };
}

function viewApproveExportFlags(): PermissionFlags {
  return {
    canView: true,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: true,
    canExport: true,
  };
}

function hrManagerFlags(): PermissionFlags {
  return {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canApprove: true,
    canExport: true,
  };
}

function localHrManagerFlags(): PermissionFlags {
  // Full access except approve
  return {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    canApprove: false,
    canExport: true,
  };
}

/** Announcements: create, edit, publish (approve) and export - no delete. */
function announcementManagerFlags(): PermissionFlags {
  return {
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: false,
    canApprove: true,
    canExport: true,
  };
}

/** Announcements: drafts only - the service blocks editing after publish. */
function announcementDraftFlags(): PermissionFlags {
  return viewCreateEditFlags();
}

/** Grants exactly one permission flag; never elevates approve/export/delete implicitly. */
function singleActionFlags(action: string): PermissionFlags | null {
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

function isElevatedPermissionAction(action: string): boolean {
  return action === 'approve' || action === 'export' || action === 'delete';
}

function denyAllFlags(): PermissionFlags {
  return {
    canView: false,
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
  'change_requests',
  'deliverables',
  'engineering_documents',
  'design_packages',
  'review_sessions',
  'review_comments',
] as const;

const EXTENDED_PM_MODULES = [
  'change_requests',
  'deliverables',
  'engineering_documents',
  'design_packages',
  'review_sessions',
  'review_comments',
] as const;

const REVIEW_TIER_ROLES = new Set([
  'Discipline Owner',
  'Reviewer',
  'Discipline Lead',
  'Department Chief',
  'Institute Chief',
  'Deputy Chief',
]);

const CHIEF_ROLES = new Set([
  'Department Chief',
  'Institute Chief',
  'Deputy Chief',
  'Discipline Lead',
]);

function documentsPermissionFlags(
  roleName: string,
  action: string,
): PermissionFlags | null {
  const flag = ACTION_TO_FLAG[action];
  if (!flag) {
    return null;
  }

  const fullAccessRoles = new Set([
    'Project Manager',
    'Managing Director',
    'Project Director',
  ]);

  if (fullAccessRoles.has(roleName)) {
    return fullPermissionFlags();
  }

  if (roleName === 'Document Controller') {
    if (action === 'view') {
      return viewOnlyFlags();
    }
    if (action === 'create') {
      return singleActionFlags(action);
    }
    return null;
  }

  const engineeringUploadRoles = new Set([
    'Site Engineer',
    'Planning Engineer',
    'Chief Engineer',
    'Designer',
    'Dispatcher',
    'Discipline Owner',
    'Discipline Lead',
    'Department Chief',
    'Deputy Chief',
    'Reviewer',
    'Site Coordinator',
    'Client Consultant',
    'General Manager',
    'Safety Officer',
  ]);

  if (engineeringUploadRoles.has(roleName)) {
    if (isElevatedPermissionAction(action)) {
      return denyAllFlags();
    }
    if (action === 'view') {
      return viewOnlyFlags();
    }
    return singleActionFlags(action);
  }

  return null;
}

function extendedPmModulePermissionFlags(
  roleName: string,
  module: string,
  action: string,
): PermissionFlags | null {
  if (!EXTENDED_PM_MODULES.includes(module as (typeof EXTENDED_PM_MODULES)[number])) {
    return null;
  }

  const flag = ACTION_TO_FLAG[action];
  if (!flag) {
    return null;
  }

  if (module === 'change_requests') {
    if (roleName === 'Project Manager' || roleName === 'Managing Director' || roleName === 'Project Administrator') {
      return fullPermissionFlags();
    }
    if (roleName === 'Site Engineer') {
      if (isElevatedPermissionAction(action)) {
        return null;
      }
      return singleActionFlags(action);
    }
    return null;
  }

  if (module === 'deliverables') {
    if (roleName === 'Project Manager' || roleName === 'Project Administrator') {
      return fullPermissionFlags();
    }
    if (roleName === 'Site Engineer' || roleName === 'Designer') {
      if (isElevatedPermissionAction(action)) {
        return null;
      }
      return singleActionFlags(action);
    }
    return null;
  }

  if (module === 'engineering_documents') {
    if (roleName === 'Project Administrator') {
      return fullPermissionFlags();
    }
    const epcViewRoles = new Set<string>([...EPC_WORKFLOW_ROLES, 'Institute Chief']);

    if (roleName === 'Designer') {
      if (action === 'view' || action === 'create' || action === 'edit') {
        return singleActionFlags(action);
      }
      return null;
    }
    if (roleName === 'Document Controller') {
      if (action === 'view') {
        return viewOnlyFlags();
      }
      if (action === 'create') {
        return singleActionFlags(action);
      }
      return null;
    }
    if (CHIEF_ROLES.has(roleName) && action === 'approve') {
      return singleActionFlags(action);
    }
    if (epcViewRoles.has(roleName) && action === 'view') {
      return viewOnlyFlags();
    }
    return null;
  }

  if (module === 'design_packages') {
    if (roleName === 'Project Manager' || roleName === 'Project Administrator') {
      return fullPermissionFlags();
    }
    if (roleName === 'Designer') {
      if (action === 'view' || action === 'create' || action === 'edit') {
        return singleActionFlags(action);
      }
      return null;
    }
    if (roleName === 'Document Controller' && action === 'view') {
      return viewOnlyFlags();
    }
    if (REVIEW_TIER_ROLES.has(roleName) && action === 'view') {
      return viewOnlyFlags();
    }
    return null;
  }

  if (module === 'review_sessions') {
    if (roleName === 'Project Manager' || roleName === 'Project Administrator') {
      if (action === 'view' || action === 'create') {
        return singleActionFlags(action);
      }
      return null;
    }
    if (REVIEW_TIER_ROLES.has(roleName) && action === 'approve') {
      return singleActionFlags(action);
    }
    return null;
  }

  if (module === 'review_comments') {
    if (roleName === 'Project Manager' && action === 'view') {
      return viewOnlyFlags();
    }
    if (roleName === 'Project Administrator' && action === 'view') {
      return viewOnlyFlags();
    }
    if (REVIEW_TIER_ROLES.has(roleName)) {
      if (action === 'view' || action === 'create' || action === 'edit') {
        return singleActionFlags(action);
      }
    }
    return null;
  }

  return null;
}

function projectAdministratorPermissionFlags(
  roleName: string,
  module: string,
  action: string,
): PermissionFlags | null {
  if (roleName !== 'Project Administrator') {
    return null;
  }

  // Project Administrators receive full system access at runtime via
  // isSystemAdministrator() in PermissionService, except HR modules.
  // Seed-time flags mirror that: grant everything except HR modules.
  if (
    module === 'hr' ||
    module === 'leave' ||
    module === 'overtime' ||
    module === 'employee-contract' ||
    module === 'payroll' ||
    module === 'announcements'
  ) {
    return null;
  }

  return {
    canView: true,
    canCreate: false,
    canEdit: true,
    canDelete: false,
    canApprove: false,
    canExport: true,
  }
}

function pmPermissionFlags(
  roleName: string,
  module: string,
  action: string,
): PermissionFlags | null {
  const projectAdminFlags = projectAdministratorPermissionFlags(
    roleName,
    module,
    action,
  );
  if (projectAdminFlags !== null) {
    return projectAdminFlags;
  }

  if (module === 'documents') {
    return documentsPermissionFlags(roleName, action);
  }

  if (EXTENDED_PM_MODULES.includes(module as (typeof EXTENDED_PM_MODULES)[number])) {
    return extendedPmModulePermissionFlags(roleName, module, action);
  }

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
    'submittals',
    'daily_logs',
    'issues',
    'punch_items',
    'risks',
  ];
  const docModules = ['projects', 'submittals', 'drawings', 'correspondence'];
  const safetyModules = [
    'projects',
    'risks',
    'issues',
    'daily_logs',
    'meetings',
    'punch_items',
  ];

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
    if (isElevatedPermissionAction(action)) {
      return denyAllFlags();
    }
    return singleActionFlags(action);
  }

  if (action === 'view') {
    return viewOnlyFlags();
  }

  return null;
}

function designWorkflowRolePermissionFlags(
  roleName: string,
  module: string,
  action: string,
): PermissionFlags | null {
  if (module === 'documents') {
    return documentsPermissionFlags(roleName, action);
  }

  if (EXTENDED_PM_MODULES.includes(module as (typeof EXTENDED_PM_MODULES)[number])) {
    return extendedPmModulePermissionFlags(roleName, module, action);
  }

  if (!PM_MODULES.includes(module as (typeof PM_MODULES)[number])) {
    return null;
  }

  const flag = ACTION_TO_FLAG[action];
  if (!flag) {
    return null;
  }

  if (roleName === 'Project Director') {
    return fullPermissionFlags();
  }

  if (roleName === 'General Manager') {
    const executiveModules = [
      'projects',
      'schedule',
      'rfis',
      'risks',
      'issues',
      'meetings',
      'correspondence',
    ];
    if (executiveModules.includes(module)) {
      if (isElevatedPermissionAction(action)) {
        return denyAllFlags();
      }
      return singleActionFlags(action);
    }
    if (action === 'view') {
      return viewOnlyFlags();
    }
    return null;
  }

  const planningModules = ['projects', 'schedule'];
  const engineeringModules = [
    'projects',
    'schedule',
    'drawings',
    'submittals',
    'rfis',
  ];
  const designModules = ['projects', 'schedule', 'drawings', 'submittals'];
  const dispatchModules = ['projects', 'schedule', 'issues'];

  let allowedModules: string[] = [];
  if (roleName === 'Planning Engineer') {
    allowedModules = planningModules;
  } else if (roleName === 'Chief Engineer') {
    allowedModules = engineeringModules;
  } else if (roleName === 'Designer') {
    allowedModules = designModules;
  } else if (roleName === 'Dispatcher') {
    allowedModules = dispatchModules;
  } else {
    return null;
  }

  if (allowedModules.includes(module)) {
    if (isElevatedPermissionAction(action)) {
      return denyAllFlags();
    }
    return singleActionFlags(action);
  }

  if (action === 'view') {
    return viewOnlyFlags();
  }

  return null;
}

function epcWorkflowPermissionFlags(
  roleName: string,
  module: string,
  action: string,
): PermissionFlags | null {
  if (module === 'documents') {
    return documentsPermissionFlags(roleName, action);
  }

  if (EXTENDED_PM_MODULES.includes(module as (typeof EXTENDED_PM_MODULES)[number])) {
    return extendedPmModulePermissionFlags(roleName, module, action);
  }

  if (!PM_MODULES.includes(module as (typeof PM_MODULES)[number])) {
    return null;
  }

  const flag = ACTION_TO_FLAG[action];
  if (!flag) {
    return null;
  }

  const engineeringModules = ['projects', 'schedule', 'drawings', 'submittals'];
  const reviewModules = ['projects', 'schedule', 'drawings'];
  const coordinationModules = ['projects', 'schedule', 'rfis', 'issues'];

  if (roleName === 'Client Consultant') {
    const consultantModules: Record<string, readonly string[]> = {
      projects: ['view'],
      rfis: ['view', 'create', 'edit'],
      issues: ['view', 'create'],
    };
    const allowedActions = consultantModules[module];
    if (!allowedActions?.includes(action)) {
      return null;
    }
    if (action === 'delete' || action === 'approve') {
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

  let allowedModules: string[] = [];
  let canApprove = false;

  if (roleName === 'Discipline Owner' || roleName === 'Reviewer') {
    allowedModules = reviewModules;
  } else if (roleName === 'Discipline Lead') {
    allowedModules = engineeringModules;
    canApprove = action === 'approve';
  } else if (
    roleName === 'Department Chief' ||
    roleName === 'Deputy Chief' ||
    roleName === 'Institute Chief'
  ) {
    allowedModules = engineeringModules;
    canApprove = action === 'approve' || action === 'edit';
  } else if (roleName === 'Site Coordinator') {
    allowedModules = [...coordinationModules, 'submittals', 'daily_logs'];
  } else {
    return null;
  }

  if (allowedModules.includes(module)) {
    if (action === 'delete') {
      return null;
    }
    if (
      action === 'approve' &&
      !canApprove &&
      roleName !== 'Reviewer' &&
      roleName !== 'Discipline Owner'
    ) {
      return null;
    }
    if (
      action === 'approve' &&
      (roleName === 'Reviewer' || roleName === 'Discipline Owner')
    ) {
      return {
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: true,
        canExport: false,
      };
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

/**
 * Grants portfolio / system reports access for executive and finance roles.
 */
function reportsPermissionFlags(
  roleName: string,
  module: string,
  action: string,
): PermissionFlags | null {
  if (module !== 'reports') {
    return null;
  }

  const fullReportsRoles = new Set([
    'Managing Director',
    'Project Manager',
    'General Manager',
    'Project Director',
  ]);
  const viewExportRoles = new Set(['Finance Manager', 'Accountant']);

  if (fullReportsRoles.has(roleName)) {
    if (action === 'approve' || action === 'delete') {
      return null;
    }
    return singleActionFlags(action);
  }

  if (viewExportRoles.has(roleName)) {
    if (action === 'view' || action === 'export') {
      return singleActionFlags(action);
    }
    return null;
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

  if (module === 'approvals' && (action === 'view' || action === 'create')) {
    return {
      canView: action === 'view',
      canCreate: action === 'create',
      canEdit: false,
      canDelete: false,
      canApprove: false,
      canExport: false,
    };
  }

  if (module === 'leave' && (action === 'view' || action === 'create')) {
    return {
      canView: true,
      canCreate: action === 'create',
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

async function nextSeedDepartmentCode(): Promise<string> {
  await createPostgresSequence('department_code_seq');
  const result = await prisma.$queryRaw<Array<{ nextval: bigint }>>`
    SELECT nextval('department_code_seq')
  `;
  const seq = Number(result[0]?.nextval ?? 1);
  return `DEPT-${String(seq).padStart(4, '0')}`;
}

async function ensureSeedDepartment(
  db: PrismaClient,
  params: {
    companyId: string;
    divisionId: string;
    branchId: string;
    name: string;
    nameZh?: string;
    createdBy: string;
  },
): Promise<{ id: string }> {
  const existing = await db.department.findFirst({
    where: {
      companyId: params.companyId,
      name: params.name,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (existing) {
    return existing;
  }

  return db.department.create({
    data: {
      companyId: params.companyId,
      divisionId: params.divisionId,
      branchId: params.branchId,
      name: params.name,
      nameZh: params.nameZh,
      code: await nextSeedDepartmentCode(),
      isActive: true,
      createdBy: params.createdBy,
      updatedBy: params.createdBy,
    },
    select: { id: true },
  });
}

/**
 * Upserts a role permission row keyed by (roleId, permissionId).
 */
async function upsertRolePermission(
  roleId: string,
  permissionId: string,
  flags: PermissionFlags,
): Promise<void> {
  await prisma.rolePermission.upsert({
    where: {
      roleId_permissionId: {
        roleId,
        permissionId,
      },
    },
    update: flags,
    create: {
      roleId,
      permissionId,
      ...flags,
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

/**
 * Soft-deletes HR module permissions on the given roles.
 * Ensures Project Manager and Project Administrator never retain HR access.
 */
async function revokeHrModulePermissionsForRoles(
  roleIds: string[],
): Promise<void> {
  if (roleIds.length === 0) {
    return;
  }

  const hrPermissions = await prisma.permission.findMany({
    where: {
      module: { in: ['hr', 'leave', 'overtime', 'employee-contract'] },
    },
    select: { id: true },
  });
  if (hrPermissions.length === 0) {
    return;
  }

  await prisma.rolePermission.updateMany({
    where: {
      roleId: { in: roleIds },
      permissionId: { in: hrPermissions.map((p) => p.id) },
      deletedAt: null,
    },
    data: {
      deletedAt: new Date(),
      deletedBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

/**
 * Removes legacy duplicate role_permission rows before idempotent re-seeding.
 */
async function deduplicateRolePermissions(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    DELETE FROM "role_permission" AS rp1
    USING "role_permission" AS rp2
    WHERE rp1.id > rp2.id
      AND rp1.role_id = rp2.role_id
      AND rp1.permission_id = rp2.permission_id
  `);
}

/** Retries until Supabase pooler is awake (free-tier cold starts can take 30–60s). */
async function waitForDatabase(maxAttempts = 6, delayMs = 10_000): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (attempt > 1) {
        console.log('Database connection established.');
      }
      return;
    } catch {
      if (attempt === maxAttempts) {
        throw new Error(
          `Database unreachable after ${maxAttempts} attempts. ` +
            'Check Supabase project is not paused and DATABASE_URL uses session pooler :5432 with ?sslmode=require.',
        );
      }
      console.log(
        `Database not ready (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main(): Promise<void> {
  const adminEmail =
    process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local';
  const adminPassword = resolveSeedAdminPassword();

  console.log('Waiting for database connection...');
  await waitForDatabase();

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
  const permissions = [];
  for (const perm of PERMISSION_DEFINITIONS) {
    permissions.push(
      await prisma.permission.upsert({
        where: {
          module_action: { module: perm.module, action: perm.action },
        },
        update: { description: perm.description },
        create: perm,
      }),
    );
  }

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
  await deduplicateRolePermissions();

  for (const permission of permissions) {
    const adminFlags = fullPermissionFlags();
    await upsertRolePermission(adminRoleId, permission.id, adminFlags);

    const employeeFlags = employeePermissionFlags(
      permission.module,
      permission.action,
    );
    if (employeeFlags) {
      await upsertRolePermission(employeeRoleId, permission.id, employeeFlags);
    }
  }

  // Human Resources module access (hr.view) - exact role set from product requirements.
  // System Administrator already receives full flags in the admin loop above.
  const hrViewPermission = permissions.find(
    (permission) => permission.module === 'hr' && permission.action === 'view',
  );
  if (hrViewPermission) {
    const hrViewRoleNames = [
      'General Manager',
      'Managing Director',
      'HR Officer',
    ] as const;
    const hrViewFlags = viewOnlyFlags();
    for (const roleName of hrViewRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, hrViewPermission.id, hrViewFlags);
    }
  }

  // ── New HR role permissions ──────────────────────────────────────────────

  const newHrRolePermissions: Array<{
    roleName: string;
    module: string;
    flags: PermissionFlags;
  }> = [
    // ── HR Manager (Ms. Dong) - full access to all HR modules ──
    { roleName: 'HR Manager', module: 'hr', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'departments', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'roles', flags: viewOnlyFlags() },
    { roleName: 'HR Manager', module: 'leave', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'overtime', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'attendance', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'field-movement', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'site-assignment', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'wfh', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'public-holiday', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'work-schedule', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'exit-permit', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'per-diem', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'employee-contract', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'announcements', flags: announcementManagerFlags() },
    { roleName: 'HR Manager', module: 'reports', flags: viewExportFlags() },
    { roleName: 'HR Manager', module: 'approvals', flags: hrManagerFlags() },
    { roleName: 'HR Manager', module: 'notifications', flags: viewOnlyFlags() },
    { roleName: 'HR Manager', module: 'documents', flags: viewOnlyFlags() },
    { roleName: 'HR Manager', module: 'company', flags: viewOnlyFlags() },

    // ── Local HR Manager (Mekides) - full HR access except approve ──
    { roleName: 'Local HR Manager', module: 'hr', flags: localHrManagerFlags() },
    { roleName: 'Local HR Manager', module: 'roles', flags: viewOnlyFlags() },
    { roleName: 'Local HR Manager', module: 'leave', flags: localHrManagerFlags() },
    { roleName: 'Local HR Manager', module: 'overtime', flags: localHrManagerFlags() },
    { roleName: 'Local HR Manager', module: 'attendance', flags: localHrManagerFlags() },
    {
      roleName: 'Local HR Manager',
      module: 'field-movement',
      flags: localHrManagerFlags(),
    },
    {
      roleName: 'Local HR Manager',
      module: 'site-assignment',
      flags: localHrManagerFlags(),
    },
    { roleName: 'Local HR Manager', module: 'wfh', flags: localHrManagerFlags() },
    {
      roleName: 'Local HR Manager',
      module: 'public-holiday',
      flags: localHrManagerFlags(),
    },
    {
      roleName: 'Local HR Manager',
      module: 'work-schedule',
      flags: localHrManagerFlags(),
    },
    { roleName: 'Local HR Manager', module: 'exit-permit', flags: localHrManagerFlags() },
    {
      roleName: 'Local HR Manager',
      module: 'employee-contract',
      flags: localHrManagerFlags(),
    },
    { roleName: 'Local HR Manager', module: 'announcements', flags: announcementManagerFlags() },
    { roleName: 'Local HR Manager', module: 'reports', flags: viewExportFlags() },
    { roleName: 'Local HR Manager', module: 'approvals', flags: viewOnlyFlags() },
    { roleName: 'Local HR Manager', module: 'notifications', flags: viewOnlyFlags() },
    { roleName: 'Local HR Manager', module: 'documents', flags: viewOnlyFlags() },

    // ── HR Specialist (Ms. Tang) - view all HR + manage flight tickets ──
    { roleName: 'HR Specialist', module: 'hr', flags: viewOnlyFlags() },
    { roleName: 'HR Specialist', module: 'leave', flags: viewExportFlags() },
    { roleName: 'HR Specialist', module: 'overtime', flags: viewExportFlags() },
    { roleName: 'HR Specialist', module: 'attendance', flags: viewExportFlags() },
    { roleName: 'HR Specialist', module: 'field-movement', flags: viewOnlyFlags() },
    { roleName: 'HR Specialist', module: 'exit-permit', flags: viewOnlyFlags() },
    { roleName: 'HR Specialist', module: 'employee-contract', flags: viewOnlyFlags() },
    { roleName: 'HR Specialist', module: 'announcements', flags: announcementDraftFlags() },
    { roleName: 'HR Specialist', module: 'approvals', flags: viewOnlyFlags() },
    { roleName: 'HR Specialist', module: 'notifications', flags: viewOnlyFlags() },
    { roleName: 'HR Specialist', module: 'documents', flags: viewOnlyFlags() },

    // ── HR Assistant (Asli) - limited HR view + data entry ──
    { roleName: 'HR Assistant', module: 'hr', flags: viewCreateFlags() },
    { roleName: 'HR Assistant', module: 'leave', flags: viewOnlyFlags() },
    { roleName: 'HR Assistant', module: 'overtime', flags: viewOnlyFlags() },
    { roleName: 'HR Assistant', module: 'attendance', flags: viewCreateFlags() },
    { roleName: 'HR Assistant', module: 'field-movement', flags: viewOnlyFlags() },
    { roleName: 'HR Assistant', module: 'exit-permit', flags: viewOnlyFlags() },
    { roleName: 'HR Assistant', module: 'per-diem', flags: viewCreateFlags() },
    { roleName: 'HR Assistant', module: 'employee-contract', flags: viewOnlyFlags() },
    { roleName: 'HR Assistant', module: 'announcements', flags: announcementDraftFlags() },
    { roleName: 'HR Assistant', module: 'approvals', flags: viewOnlyFlags() },
    { roleName: 'HR Assistant', module: 'notifications', flags: viewOnlyFlags() },
    { roleName: 'HR Assistant', module: 'documents', flags: viewOnlyFlags() },

    // ── Department Head - view own department employees ──
    { roleName: 'Department Head', module: 'hr', flags: viewOnlyFlags() },
    { roleName: 'Department Head', module: 'leave', flags: viewOnlyFlags() },
    { roleName: 'Department Head', module: 'overtime', flags: viewOnlyFlags() },
    { roleName: 'Department Head', module: 'attendance', flags: viewOnlyFlags() },
    {
      roleName: 'Department Head',
      module: 'approvals',
      flags: viewApproveExportFlags(),
    },
    { roleName: 'Department Head', module: 'notifications', flags: viewOnlyFlags() },
    { roleName: 'Department Head', module: 'documents', flags: viewOnlyFlags() },

    // ── Discipline Lead - view own discipline employees ──
    { roleName: 'Discipline Lead', module: 'hr', flags: viewOnlyFlags() },
    {
      roleName: 'Discipline Lead',
      module: 'leave',
      flags: viewApproveExportFlags(),
    },
    {
      roleName: 'Discipline Lead',
      module: 'overtime',
      flags: viewApproveExportFlags(),
    },
    { roleName: 'Discipline Lead', module: 'attendance', flags: viewOnlyFlags() },
    {
      roleName: 'Discipline Lead',
      module: 'field-movement',
      flags: viewApproveExportFlags(),
    },
    {
      roleName: 'Discipline Lead',
      module: 'exit-permit',
      flags: viewApproveExportFlags(),
    },
    {
      roleName: 'Discipline Lead',
      module: 'per-diem',
      flags: viewCreateFlags(),
    },
    {
      roleName: 'Discipline Lead',
      module: 'approvals',
      flags: viewApproveExportFlags(),
    },
    { roleName: 'Discipline Lead', module: 'notifications', flags: viewOnlyFlags() },
    { roleName: 'Discipline Lead', module: 'documents', flags: viewOnlyFlags() },

    // ── General Manager - view all ──
    { roleName: 'General Manager', module: 'attendance', flags: viewOnlyFlags() },
    {
      roleName: 'General Manager',
      module: 'field-movement',
      flags: viewApproveExportFlags(),
    },
    {
      roleName: 'General Manager',
      module: 'exit-permit',
      flags: viewApproveExportFlags(),
    },
    {
      roleName: 'General Manager',
      module: 'per-diem',
      flags: viewOnlyFlags(),
    },
    {
      roleName: 'General Manager',
      module: 'approvals',
      flags: viewApproveExportFlags(),
    },

    // ── Employee - self-service only ──
    { roleName: 'Employee', module: 'attendance', flags: viewOnlyFlags() },
    { roleName: 'Employee', module: 'field-movement', flags: viewCreateFlags() },
    { roleName: 'Employee', module: 'exit-permit', flags: viewCreateFlags() },
    { roleName: 'Employee', module: 'per-diem', flags: viewCreateFlags() },
    { roleName: 'Employee', module: 'approvals', flags: viewCreateFlags() },
  ];

  // Upsert all new role permissions - write full intended flags onto each
  // module action row so merged module permissions match the role matrix.
  const actionToFlag: Record<string, keyof PermissionFlags> = {
    view: 'canView',
    create: 'canCreate',
    edit: 'canEdit',
    delete: 'canDelete',
    approve: 'canApprove',
    export: 'canExport',
    manage: 'canEdit',
  };
  for (const { roleName, module, flags } of newHrRolePermissions) {
    const roleId = roleMap.get(roleName);
    if (!roleId) {
      console.warn(`Role not found: ${roleName}`);
      continue;
    }
    const modulePermissions = permissions.filter((p) => p.module === module);
    for (const perm of modulePermissions) {
      const flagKey = actionToFlag[perm.action];
      if (!flagKey) {
        continue;
      }
      // Persist the full flag set on each action row so modules without a
      // dedicated approve/export action still carry those flags on view rows.
      await upsertRolePermission(roleId, perm.id, flags);
    }
  }

  // Announcements - every other role can view what it receives. HR roles get
  // their matrix rows above; System Administrator already has full flags.
  const announcementPermissions = permissions.filter(
    (permission) => permission.module === 'announcements',
  );
  const announcementMatrixRoles = new Set([
    'System Administrator',
    ...newHrRolePermissions
      .filter((entry) => entry.module === 'announcements')
      .map((entry) => entry.roleName),
  ]);
  for (const [roleName, roleId] of roleMap) {
    if (announcementMatrixRoles.has(roleName)) {
      continue;
    }
    for (const permission of announcementPermissions) {
      await upsertRolePermission(roleId, permission.id, viewOnlyFlags());
    }
  }

  // User-management (users.* + roles.*) — consolidated grant table.
  const departmentsView = permissions.find(
    (permission) =>
      permission.module === 'departments' && permission.action === 'view',
  );
  const userMgmtGrants: Array<{
    perm: (typeof permissions)[number] | undefined;
    roleNames: string[];
    flags: PermissionFlags;
  }> = [
    {
      perm: permissions.find((p) => p.module === 'users' && p.action === 'view'),
      roleNames: [
        'HR Assistant',
        'HR Officer',
        'HR Manager',
        'Local HR Manager',
        'General Manager',
        'Managing Director',
        'System Administrator',
      ],
      flags: viewOnlyFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'users' && p.action === 'create'),
      roleNames: [
        'HR Assistant',
        'HR Officer',
        'HR Manager',
        'Local HR Manager',
        'System Administrator',
      ],
      flags: viewCreateFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'users' && p.action === 'edit'),
      roleNames: [
        'HR Assistant',
        'HR Officer',
        'HR Manager',
        'Local HR Manager',
        'System Administrator',
      ],
      flags: { canView: true, canCreate: false, canEdit: true, canDelete: false, canApprove: false, canExport: true },
    },
    {
      perm: permissions.find((p) => p.module === 'users' && p.action === 'delete'),
      roleNames: ['HR Officer', 'HR Manager', 'Local HR Manager', 'System Administrator'],
      flags: { canView: true, canCreate: false, canEdit: false, canDelete: true, canApprove: false, canExport: false },
    },
    {
      perm: permissions.find((p) => p.module === 'roles' && p.action === 'view'),
      roleNames: ['HR Manager', 'General Manager', 'Managing Director', 'System Administrator'],
      flags: viewOnlyFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'roles' && p.action === 'create'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'roles' && p.action === 'edit'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'roles' && p.action === 'delete'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
  ];
  for (const { perm, roleNames, flags } of userMgmtGrants) {
    if (!perm) {
      continue;
    }
    for (const roleName of roleNames) {
      const roleId = roleMap.get(roleName);
      if (roleId) {
        await upsertRolePermission(roleId, perm.id, flags);
      }
    }
  }

  // Org structure (branches + departments) — consolidated grant table.
  const orgStructureGrants: Array<{
    perm: (typeof permissions)[number] | undefined;
    roleNames: string[];
    flags: PermissionFlags;
  }> = [
    {
      perm: permissions.find((p) => p.module === 'branches' && p.action === 'view'),
      roleNames: ['HR Manager', 'General Manager', 'Managing Director', 'System Administrator'],
      flags: viewOnlyFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'branches' && p.action === 'create'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'branches' && p.action === 'edit'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'branches' && p.action === 'delete'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
    {
      perm: departmentsView,
      roleNames: ['HR Assistant', 'HR Officer', 'General Manager', 'Managing Director', 'System Administrator'],
      flags: viewOnlyFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'departments' && p.action === 'create'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'departments' && p.action === 'edit'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'departments' && p.action === 'delete'),
      roleNames: ['System Administrator'],
      flags: hrManagerFlags(),
    },
  ];
  for (const { perm, roleNames, flags } of orgStructureGrants) {
    if (!perm) {
      continue;
    }
    for (const roleName of roleNames) {
      const roleId = roleMap.get(roleName);
      if (roleId) {
        await upsertRolePermission(roleId, perm.id, flags);
      }
    }
  }

  // Leave module permission matrix (leave.view / create / edit / delete).
  const leaveView = permissions.find(
    (permission) =>
      permission.module === 'leave' && permission.action === 'view',
  );
  const leaveCreate = permissions.find(
    (permission) =>
      permission.module === 'leave' && permission.action === 'create',
  );
  const leaveEdit = permissions.find(
    (permission) =>
      permission.module === 'leave' && permission.action === 'edit',
  );
  const leaveDelete = permissions.find(
    (permission) =>
      permission.module === 'leave' && permission.action === 'delete',
  );

  const leaveViewCreateRoleNames = [
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

  const leaveEditRoleNames = [
    'HR Assistant',
    'HR Manager',
    'General Manager',
    'Managing Director',
    'System Administrator',
  ] as const;

  const leaveDeleteRoleNames = [
    'HR Manager',
    'General Manager',
    'Managing Director',
    'System Administrator',
  ] as const;

  if (leaveView) {
    for (const roleName of leaveViewCreateRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, leaveView.id, viewOnlyFlags());
    }
  }
  if (leaveCreate) {
    for (const roleName of leaveViewCreateRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, leaveCreate.id, {
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }
  if (leaveEdit) {
    for (const roleName of leaveEditRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, leaveEdit.id, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }
  if (leaveDelete) {
    for (const roleName of leaveDeleteRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, leaveDelete.id, {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: true,
        canApprove: false,
        canExport: false,
      });
    }
  }

  // Work schedule, public holidays, and WFH permission matrix.
  const wsView = permissions.find(
    (p) => p.module === 'work-schedule' && p.action === 'view',
  );
  const wsEdit = permissions.find(
    (p) => p.module === 'work-schedule' && p.action === 'edit',
  );
  const phView = permissions.find(
    (p) => p.module === 'public-holiday' && p.action === 'view',
  );
  const phManage = permissions.find(
    (p) => p.module === 'public-holiday' && p.action === 'manage',
  );
  const wfhView = permissions.find((p) => p.module === 'wfh' && p.action === 'view');
  const wfhCreate = permissions.find((p) => p.module === 'wfh' && p.action === 'create');
  const wfhManage = permissions.find((p) => p.module === 'wfh' && p.action === 'manage');

  const wsPhWfhViewCreateRoleNames = [
    'Employee',
    'Team Lead',
    'Department Head',
    'Discipline Lead',
    'HR Assistant',
    'HR Officer',
    'HR Manager',
    'Local HR Manager',
    'HR Specialist',
    'General Manager',
    'Managing Director',
    'System Administrator',
  ] as const;

  const wsPhWfhManageRoleNames = [
    'HR Assistant',
    'HR Officer',
    'HR Manager',
    'Local HR Manager',
    'General Manager',
    'Managing Director',
    'System Administrator',
  ] as const;

  if (wsView) {
    for (const roleName of wsPhWfhViewCreateRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, wsView.id, viewOnlyFlags());
    }
  }
  if (wsEdit) {
    for (const roleName of wsPhWfhManageRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, wsEdit.id, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }
  if (phView) {
    for (const roleName of wsPhWfhViewCreateRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, phView.id, viewOnlyFlags());
    }
  }
  if (phManage) {
    for (const roleName of wsPhWfhManageRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, phManage.id, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }
  if (wfhView) {
    for (const roleName of wsPhWfhViewCreateRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, wfhView.id, viewOnlyFlags());
    }
  }
  if (wfhCreate) {
    for (const roleName of wsPhWfhViewCreateRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, wfhCreate.id, {
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }
  if (wfhManage) {
    for (const roleName of wsPhWfhManageRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, wfhManage.id, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }

  const saView = permissions.find(
    (p) => p.module === 'site-assignment' && p.action === 'view',
  );
  const saCreate = permissions.find(
    (p) => p.module === 'site-assignment' && p.action === 'create',
  );
  const saManage = permissions.find(
    (p) => p.module === 'site-assignment' && p.action === 'manage',
  );
  if (saView) {
    for (const roleName of wsPhWfhViewCreateRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, saView.id, viewOnlyFlags());
    }
  }
  if (saCreate) {
    for (const roleName of wsPhWfhViewCreateRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, saCreate.id, {
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }
  if (saManage) {
    for (const roleName of wsPhWfhManageRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, saManage.id, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }

  const payrollView = permissions.find(
    (p) => p.module === 'payroll' && p.action === 'view',
  );
  const payrollCreate = permissions.find(
    (p) => p.module === 'payroll' && p.action === 'create',
  );
  const payrollEdit = permissions.find(
    (p) => p.module === 'payroll' && p.action === 'edit',
  );
  const payrollApprove = permissions.find(
    (p) => p.module === 'payroll' && p.action === 'approve',
  );
  const payrollExport = permissions.find(
    (p) => p.module === 'payroll' && p.action === 'export',
  );
  const companySettingsView = permissions.find(
    (p) => p.module === 'company_settings' && p.action === 'view',
  );
  const companySettingsEdit = permissions.find(
    (p) => p.module === 'company_settings' && p.action === 'edit',
  );

  const payrollViewRoleNames = [
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
  const payrollCreateEditRoleNames = [
    'HR Assistant',
    'HR Manager',
    'System Administrator',
  ] as const;
  const payrollApproveRoleNames = [
    'HR Manager',
    'General Manager',
    'System Administrator',
  ] as const;
  const payrollExportRoleNames = [
    'HR Assistant',
    'HR Manager',
    'General Manager',
    'Managing Director',
    'System Administrator',
  ] as const;
  const companySettingsViewRoleNames = [
    'HR Manager',
    'General Manager',
    'Managing Director',
    'System Administrator',
  ] as const;
  const companySettingsEditRoleNames = [
    'HR Manager',
    'System Administrator',
  ] as const;

  if (payrollView) {
    for (const roleName of payrollViewRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, payrollView.id, viewOnlyFlags());
    }
  }
  if (payrollCreate) {
    for (const roleName of payrollCreateEditRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, payrollCreate.id, {
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }
  if (payrollEdit) {
    for (const roleName of payrollCreateEditRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, payrollEdit.id, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }
  if (payrollApprove) {
    for (const roleName of payrollApproveRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, payrollApprove.id, {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: true,
        canExport: false,
      });
    }
  }
  if (payrollExport) {
    for (const roleName of payrollExportRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, payrollExport.id, {
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: true,
      });
    }
  }
  if (companySettingsView) {
    for (const roleName of companySettingsViewRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, companySettingsView.id, viewOnlyFlags());
    }
  }
  if (companySettingsEdit) {
    for (const roleName of companySettingsEditRoleNames) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, companySettingsEdit.id, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }

  // Overtime: view for leadership/HR; create also for Employee (own requests).
  const overtimeView = permissions.find(
    (permission) =>
      permission.module === 'overtime' && permission.action === 'view',
  );
  const overtimeCreate = permissions.find(
    (permission) =>
      permission.module === 'overtime' && permission.action === 'create',
  );
  if (overtimeView) {
    for (const roleName of [
      'General Manager',
      'Managing Director',
      'HR Officer',
    ] as const) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, overtimeView.id, viewOnlyFlags());
    }
  }
  if (overtimeCreate) {
    for (const roleName of [
      'General Manager',
      'Managing Director',
      'HR Officer',
      'Employee',
    ] as const) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, overtimeCreate.id, {
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
    }
  }

  // Employee contracts: view for all roles; create/edit for HR roles.
  const employeeContractView = permissions.find(
    (permission) =>
      permission.module === 'employee-contract' &&
      permission.action === 'view',
  );
  const employeeContractCreate = permissions.find(
    (permission) =>
      permission.module === 'employee-contract' &&
      permission.action === 'create',
  );
  const employeeContractEdit = permissions.find(
    (permission) =>
      permission.module === 'employee-contract' && permission.action === 'edit',
  );
  if (employeeContractView) {
    for (const roleName of [
      'Employee',
      'Team Lead',
      'Department Head',
      'Discipline Leader',
      'HR Assistant',
      'HR Officer',
      'HR Manager',
      'General Manager',
      'Managing Director',
      'System Administrator',
    ] as const) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, employeeContractView.id, viewOnlyFlags());
    }
  }
  if (employeeContractCreate && employeeContractEdit) {
    for (const roleName of [
      'HR Assistant',
      'HR Officer',
      'HR Manager',
      'System Administrator',
    ] as const) {
      const roleId = roleMap.get(roleName);
      if (!roleId) {
        continue;
      }
      await upsertRolePermission(roleId, employeeContractCreate.id, {
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
        canApprove: false,
        canExport: false,
      });
      await upsertRolePermission(roleId, employeeContractEdit.id, {
        canView: true,
        canCreate: false,
        canEdit: true,
        canDelete: true,
        canApprove: false,
        canExport: true,
      });
    }
  }

  // Flight — consolidated grant table.
  const flightGrants: Array<{
    perm: (typeof permissions)[number] | undefined;
    roleNames: string[];
    flags: PermissionFlags;
  }> = [
    {
      perm: permissions.find((p) => p.module === 'flight' && p.action === 'view'),
      roleNames: [
        'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
        'HR Assistant', 'HR Officer', 'HR Manager', 'General Manager',
        'Managing Director', 'System Administrator',
      ],
      flags: viewOnlyFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'flight' && p.action === 'create'),
      roleNames: [
        'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
        'HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator',
      ],
      flags: viewCreateFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'flight' && p.action === 'manage'),
      roleNames: ['HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator'],
      flags: { canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: false },
    },
  ];
  for (const { perm, roleNames, flags } of flightGrants) {
    if (!perm) {
      continue;
    }
    for (const roleName of roleNames) {
      const roleId = roleMap.get(roleName);
      if (roleId) {
        await upsertRolePermission(roleId, perm.id, flags);
      }
    }
  }

  // Business-trip (business-trip.*) — consolidated grant table.
  const businessTripGrants: Array<{
    perm: (typeof permissions)[number] | undefined;
    roleNames: string[];
    flags: PermissionFlags;
  }> = [
    {
      perm: permissions.find((p) => p.module === 'business-trip' && p.action === 'view'),
      roleNames: [
        'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
        'HR Assistant', 'HR Officer', 'HR Manager', 'General Manager',
        'Managing Director', 'System Administrator',
      ],
      flags: viewOnlyFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'business-trip' && p.action === 'create'),
      roleNames: [
        'Employee', 'Team Lead', 'Department Head', 'Discipline Leader',
        'HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator',
      ],
      flags: viewCreateFlags(),
    },
    {
      perm: permissions.find((p) => p.module === 'business-trip' && p.action === 'manage'),
      roleNames: ['HR Assistant', 'HR Officer', 'HR Manager', 'System Administrator'],
      flags: { canView: true, canCreate: true, canEdit: true, canDelete: false, canApprove: false, canExport: false },
    },
  ];
  for (const { perm, roleNames, flags } of businessTripGrants) {
    if (!perm) continue;
    for (const roleName of roleNames) {
      const roleId = roleMap.get(roleName);
      if (roleId) {
        await upsertRolePermission(roleId, perm.id, flags);
      }
    }
  }

  const pmRoleNames = [
    'Managing Director',
    'Project Manager',
    'Project Administrator',
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
      const flags =
        pmPermissionFlags(roleName, permission.module, permission.action) ??
        extendedPmModulePermissionFlags(
          roleName,
          permission.module,
          permission.action,
        ) ??
        reportsPermissionFlags(roleName, permission.module, permission.action);
      if (!flags) {
        continue;
      }
      await upsertRolePermission(roleId, permission.id, flags);
    }
  }

  // Project Manager / Project Administrator must never hold HR module permissions.
  await revokeHrModulePermissionsForRoles(
    ['Project Manager', 'Project Administrator']
      .map((name) => roleMap.get(name))
      .filter((id): id is string => Boolean(id)),
  );

  const reportsOnlyRoleNames = [
    'Finance Manager',
    'Accountant',
  ] as const;

  for (const roleName of reportsOnlyRoleNames) {
    const roleId = roleMap.get(roleName);
    if (!roleId) {
      continue;
    }
    for (const permission of permissions) {
      const flags = reportsPermissionFlags(
        roleName,
        permission.module,
        permission.action,
      );
      if (!flags) {
        continue;
      }
      await upsertRolePermission(roleId, permission.id, flags);
    }
  }

  for (const roleName of DESIGN_WORKFLOW_ROLES) {
    const roleId = roleMap.get(roleName);
    if (!roleId) {
      continue;
    }
    for (const permission of permissions) {
      const flags =
        designWorkflowRolePermissionFlags(
          roleName,
          permission.module,
          permission.action,
        ) ??
        reportsPermissionFlags(
          roleName,
          permission.module,
          permission.action,
        );
      if (!flags) {
        continue;
      }
      await upsertRolePermission(roleId, permission.id, flags);
    }
  }

  for (const roleName of EPC_WORKFLOW_ROLES) {
    const roleId = roleMap.get(roleName);
    if (!roleId) {
      continue;
    }
    for (const permission of permissions) {
      const flags = epcWorkflowPermissionFlags(
        roleName,
        permission.module,
        permission.action,
      );
      if (!flags) {
        continue;
      }
      await upsertRolePermission(roleId, permission.id, flags);
    }
  }

  const extendedPmOnlyRoleNames = ['Institute Chief'] as const;

  for (const roleName of extendedPmOnlyRoleNames) {
    const roleId = roleMap.get(roleName);
    if (!roleId) {
      continue;
    }
    for (const permission of permissions) {
      const flags = extendedPmModulePermissionFlags(
        roleName,
        permission.module,
        permission.action,
      );
      if (!flags) {
        continue;
      }
      await upsertRolePermission(roleId, permission.id, flags);
    }
  }

  // Employee gets read-only project portfolio access (not construction submittals -
  // those are gated by Designer / Discipline Lead FK personas or admin roles).
  const employeePmViewFlags = viewOnlyFlags();
  for (const permission of permissions) {
    if (!PM_MODULES.includes(permission.module as (typeof PM_MODULES)[number])) {
      continue;
    }
    if (permission.module === 'submittals') {
      continue;
    }
    if (permission.action !== 'view') {
      continue;
    }
    await upsertRolePermission(employeeRoleId, permission.id, employeePmViewFlags);
  }

  const employeeSubmittalsView = permissions.find(
    (permission) =>
      permission.module === 'submittals' && permission.action === 'view',
  );
  if (employeeRoleId && employeeSubmittalsView) {
    await prisma.rolePermission.updateMany({
      where: {
        roleId: employeeRoleId,
        permissionId: employeeSubmittalsView.id,
        deletedAt: null,
      },
      data: {
        deletedAt: new Date(),
        deletedBy: SYSTEM_USER_ID,
        updatedBy: SYSTEM_USER_ID,
      },
    });
  }

  // ── Organisation bootstrap ─────────────────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { id: '00000000-0000-4000-8000-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000010',
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

  const department = await ensureSeedDepartment(prisma, {
    companyId: company.id,
    divisionId: division.id,
    branchId: branch.id,
    name: 'Information Technology',
    createdBy: SYSTEM_USER_ID,
  });

  await seedOrgStructure(prisma, {
    companyId: company.id,
    createdBy: SYSTEM_USER_ID,
  });

  const position = await prisma.position.upsert({
    where: { id: '00000000-0000-4000-8000-000000000020' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000020',
      companyId: company.id,
      title: 'System Administrator',
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
      isActive: true,
      deletedAt: null,
      deletedBy: null,
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
    {
      module: 'modules',
      key: 'projectManagement.enabled',
      value: process.env.PM_MODULE_ENABLED === 'true' ? 'true' : 'false',
      dataType: 'BOOLEAN',
      isPublic: true,
    },
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
    where: { id: '00000000-0000-4000-8000-000000000030' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000030',
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
    'TASK',
    'SUBTASK',
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

  await createPostgresSequence('change_request_number_seq');
  await createPostgresSequence('risk_number_seq');
  await createPostgresSequence('deliverable_number_seq');

  // ── System document folder ───────────────────────────────────────────────
  await prisma.documentFolder.upsert({
    where: { id: '00000000-0000-4000-8000-000000000040' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000040',
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
    where: { id: '00000000-0000-4000-8000-000000000050' },
    update: {},
    create: {
      id: '00000000-0000-4000-8000-000000000050',
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
      where: { id: '00000000-0000-4000-8000-000000000060' },
      update: {},
      create: {
        id: '00000000-0000-4000-8000-000000000060',
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
  console.log(`  Admin password: ${seedAdminPasswordSourceLabel()}`);
  console.log(`  Roles seeded: ${CORE_ROLES.length}`);
  console.log(`  Permissions seeded: ${permissions.length}`);

  await seedApprovalCategories(prisma, {
    companyId: company.id,
    actorUserId: adminUser.id,
  });

  await seedLeavePolicies({
    prisma,
    companyId: company.id,
    actorUserId: adminUser.id,
  });

  await seedWorkSchedules({
    prisma,
    companyId: company.id,
    actorUserId: adminUser.id,
  });

  if (process.env.SEED_PM_DEMO === 'false') {
    console.log('  PM demo skipped (SEED_PM_DEMO=false)');
  } else {
    const pmCtx = {
      prisma,
      companyId: company.id,
      branchId: branch.id,
      departmentId: department.id,
      positionId: position.id,
      adminUserId: adminUser.id,
      roleMap,
      defaultPassword: adminPassword,
    };
    await seedPmDemoData(pmCtx);
    await seedAllProjectTypes(pmCtx);
    await appendRichDemoProjects(pmCtx);
    // await seedComment8Walkthrough(pmCtx);
    console.log(
      `  Demo password for all seeded accounts: ${seedAdminPasswordSourceLabel()}`,
    );
  }

  console.log('Seeding evaluation template...');
  await seedEvaluationTemplate(prisma, {
    companyId: company.id,
    actorUserId: adminUser.id,
  });
}

main()
  .catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
