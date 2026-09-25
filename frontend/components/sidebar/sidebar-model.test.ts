import { describe, expect, it } from 'vitest';
import { EMPTY_CAPABILITIES, type Capabilities } from '@/lib/api/types';
import { SIDEBAR_CONFIG } from '@/components/sidebar/sidebar.config';
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

/** System Administrator with portfolio project access (sees Project Management). */
function systemAdminWithProjects(): Partial<Capabilities> {
  return {
    canViewHr: true,
    isSystemAdministrator: true,
    isSystemAdmin: true,
    ...withProjects(),
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
    expect(ids(model.primary)).toEqual(['dashboard', 'new-request']);
    expect(ids(model.utility)).toEqual(['my-profile']);
  });

  it('shows My Profile to every signed-in user', () => {
    expect(ids(modelFor({}).utility)).toContain('my-profile');
    expect(ids(modelFor({ canViewHr: true }).utility)).toContain('my-profile');
  });

  it('keeps New Request as a direct link to the request picker', () => {
    const entry = modelFor({ canViewHr: true }).primary.find(
      (item) => item.id === 'new-request',
    );
    expect(entry?.kind).toBe('link');
    expect(entry?.kind === 'link' ? entry.href : null).toBe('/approvals/new');
  });

  it('gives an HR officer the full sidebar with every HR group', () => {
    const model = modelFor({
      canViewHr: true,
      canManageUsers: true,
      canViewAuditLogs: true,
      canManageRoles: true,
    });
    expect(ids(model.primary)).toEqual(['dashboard', 'new-request', 'hr', 'organization']);
    expect(ids(model.utility)).toEqual([
      'approvals',
      'my-profile',
      'audit-logs',
      'settings',
    ]);
    expect(folder(model, 'hr')?.groups.map((group) => group.id)).toEqual([
      'hr-people',
      'hr-time-leave',
      'hr-travel-expenses',
      'hr-procurement',
      'hr-fleet-assets',
      'hr-administration',
    ]);
  });

  it('limits staff without hr.view to Dashboard, New Request and Approvals', () => {
    const model = modelFor({
      canCreateLeave: true,
      canCreateOvertime: true,
      canCreateFlight: true,
      canViewAuditLogs: true,
      canManageRoles: true,
      ...withProjects(),
    });
    expect(ids(model.primary)).toEqual(['dashboard', 'new-request']);
    expect(ids(model.utility)).toEqual(['approvals', 'my-profile']);
  });

  it('hides Project Management for non-admins, even with full project access', () => {
    const model = modelFor({
      canViewHr: true,
      epc: { ...structuredClone(EMPTY_CAPABILITIES.epc), navFullAccess: true },
      ...withProjects(),
    });
    expect(folder(model, 'pm')).toBeUndefined();
    const results = searchSidebar(flattenSidebarModel(model), 'nav', identity);
    expect(results.some((result) => result.folderId === 'pm')).toBe(false);
    expect(results.some((result) => result.link.id === 'projects')).toBe(false);
  });

  it('shows Project Management to System Administrator with project access', () => {
    const model = modelFor(systemAdminWithProjects());
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
      capabilities: capabilities(systemAdminWithProjects()),
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
    expect(resolveActiveLink('/hr/per-diem/9', links)?.folderId).toBe('hr');
  });

  it('highlights New Request on the picker and every form, Approvals elsewhere', () => {
    expect(resolveActiveLink('/approvals/new', links)?.link.id).toBe('new-request');
    expect(resolveActiveLink('/approvals/new/vehicle-application', links)?.link.id).toBe(
      'new-request',
    );
    expect(resolveActiveLink('/approvals/42', links)?.link.id).toBe('approvals');
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
});
