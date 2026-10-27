export const DOCS_ROLE_KEYS = [
  'ADMIN',
  'GENERAL_MANAGER',
  'MANAGING_DIRECTOR',
  'HR_MANAGER',
  'HR_ASSISTANT',
  'HR_SPECIALIST',
  'EMPLOYEE',
  'DEPARTMENT_HEAD',
  'DISCIPLINE_LEADER',
] as const;

export type DocsRoleKey = (typeof DOCS_ROLE_KEYS)[number];

export interface DocsRoleDefinition {
  readonly key: DocsRoleKey;
  /** Folder / storageState slug. */
  readonly slug: string;
  /** Exact Role.name in the database (Discipline Lead, not Discipline Leader). */
  readonly dbRoleName: string;
  readonly label: string;
}

export const DOCS_ROLES: readonly DocsRoleDefinition[] = [
  {
    key: 'ADMIN',
    slug: 'admin',
    dbRoleName: 'System Administrator',
    label: 'System Administrator',
  },
  {
    key: 'GENERAL_MANAGER',
    slug: 'general-manager',
    dbRoleName: 'General Manager',
    label: 'General Manager',
  },
  {
    key: 'MANAGING_DIRECTOR',
    slug: 'managing-director',
    dbRoleName: 'Managing Director',
    label: 'Managing Director',
  },
  {
    key: 'HR_MANAGER',
    slug: 'hr-manager',
    dbRoleName: 'HR Manager',
    label: 'HR Manager',
  },
  {
    key: 'HR_ASSISTANT',
    slug: 'hr-assistant',
    dbRoleName: 'HR Assistant',
    label: 'HR Assistant',
  },
  {
    key: 'HR_SPECIALIST',
    slug: 'hr-specialist',
    dbRoleName: 'HR Specialist',
    label: 'HR Specialist',
  },
  {
    key: 'EMPLOYEE',
    slug: 'employee',
    dbRoleName: 'Employee',
    label: 'Employee',
  },
  {
    key: 'DEPARTMENT_HEAD',
    slug: 'department-head',
    dbRoleName: 'Department Head',
    label: 'Department Head',
  },
  {
    key: 'DISCIPLINE_LEADER',
    slug: 'discipline-leader',
    dbRoleName: 'Discipline Lead',
    label: 'Discipline Lead',
  },
] as const;

export function getRoleByKey(key: DocsRoleKey): DocsRoleDefinition {
  const role = DOCS_ROLES.find((r) => r.key === key);
  if (!role) {
    throw new Error(`Unknown docs role key: ${key}`);
  }
  return role;
}

export function resolveRoleCredentials(key: DocsRoleKey): {
  identifier: string;
  password: string;
} {
  const identifier = process.env[`DOCS_${key}_IDENTIFIER`]?.trim() ?? '';
  const password = process.env[`DOCS_${key}_PASSWORD`] ?? '';
  if (!identifier || !password) {
    throw new Error(
      `Missing DOCS_${key}_IDENTIFIER or DOCS_${key}_PASSWORD in env`,
    );
  }
  return { identifier, password };
}

/** Roles selected via DOCS_ROLES (comma-separated keys), or all. */
export function selectedRoleKeys(): DocsRoleKey[] {
  const raw = process.env.DOCS_ROLES?.trim();
  if (!raw) {
    return [...DOCS_ROLE_KEYS];
  }
  const wanted = new Set(
    raw
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean),
  );
  return DOCS_ROLE_KEYS.filter((key) => wanted.has(key));
}
