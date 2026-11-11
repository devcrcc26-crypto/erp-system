/**
 * Read-only export of the role × permission matrix to docs/permissions-matrix.csv.
 *
 * Cells show EFFECTIVE access the way PermissionService resolves it:
 *   - Flags are merged across every RolePermission row of the module (the guard
 *     checks module + flag, not the individual permission row) and across the
 *     role's parent chain.
 *   - The flag for an action comes from ACTION_TO_FLAG (e.g. manage → canEdit).
 *   - System Administrator → Y everywhere. Project Administrator → Y, except
 *     modules in PROJECT_ADMIN_EXCLUDED_MODULES → X (bypass withheld).
 *   - Blank = no access.
 *
 * checked_in_backend = Y when backend/src (non-spec) references the module/action
 * pair in a permission check ({ module, action } objects or hasPermission calls).
 *
 * Writes nothing to the database.
 *
 * Run: cd backend && npx ts-node --transpile-only prisma/scripts/export-permissions-matrix.ts
 * Optional: COMPANY_ID=<uuid> to choose a company when several exist.
 */
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  ACTION_TO_FLAG,
  PermissionAction,
  PermissionFlags,
} from '../../src/shared/permissions/permission.types';
import {
  PROJECT_ADMIN_EXCLUDED_MODULES,
  PROJECT_ADMINISTRATOR_ROLE,
  SYSTEM_ADMINISTRATOR_ROLE,
} from '../../src/shared/permissions/system-admin.util';

const prisma = new PrismaClient();

const BACKEND_ROOT = path.resolve(__dirname, '..', '..');
const SRC_ROOT = path.join(BACKEND_ROOT, 'src');
const OUTPUT_PATH = path.resolve(BACKEND_ROOT, '..', 'docs', 'permissions-matrix.csv');

/** Modules shown with scope "project-management" (same set as the previous matrix). */
const PROJECT_MANAGEMENT_MODULES = new Set([
  'change_requests',
  'closeout',
  'correspondence',
  'daily_logs',
  'deliverables',
  'design_packages',
  'drawings',
  'engineering_documents',
  'issues',
  'meetings',
  'projects',
  'punch_items',
  'review_comments',
  'review_sessions',
  'rfis',
  'risks',
  'schedule',
  'submittals',
]);

/** Roles tagged "[PM]" in the header (same set as the previous matrix). */
const PM_ROLES = new Set([
  'Chief Engineer',
  'Client Consultant',
  'Department Chief',
  'Deputy Chief',
  'Designer',
  'Discipline Lead',
  'Discipline Owner',
  'Document Controller',
  'Institute Chief',
  'Planning Engineer',
  'Project Director',
  'Project Manager',
  'Reviewer',
  'Site Coordinator',
  'Site Engineer',
]);

const FLAG_KEYS: Array<keyof PermissionFlags> = [
  'canView',
  'canCreate',
  'canEdit',
  'canDelete',
  'canApprove',
  'canExport',
];

