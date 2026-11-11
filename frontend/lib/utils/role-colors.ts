/**
 * Ant Design Tag color tokens for system roles.
 * Unknown roles fall back to `default`.
 */
export const ROLE_COLORS: Record<string, string> = {
  'General Manager': 'red',
  'HR Manager': 'purple',
  'Local HR Manager': 'magenta',
  'HR Specialist': 'blue',
  'HR Assistant': 'cyan',
  'Department Head': 'orange',
  'Discipline Lead': 'gold',
  Employee: 'default',
  'System Administrator': 'red',
  'Managing Director': 'red',
  'Project Manager': 'geekblue',
  'Project Administrator': 'geekblue',
  'Document Controller': 'lime',
  'Finance Manager': 'green',
  Accountant: 'green',
  'HR Officer': 'purple',
  'Site Engineer': 'blue',
  'Procurement Officer': 'cyan',
  Storekeeper: 'default',
  'Safety Officer': 'volcano',
  'Project Director': 'geekblue',
  'Planning Engineer': 'blue',
  'Chief Engineer': 'geekblue',
  Designer: 'purple',
  Dispatcher: 'default',
  Reviewer: 'gold',
  'Discipline Owner': 'gold',
  'Department Chief': 'orange',
  'Institute Chief': 'orange',
  'Deputy Chief': 'orange',
  'Site Coordinator': 'blue',
  'Client Consultant': 'default',
};

/**
 * Chinese display names for seeded system roles (English name is the DB key).
 */
export const ROLE_NAMES_ZH: Record<string, string> = {
  'System Administrator': '系统管理员',
  'Project Administrator': '项目管理员',
  'Managing Director': '董事总经理',
  'Project Manager': '项目经理',
  'Site Engineer': '现场工程师',
  'Document Controller': '资料员',
  'Finance Manager': '财务经理',
  Accountant: '会计',
  'Procurement Officer': '采购专员',
  Storekeeper: '仓管员',
  'HR Officer': '人事专员',
  'HR Manager': '人力资源经理',
  'Local HR Manager': '本地人力资源经理',
  'HR Specialist': '人力资源专员',
  'HR Assistant': '人力资源助理',
  'Department Head': '部门负责人',
  'Safety Officer': '安全员',
  Employee: '员工',
  'General Manager': '总经理',
  'Project Director': '项目总监',
  'Planning Engineer': '计划工程师',
  'Chief Engineer': '总工程师',
  Designer: '设计师',
  Dispatcher: '调度员',
  Reviewer: '审核人',
  'Discipline Owner': '专业负责人',
  'Discipline Lead': '专业主管',
  'Department Chief': '部门主任',
  'Institute Chief': '院主任',
  'Deputy Chief': '副主任',
  'Site Coordinator': '现场协调员',
  'Client Consultant': '客户顾问',
};

/**
 * Returns an Ant Design Tag color for the given role name.
 */
export function getRoleColor(roleName: string): string {
  return ROLE_COLORS[roleName] ?? 'default';
}

/**
 * Returns the Chinese name for a role, or null when unknown.
 */
export function getRoleNameZh(roleName: string): string | null {
  return ROLE_NAMES_ZH[roleName] ?? null;
}

/**
 * Bilingual role label: `"HR Manager / 人力资源经理"`, or English only if no ZH mapping.
 */
export function formatRoleDisplayName(roleName: string): string {
  const nameZh = getRoleNameZh(roleName);
  return nameZh ? `${roleName} / ${nameZh}` : roleName;
}

/**
 * Typography emphasis for primary vs secondary role labels.
 */
export function getRoleBadgeStyle(
  _roleName: string,
  isPrimary: boolean,
): { color?: string; fontWeight: number } {
  return {
    color: isPrimary ? undefined : 'var(--color-text-secondary)',
    fontWeight: isPrimary ? 600 : 400,
  };
}
