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

function modelFor(
  overrides: Partial<Capabilities>,
  ready = true,
): SidebarModel {
  const permissions = resolveSidebarPermissions({
    capabilities: capabilities(overrides),
    ready,
    hasProjectAdministratorRole: false,
  });
  return buildSidebarModel(SIDEBAR_CONFIG, permissions);
}

function folder(model: SidebarModel, id: string): SidebarFolder | undefined {
  return model.primary.find(
    (entry): entry is SidebarFolder => entry.kind === 'folder' && entry.id === id,
  );
}

const identity = (key: string): string => key;

describe('sidebar permissions and filtering', () => {
  it('shows only unrestricted links before capabilities load', () => {
    const model = modelFor({ canViewHr: true }, false);
    expect(model.primary.map((entry) => entry.id)).toEqual(['dashboard']);
    expect(model.utility).toEqual([]);
  });

  it('gives an HR officer every HR group', () => {
    const model = modelFor({ canViewHr: true, canManageUsers: true });
    const hr = folder(model, 'hr');
    expect(hr?.groups.map((group) => group.id)).toEqual([
      'hr-people',
      'hr-time-leave',
      'hr-travel-expenses',
      'hr-procurement',
      'hr-fleet-assets',
      'hr-administration',
    ]);
    expect(folder(model, 'organization')).toBeDefined();
  });

  it('limits an engineer to Time & Leave', () => {
    const model = modelFor({ canCreateLeave: true, canCreateOvertime: true });
    const hr = folder(model, 'hr');
    expect(hr?.groups.map((group) => group.id)).toEqual(['hr-time-leave']);
    expect(hr?.groups[0]?.items.map((item) => item.id)).toEqual([
      'leave-requests',
      'overtime',
    ]);
    expect(folder(model, 'organization')).toBeUndefined();
    expect(folder(model, 'pm')).toBeUndefined();
  });

  it('adds Travel & Expenses when the engineer can apply for flights', () => {
    const model = modelFor({ canCreateLeave: true, canCreateFlight: true });
    const travel = folder(model, 'hr')?.groups.find(
      (group) => group.id === 'hr-travel-expenses',
    );
    expect(travel?.items.map((item) => item.id)).toEqual([
      'expense-claims',
      'flight-applications',
    ]);
  });

  it('removes a folder when none of its links are visible', () => {
    const model = modelFor({});
    expect(folder(model, 'hr')).toBeUndefined();
    expect(model.utility.map((entry) => entry.id)).toEqual(['approvals']);
  });

  it('prepends project groups and collapses portfolio groups inside a project', () => {
    const permissions = resolveSidebarPermissions({
      capabilities: capabilities({
        pm: {
          ...structuredClone(EMPTY_CAPABILITIES.pm),
          projects: { ...EMPTY_CAPABILITIES.pm.projects, canView: true },
        },
      }),
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
    expect(resolveActiveLink('/profile', links)).toBeNull();
  });

  it('prefers the longest prefix and honours activePaths', () => {
    expect(resolveActiveLink('/hr/leave-requests/42', links)?.link.id).toBe(
      'leave-requests',
    );
    expect(resolveActiveLink('/hr/leave-history/7', links)?.link.id).toBe(
      'leave-requests',
    );
    expect(resolveActiveLink('/hr/per-diem/9', links)?.folderId).toBe('hr');
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
