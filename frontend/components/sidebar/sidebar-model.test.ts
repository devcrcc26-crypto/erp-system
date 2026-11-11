import { describe, expect, it } from 'vitest';
import { EMPTY_CAPABILITIES, type Capabilities } from '@/lib/api/types';
import { SIDEBAR_CONFIG } from '@/components/sidebar/sidebar.config';
import { HELP_MODULES } from '@/lib/help/modules';
import { resolveSidebarPermissions } from '@/components/sidebar/sidebar-permissions';
import {
  buildSidebarModel,
  flattenSidebarModel,
  resolveActiveLink,
  searchSidebar,
  type SidebarFolder,
  type SidebarModel,
} from '@/components/sidebar/sidebar-model';

function capabilities(overrides: Partial<Capabilities> = {}): Capabilities {
  return { ...structuredClone(EMPTY_CAPABILITIES), ...overrides };
}

function withProjects(): Pick<Capabilities, 'pm'> {
  return {
    pm: {
      ...structuredClone(EMPTY_CAPABILITIES.pm),
      projects: { ...EMPTY_CAPABILITIES.pm.projects, canView: true },
    },
  };
}

function modelFor(overrides: Partial<Capabilities>, ready = true): SidebarModel {
  const permissions = resolveSidebarPermissions({
    capabilities: capabilities(overrides),
    ready,
    hasProjectAdministratorRole: false,
  });
  return buildSidebarModel(SIDEBAR_CONFIG, permissions);
}

/** PM module enabled with portfolio project access (sees Project Management). */
function pmModuleWithProjects(
  overrides: Partial<Capabilities> = {},
): Partial<Capabilities> {
  return {
    canViewHr: true,
    isSystemAdministrator: true,
    modulesProjectManagementEnabled: true,
    ...withProjects(),
    ...overrides,
  };
}

function folder(model: SidebarModel, id: string): SidebarFolder | undefined {
  return model.primary.find(
    (entry): entry is SidebarFolder => entry.kind === 'folder' && entry.id === id,
  );
}

const ids = (entries: readonly { id: string }[]): string[] =>
  entries.map((entry) => entry.id);

const identity = (key: string): string => key;

