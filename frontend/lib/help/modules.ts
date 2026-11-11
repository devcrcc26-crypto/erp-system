/**
 * Help portal module catalog and role-based visibility.
 * Role names match DB seeds / {@link HR_ROLE_NAMES} in dashboard-roles.
 */

import {
  HR_ROLE_NAMES,
  SUPERVISOR_ROLE_NAMES,
} from '@/lib/dashboard/dashboard-roles';

export type RoleGroup = 'HR' | 'SUPERVISOR' | 'EMPLOYEE';

export interface HelpModule {
  readonly slug: string;
  readonly titleEn: string;
  readonly titleZh: string;
  /** Which role groups can see this module in the help sidebar. */
  readonly roles: readonly RoleGroup[];
}

export const HELP_MODULES: readonly HelpModule[] = [
  {
    slug: 'getting-started',
    titleEn: 'Getting Started',
    titleZh: '入门指南',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'dashboard',
    titleEn: 'Dashboard',
    titleZh: '仪表盘',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'leave',
    titleEn: 'Leave Requests',
    titleZh: '请假申请',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'overtime',
    titleEn: 'Overtime (OT)',
    titleZh: '加班申请',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'site-assignments',
    titleEn: 'Site Assignments',
    titleZh: '现场派驻',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'per-diem',
    titleEn: 'Per Diem',
    titleZh: '差旅补贴',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'flight',
    titleEn: 'Flight Applications',
    titleZh: '机票申请',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'expense-claims',
    titleEn: 'Expense Claims',
    titleZh: '费用报销',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'exit-permit',
    titleEn: 'Exit Permit',
    titleZh: '设备和材料退出许可',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'seals',
    titleEn: 'Official & Project Seals',
    titleZh: '公章与项目章',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'business-trips',
    titleEn: 'Business Trips',
    titleZh: '第三国出差',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'work-from-home',
    titleEn: 'Work From Home',
    titleZh: '居家办公',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'vehicles',
    titleEn: 'Vehicles',
    titleZh: '车辆',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'materials',
    titleEn: 'Materials & Purchases',
    titleZh: '物料与采购',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'approvals',
    titleEn: 'Approvals Inbox',
    titleZh: '审批收件箱',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'profile',
    titleEn: 'My Profile & Notifications',
    titleZh: '我的资料与通知',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'announcements',
    titleEn: 'Announcements',
    titleZh: '公告',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'attendance',
    titleEn: 'Attendance',
    titleZh: '考勤管理',
    roles: ['HR'],
  },
  {
    slug: 'payroll',
    titleEn: 'Payroll',
    titleZh: '薪资管理',
    roles: ['HR'],
  },
  {
    slug: 'employee-management',
    titleEn: 'Employee Management',
    titleZh: '员工管理',
    roles: ['HR'],
  },
  {
    slug: 'evaluations',
    titleEn: 'Evaluations',
    titleZh: '绩效考核',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'field-movement',
    titleEn: 'Field Movement & Early Departure',
    titleZh: '外勤与早退说明',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'company-assets',
    titleEn: 'Company Assets',
    titleZh: '公司资产',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
  {
    slug: 'tips',
    titleEn: 'Tips & FAQ',
    titleZh: '常见问题',
    roles: ['HR', 'SUPERVISOR', 'EMPLOYEE'],
  },
] as const;

function normalizeRoleName(name: string): string {
  return name.trim().toLowerCase();
}

function hasRoleIn(
  roleNames: readonly string[],
  allowed: readonly string[],
): boolean {
  const allowedSet = new Set(allowed.map(normalizeRoleName));
  return roleNames.some((name) => allowedSet.has(normalizeRoleName(name)));
}

/**
 * Highest-privilege group wins: HR ⊃ supervisor ⊃ employee.
 * `canViewHr` also grants the HR help set (matches dashboard tabs).
 */
export function resolveHelpRoleGroup(
  roleNames: readonly string[],
  canViewHr: boolean,
): RoleGroup {
  if (canViewHr || hasRoleIn(roleNames, HR_ROLE_NAMES)) {
    return 'HR';
  }
  if (hasRoleIn(roleNames, SUPERVISOR_ROLE_NAMES)) {
    return 'SUPERVISOR';
  }
  return 'EMPLOYEE';
}

export function getVisibleModules(
  roleNames: readonly string[],
  canViewHr: boolean,
): HelpModule[] {
  const group = resolveHelpRoleGroup(roleNames, canViewHr);
  return HELP_MODULES.filter((module) => module.roles.includes(group));
}

export function isValidHelpSlug(slug: string): boolean {
  return HELP_MODULES.some((module) => module.slug === slug);
}

export function getHelpModule(slug: string): HelpModule | undefined {
  return HELP_MODULES.find((module) => module.slug === slug);
}