function emptyFlags(): PermissionFlags {
  return {
    canView: false,
    canCreate: false,
    canEdit: false,
    canDelete: false,
    canApprove: false,
    canExport: false,
  };
}

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      listSourceFiles(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** module.action keys referenced by permission checks in backend/src. */
function collectCheckedKeys(): Set<string> {
  const keys = new Set<string>();
  const objectPattern =
    /module:\s*['"]([\w-]+)['"]\s*,\s*action:\s*['"](\w+)['"]/g;
  const reversedObjectPattern =
    /action:\s*['"](\w+)['"]\s*,\s*module:\s*['"]([\w-]+)['"]/g;
  const callPattern = /hasPermission\(\s*[^)]*?['"]([\w-]+)['"]\s*,\s*['"](\w+)['"]\s*,?\s*\)/g;
  // @RequirePermission('module', 'action') takes positional strings.
  const decoratorPattern =
    /RequirePermission\(\s*['"]([\w-]+)['"]\s*,\s*['"](\w+)['"]/g;

  for (const file of listSourceFiles(SRC_ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(decoratorPattern)) keys.add(`${m[1]}.${m[2]}`);
    for (const m of text.matchAll(objectPattern)) keys.add(`${m[1]}.${m[2]}`);
    for (const m of text.matchAll(reversedObjectPattern)) keys.add(`${m[2]}.${m[1]}`);
    for (const m of text.matchAll(callPattern)) keys.add(`${m[1]}.${m[2]}`);
  }
  return keys;
}

async function resolveCompanyId(): Promise<string> {
  const fromEnv = process.env.COMPANY_ID?.trim();
  if (fromEnv) return fromEnv;

  const companies = await prisma.role.groupBy({
    by: ['companyId'],
    where: { deletedAt: null, isActive: true },
    _count: { _all: true },
  });
  if (companies.length === 0) {
    throw new Error('No active roles found');
  }
  if (companies.length > 1) {
    const ids = companies.map((c) => c.companyId).join(', ');
    throw new Error(`Several companies have roles (${ids}). Set COMPANY_ID.`);
  }
  return companies[0].companyId;
}

async function main(): Promise<void> {
  const companyId = await resolveCompanyId();

  // All non-deleted roles (inactive ones still count as parents, as in PermissionService).
  const allRoles = await prisma.role.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, name: true, isActive: true, parentRoleId: true },
  });
  const roleById = new Map(allRoles.map((r) => [r.id, r]));
  const activeRoles = allRoles.filter((r) => r.isActive);

  const userRoles = await prisma.userRole.findMany({
    where: {
      deletedAt: null,
      roleId: { in: activeRoles.map((r) => r.id) },
      user: { deletedAt: null, isActive: true },
    },
    select: { roleId: true, userId: true },
  });
  const usersByRole = new Map<string, Set<string>>();
  for (const ur of userRoles) {
    const set = usersByRole.get(ur.roleId) ?? new Set<string>();
    set.add(ur.userId);
    usersByRole.set(ur.roleId, set);
  }
  const userCount = (roleId: string): number => usersByRole.get(roleId)?.size ?? 0;

  const sortedRoles = [...activeRoles].sort(
    (a, b) => userCount(b.id) - userCount(a.id) || a.name.localeCompare(b.name),
  );

  const permissions = await prisma.permission.findMany({
    select: { id: true, module: true, action: true },
  });
  permissions.sort((a, b) =>
    `${a.module}.${a.action}`.localeCompare(`${b.module}.${b.action}`),
  );

  const rolePermissions = await prisma.rolePermission.findMany({
    where: { deletedAt: null, roleId: { in: allRoles.map((r) => r.id) } },
    select: {
      roleId: true,
      permissionId: true,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      canApprove: true,
      canExport: true,
      permission: { select: { module: true } },
    },
  });

  // Direct flags: roleId → module → merged flags; roleId → permissionId → row flags.
  const moduleFlagsByRole = new Map<string, Map<string, PermissionFlags>>();
  const rowFlagsByRole = new Map<string, Map<string, PermissionFlags>>();
  for (const rp of rolePermissions) {
    const modules = moduleFlagsByRole.get(rp.roleId) ?? new Map();
    const merged = modules.get(rp.permission.module) ?? emptyFlags();
    for (const key of FLAG_KEYS) merged[key] = merged[key] || rp[key];
    modules.set(rp.permission.module, merged);
    moduleFlagsByRole.set(rp.roleId, modules);

    const rows = rowFlagsByRole.get(rp.roleId) ?? new Map();
    const row = emptyFlags();
    for (const key of FLAG_KEYS) row[key] = rp[key];
    rows.set(rp.permissionId, row);
    rowFlagsByRole.set(rp.roleId, rows);
  }

  function roleChain(roleId: string): string[] {
    const chain: string[] = [];
    const seen = new Set<string>();
    let current: string | null = roleId;
    while (current && !seen.has(current) && roleById.has(current)) {
      seen.add(current);
      chain.push(current);
      current = roleById.get(current)?.parentRoleId ?? null;
    }
    return chain;
  }

  function hasAccess(
    roleId: string,
    permission: { id: string; module: string; action: string },
  ): boolean {
    const flagKey = ACTION_TO_FLAG[permission.action as PermissionAction];
    return roleChain(roleId).some((id) => {
      if (flagKey) {
        return moduleFlagsByRole.get(id)?.get(permission.module)?.[flagKey] === true;
      }
      // Action the guard does not know: fall back to any flag on that exact row.
      const row = rowFlagsByRole.get(id)?.get(permission.id);
      return row ? FLAG_KEYS.some((key) => row[key]) : false;
    });
  }

  function cell(
    role: { id: string; name: string },
    permission: { id: string; module: string; action: string },
  ): string {
    if (role.name === SYSTEM_ADMINISTRATOR_ROLE) return 'Y';
    if (role.name === PROJECT_ADMINISTRATOR_ROLE) {
      return PROJECT_ADMIN_EXCLUDED_MODULES.has(permission.module) ? 'X' : 'Y';
    }
    return hasAccess(role.id, permission) ? 'Y' : '';
  }

  const checkedKeys = collectCheckedKeys();

  const header = [
    'permission_key',
    'module',
    'action',
    'scope',
    'checked_in_backend',
    ...sortedRoles.map((r) => {
      const label = PM_ROLES.has(r.name) ? `${r.name} [PM]` : r.name;
      return `${label} (${userCount(r.id)} users)`;
    }),
  ];

  const lines = [header.map(csvCell).join(',')];
  for (const permission of permissions) {
    const key = `${permission.module}.${permission.action}`;
    const row = [
      key,
      permission.module,
      permission.action,
      PROJECT_MANAGEMENT_MODULES.has(permission.module) ? 'project-management' : 'core',
      checkedKeys.has(key) ? 'Y' : 'N',
      ...sortedRoles.map((role) => cell(role, permission)),
    ];
    lines.push(row.map(csvCell).join(','));
  }

  fs.writeFileSync(OUTPUT_PATH, `${lines.join('\n')}\n`, 'utf8');
  console.log(
    `Wrote ${permissions.length} permissions × ${sortedRoles.length} roles to ${OUTPUT_PATH}`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