describe('sidebar permissions and filtering', () => {
  it('shows only unrestricted links before capabilities load', () => {
    const model = modelFor({ canViewHr: true }, false);
    expect(ids(model.primary)).toEqual(['dashboard', 'new-request', 'announcements', 'user-guide']);
    expect(ids(model.utility)).toEqual(['my-profile']);
  });

  it('shows My Profile to every signed-in user', () => {
    expect(ids(modelFor({}).utility)).toContain('my-profile');
    expect(ids(modelFor({ canViewHr: true }).utility)).toContain('my-profile');
  });

  it('marks only My Profile as the footer account card', () => {
    const accountIds = modelFor({ canViewHr: true, canViewAuditLogs: true })
      .utility.filter((entry) => entry.kind === 'link' && entry.accountCard)
      .map((entry) => entry.id);
    expect(accountIds).toEqual(['my-profile']);
  });

  it('keeps New Request as a direct link to the request picker', () => {
    const entry = modelFor({ canViewHr: true }).primary.find(
      (item) => item.id === 'new-request',
    );
    expect(entry?.kind).toBe('link');
    expect(entry?.kind === 'link' ? entry.href : null).toBe('/approvals/new');
  });

  it('gives an HR officer the inboxes, one folder per domain, and a system-only footer', () => {
    const model = modelFor({
      canViewHr: true,
      canManageUsers: true,
      canViewAuditLogs: true,
      canManageRoles: true,
    });
    expect(ids(model.primary)).toEqual([
      'dashboard',
      'new-request',
      'approvals',
      'announcements',
      'people',
      'time',
      'finance',
      'operations',
      'user-guide',
    ]);
    expect(ids(model.utility)).toEqual([
      'my-profile',
      'audit-logs',
      'settings',
    ]);
    expect(folder(model, 'people')?.groups.map((group) => group.id)).toEqual(
      expect.arrayContaining(['people-employees', 'people-performance', 'people-reports']),
    );
    expect(folder(model, 'time')?.groups.map((group) => group.id)).toEqual([
      'time-leave',
      'time-attendance',
      'time-schedules',
    ]);
    // Procurement group only appears when a procurement capability is granted.
    expect(folder(model, 'operations')?.groups.map((group) => group.id)).toEqual([
      'ops-fleet-assets',
      'ops-administration',
    ]);
  });

  it('keeps every rail panel short', () => {
    const model = modelFor({ ...pmModuleWithProjects(), canManageUsers: true, canAccessPayroll: true });
    for (const entry of model.primary) {
      // Exempt: Project Management hosts project nav; the User Guide is a
      // table of contents with one link per guide topic.
      if (entry.kind !== 'folder' || entry.id === 'pm' || entry.id === 'user-guide') {
        continue;
      }
      const count = entry.groups.reduce((sum, group) => sum + group.items.length, 0);
      expect(count, `${entry.id} has ${count} links`).toBeLessThanOrEqual(12);
    }
  });

  it('keeps the footer to account and system items', () => {
    const config = SIDEBAR_CONFIG.utility.map((entry) => entry.id);
    expect(config).toEqual(['my-profile', 'audit-logs', 'settings']);
  });

  it('lists every User Guide topic for HR, grouped, in the same tab', () => {
    const guide = folder(modelFor({ canViewHr: true }), 'user-guide');
    expect(guide?.groups.map((group) => group.id)).toEqual([
      'guide-basics',
      'guide-time',
      'guide-pay-travel',
      'guide-operations',
      'guide-people',
    ]);
    const links = guide?.groups.flatMap((group) => group.items) ?? [];
    expect(links).toHaveLength(HELP_MODULES.length);
    expect(links.every((link) => link.href === `/help/${link.id.replace(/^guide-/, '')}`)).toBe(true);
    expect(links.some((link) => link.openInNewTab)).toBe(false);
  });

  it('shows staff without hr.view only the guide topics written for them', () => {
    const guide = folder(modelFor({}), 'user-guide');
    const slugs = (guide?.groups.flatMap((group) => group.items) ?? []).map((link) =>
      link.id.replace(/^guide-/, ''),
    );
    const employeeSlugs = HELP_MODULES.filter((mod) => mod.roles.includes('EMPLOYEE')).map(
      (mod) => mod.slug,
    );
    expect([...slugs].sort()).toEqual([...employeeSlugs].sort());
    expect(slugs).not.toContain('payroll');
  });

  it('shows payroll under Pay & Travel when a payroll capability is granted', () => {
    const permissions = resolveSidebarPermissions({
      capabilities: capabilities({ canViewHr: true, canAccessPayroll: true }),
      ready: true,
      hasProjectAdministratorRole: false,
    });
    expect(permissions.has('payroll.access')).toBe(true);

    const finance = folder(modelFor({ canViewHr: true, canAccessPayroll: true }), 'finance');
    const payroll = finance?.groups.find((g) => g.id === 'finance-payroll');
    expect(payroll?.items.some((item) => item.id === 'payroll')).toBe(true);
  });

  it('limits staff without hr.view to Dashboard, New Request, the inboxes and My Profile', () => {
    const model = modelFor({
      canCreateLeave: true,
      canCreateOvertime: true,
      canCreateFlight: true,
      canViewAuditLogs: true,
      canManageRoles: true,
      canAccessPayroll: true,
      ...withProjects(),
    });
    // No Pay & Travel: they file and track expense claims and per diem via
    // New Request and Approvals.
    expect(ids(model.primary)).toEqual([
      'dashboard',
      'new-request',
      'approvals',
      'evaluation-inbox',
      'announcements',
      'user-guide',
    ]);
    expect(ids(model.utility)).toEqual(['my-profile']);
  });

  it('adds the team lists for supervisors (anyone with direct reports)', () => {
    const model = modelFor({
      hasDirectReports: true,
      canViewLeave: true,
      canCreateOvertime: true,
      canAccessPayroll: true,
    });
    const links = flattenSidebarModel(model).map((entry) => entry.link.id);
    expect(links).toEqual(
      expect.arrayContaining([
        'my-team',
        'employee-contract',
        'leave-requests',
        'overtime',
        'attendance',
        'field-movement-logs',
        'work-from-home',
        'site-assignments',
        'evaluations',
        'expense-claims',
        'per-diem',
        'flight-applications',
        'business-trips',
        'vehicle-applications',
        'exit-permit',
      ]),
    );
    // Team lists only - never HR admin pages, payroll or the full Users list.
    for (const hrOnly of [
      'users',
      'leave-policy',
      'attendance-identities',
      'payroll',
      'employee-per-diem-rates',
      'vehicle-refueling',
      'company-vehicles',
    ]) {
      expect(links).not.toContain(hrOnly);
    }
  });

  it('shows My Team only to supervisors without the full Users list', () => {
    const linkIds = (overrides: Partial<Capabilities>): string[] =>
      flattenSidebarModel(modelFor(overrides)).map((entry) => entry.link.id);
    expect(linkIds({})).not.toContain('my-team');
    expect(linkIds({ hasDirectReports: true })).toContain('my-team');
    const hrManager = linkIds({ canViewHr: true, canManageUsers: true, hasDirectReports: true });
    expect(hrManager).toContain('users');
    expect(hrManager).not.toContain('my-team');
  });

  it('grants the expense claim and per diem lists to HR, admins and supervisors only', () => {
    const permissions = (overrides: Partial<Capabilities>) =>
      resolveSidebarPermissions({
        capabilities: capabilities(overrides),
        ready: true,
        hasProjectAdministratorRole: false,
      });
    expect(permissions({}).has('expenseClaims.access')).toBe(false);
    expect(permissions({}).has('perDiem.access')).toBe(false);
    for (const caps of [
      { canViewHr: true },
      { isSystemAdministrator: true },
      { hasDirectReports: true },
    ]) {
      expect(permissions(caps).has('expenseClaims.access')).toBe(true);
      expect(permissions(caps).has('perDiem.access')).toBe(true);
    }
    expect(permissions({ hasDirectReports: true }).has('team.view')).toBe(true);
    expect(permissions({}).has('team.view')).toBe(false);
  });

  it('grants direct work-from-home assignment to HR only, not Discipline Leads', () => {
    const permissions = (overrides: Partial<Capabilities>) =>
      resolveSidebarPermissions({
        capabilities: capabilities(overrides),
        ready: true,
        hasProjectAdministratorRole: false,
      });
    expect(permissions({ canViewHr: true }).has('wfh.assign')).toBe(true);
    expect(
      permissions({
        epc: { ...EMPTY_CAPABILITIES.epc, navDisciplineLeader: true, navFullAccess: true },
      }).has('wfh.assign'),
    ).toBe(false);
  });

  it('gives everyone Announcements with the unread badge', () => {
    const entry = modelFor({}).primary.find((item) => item.id === 'announcements');
    expect(entry?.kind).toBe('link');
    expect(entry?.kind === 'link' ? entry.badge : null).toBe('unreadAnnouncements');
  });

  it('shows Manage announcements under Operations › Administration only with announcements.manage', () => {
    const manageIds = (model: SidebarModel): string[] =>
      flattenSidebarModel(model).map((entry) => entry.link.id).filter((id) => id === 'manage-announcements');
    expect(manageIds(modelFor({ canViewHr: true }))).toEqual([]);
    const model = modelFor({ canViewHr: true, canManageAnnouncements: true });
    const admin = folder(model, 'operations')?.groups.find((group) => group.id === 'ops-administration');
    expect(admin?.items.some((item) => item.id === 'manage-announcements')).toBe(true);
    expect(manageIds(model)).toEqual(['manage-announcements']);
  });

  it('hides Project Management when the company module toggle is off', () => {
    const model = modelFor({
      canViewHr: true,
      modulesProjectManagementEnabled: false,
      epc: { ...structuredClone(EMPTY_CAPABILITIES.epc), navFullAccess: true },
      ...withProjects(),
    });
    expect(folder(model, 'pm')).toBeUndefined();
    const results = searchSidebar(flattenSidebarModel(model), 'nav', identity);
    expect(results.some((result) => result.folderId === 'pm')).toBe(false);
    expect(results.some((result) => result.link.id === 'projects')).toBe(false);
  });

  it('shows Project Management when the module is enabled with project access', () => {
    const model = modelFor(pmModuleWithProjects());
    expect(ids(model.primary)).toContain('pm');
    expect(folder(model, 'pm')?.groups.some((group) =>
      group.items.some((item) => item.id === 'projects'),
    )).toBe(true);
  });

  it('removes a folder when none of its links are visible', () => {
    const model = modelFor({ canViewHr: true });
    expect(folder(model, 'pm')).toBeUndefined();
  });

  it('prepends project groups and collapses portfolio groups inside a project', () => {
    const permissions = resolveSidebarPermissions({
      capabilities: capabilities(pmModuleWithProjects()),
      ready: true,
      hasProjectAdministratorRole: false,
    });
    const model = buildSidebarModel(SIDEBAR_CONFIG, permissions, {
      header: { projectId: 'p1', name: 'Addis Tower', nameZh: null },
      groups: [
        {
          id: 'project-overview',
          labelKey: 'workspace.groups.overview',
          defaultCollapsed: false,
          items: [],
        },
      ],
    });
    const pm = folder(model, 'pm');
    expect(pm?.project?.name).toBe('Addis Tower');
    expect(pm?.groups[0]?.id).toBe('project-overview');
    expect(pm?.groups[1]?.defaultCollapsed).toBe(true);
  });
});

describe('active link resolution', () => {
  const links = flattenSidebarModel(
    modelFor({ canViewHr: true, canManageUsers: true }),
  );

  it('matches the dashboard only on the root route', () => {
    expect(resolveActiveLink('/', links)?.link.id).toBe('dashboard');
    expect(resolveActiveLink('/profile', links)?.link.id).toBe('my-profile');
    expect(resolveActiveLink('/notifications', links)).toBeNull();
  });

  it('prefers the longest prefix and honours activePaths', () => {
    expect(resolveActiveLink('/hr/leave-requests/42', links)?.link.id).toBe(
      'leave-requests',
    );
    expect(resolveActiveLink('/hr/leave-history/7', links)?.link.id).toBe(
      'leave-requests',
    );
    expect(resolveActiveLink('/hr/leave-history/me', links)?.link.id).toBe(
      'my-profile',
    );
    expect(resolveActiveLink('/hr/per-diem/9', links)?.folderId).toBe('finance');
    expect(resolveActiveLink('/hr/work-from-home', links)?.link.id).toBe(
      'work-from-home',
    );
    expect(resolveActiveLink('/organization/vehicles/3', links)?.folderId).toBe('operations');
    expect(resolveActiveLink('/seniority-levels', links)?.link.id).toBe('positions');
  });

  it('highlights New Request on the picker and every form, Approvals elsewhere', () => {
    expect(resolveActiveLink('/approvals/new', links)?.link.id).toBe('new-request');
    expect(resolveActiveLink('/approvals/new/vehicle-application', links)?.link.id).toBe(
      'new-request',
    );
    expect(resolveActiveLink('/approvals/42', links)?.link.id).toBe('approvals');
  });

  it('highlights the open User Guide topic, and Getting Started on /help', () => {
    expect(resolveActiveLink('/help', links)?.link.id).toBe('guide-getting-started');
    expect(resolveActiveLink('/help/leave', links)?.link.id).toBe('guide-leave');
    expect(resolveActiveLink('/help/leave', links)?.folderId).toBe('user-guide');
  });

  it("keeps employee announcements and What's new on the Announcements link", () => {
    expect(resolveActiveLink('/announcements/7', links)?.link.id).toBe('announcements');
    expect(resolveActiveLink('/whats-new', links)?.link.id).toBe('announcements');
  });
});

describe('module search', () => {
  const links = flattenSidebarModel(
    modelFor({ canViewHr: true, canManageUsers: true }),
  );

  it('matches keywords', () => {
    expect(
      searchSidebar(links, 'vacation', identity).map((entry) => entry.link.id),
    ).toEqual(['leave-requests']);
  });

  it('requires every term to match', () => {
    expect(
      searchSidebar(links, 'stamp project', identity).map(
        (entry) => entry.link.id,
      ),
    ).toEqual(['project-seal']);
  });

  it('returns nothing for a blank query', () => {
    expect(searchSidebar(links, '   ', identity)).toEqual([]);
  });

  it('finds Positions (home of Seniority levels) by seniority keywords', () => {
    expect(
      searchSidebar(links, 'junior', identity).map((entry) => entry.link.id),
    ).toEqual(['positions']);
  });
});

describe('icons', () => {
  it('gives every destination and folder its own icon', () => {
    // Two entries may share an icon only when they open the same page
    // (e.g. Evaluation Inbox at the rail and inside People › Performance).
    const iconToHrefs = new Map<string, Set<string>>();
    const record = (icon: string, target: string): void => {
      const set = iconToHrefs.get(icon) ?? new Set<string>();
      set.add(target);
      iconToHrefs.set(icon, set);
    };
    for (const entry of [...SIDEBAR_CONFIG.primary, ...SIDEBAR_CONFIG.utility]) {
      if (entry.kind === 'link') {
        record(entry.icon, entry.href ?? `coming-soon:${entry.id}`);
        continue;
      }
      record(entry.icon, `folder:${entry.id}`);
      for (const group of entry.groups) {
        for (const link of group.items) {
          record(link.icon, link.href ?? `coming-soon:${link.id}`);
        }
      }
    }
    const shared = [...iconToHrefs.entries()]
      .filter(([, targets]) => targets.size > 1)
      .map(([icon, targets]) => `${icon} → ${[...targets].join(', ')}`);
    expect(shared).toEqual([]);
  });
});
