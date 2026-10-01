'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import {
  SIDEBAR_MAX_FAVORITES,
  SIDEBAR_STORAGE_KEYS,
  type SidebarBadgeSource,
  type SidebarPermission,
} from '@/components/sidebar/sidebar.config';
import { resolveSidebarPermissions } from '@/components/sidebar/sidebar-permissions';
import {
  buildProjectContextGroups,
  type SidebarProjectContext,
} from '@/components/sidebar/sidebar-model';
import { useOptionalRoleLens } from '@/components/modules/projects/workspaces/RoleLensProvider';
import { PROJECT_ADMINISTRATOR_ROLE } from '@/lib/constants/org-roles';
import { PROJECT_WORKSPACE_NAV } from '@/lib/navigation/project-workspace-nav';
import {
  canViewProjectNavItem,
  isProjectNavReady,
} from '@/lib/navigation/project-nav-visibility';
import { usePendingMyActionCount } from '@/lib/query/approvals';
import { usePendingMyAction } from '@/lib/query/evaluation';
import { useProjectDisciplines } from '@/lib/query/disciplines';
import { useCurrentUser } from '@/lib/query/profile';
import { useAuthStore } from '@/stores/auth.store';

export type SidebarMode = 'expanded' | 'compact';

/** Permission tokens for the signed-in session (empty until loaded). */
export function useSidebarPermissions(): {
  permissions: ReadonlySet<SidebarPermission>;
  ready: boolean;
} {
  const capabilities = useAuthStore((state) => state.capabilities);
  const ready = useAuthStore((state) => state.capabilitiesReady);
  const profile = useCurrentUser();
  const roles = profile.data?.roles;

  const permissions = useMemo(
    () =>
      resolveSidebarPermissions({
        capabilities,
        ready,
        hasProjectAdministratorRole: (roles ?? []).some(
          (role) => role.name === PROJECT_ADMINISTRATOR_ROLE,
        ),
      }),
    [capabilities, ready, roles],
  );

  return { permissions, ready };
}

/** Live badge counts keyed by `SidebarBadgeSource`. */
export function useSidebarBadgeCounts(): Partial<Record<SidebarBadgeSource, number>> {
  const userId = useAuthStore((state) => state.user?.id ?? '');
  const ready = useAuthStore((state) => state.capabilitiesReady);
  const pending = usePendingMyActionCount(userId, ready && Boolean(userId));
  const pendingApprovals = pending.data ?? 0;
  const pendingEvaluations = usePendingMyAction({
    enabled: ready && Boolean(userId),
  });
  const pendingEvaluationActions = pendingEvaluations.data?.length ?? 0;

  return useMemo(
    () => ({
      pendingApprovals,
      pendingEvaluationActions,
    }),
    [pendingApprovals, pendingEvaluationActions],
  );
}

export interface SidebarProjectInput {
  readonly id: string;
  readonly name: string;
  readonly nameZh: string | null;
}

/**
 * Project workspace groups for the Project Management folder, filtered with
 * the same rules the old project sidebar used. `loading` stays true until
 * discipline scope is known so items do not flash in and out.
 */
export function useSidebarProjectContext(project: SidebarProjectInput | null): {
  context: SidebarProjectContext | null;
  loading: boolean;
} {
  const capabilities = useAuthStore((state) => state.capabilities);
  const ready = useAuthStore((state) => state.capabilitiesReady);
  const accessToken = useAuthStore((state) => state.accessToken);
  const lens = useOptionalRoleLens();
  const disciplineScopeBypass =
    lens?.disciplineScopeBypass ?? capabilities.epc.disciplineScopeBypass;
  const projectId = project?.id ?? '';

  const disciplinesQuery = useProjectDisciplines(
    projectId,
    Boolean(projectId) && ready && Boolean(accessToken) && !disciplineScopeBypass,
  );
  const hasAssignedDisciplines = (disciplinesQuery.data?.length ?? 0) > 0;
  const navReady = isProjectNavReady(
    ready,
    disciplineScopeBypass,
    disciplinesQuery.isLoading,
  );

  const context = useMemo((): SidebarProjectContext | null => {
    if (!project || !navReady) {
      return null;
    }
    const navContext = {
      pm: capabilities.pm,
      epc: capabilities.epc,
      hasAssignedDisciplines,
      disciplineScopeBypass,
    };
    const visibleGroups = PROJECT_WORKSPACE_NAV.map((group) => ({
      ...group,
      items: group.items.filter((item) => canViewProjectNavItem(item, navContext)),
    }));
    return {
      header: { projectId: project.id, name: project.name, nameZh: project.nameZh },
      groups: buildProjectContextGroups(project.id, visibleGroups),
    };
  }, [
    project,
    navReady,
    capabilities.pm,
    capabilities.epc,
    hasAssignedDisciplines,
    disciplineScopeBypass,
  ]);

  return { context, loading: Boolean(project) && !navReady };
}

// ── Preference storage ──────────────────────────────────────────────────
// localStorage is the source of truth, read through useSyncExternalStore so
// there is no hydration effect and other tabs stay in sync. When storage is
// unavailable (private mode, quota) values live in memory for the session.

const STORAGE_EVENT = 'sidebar:storage';
const memoryStore = new Map<string, string>();

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memoryStore.get(key) ?? null;
  } catch {
    return memoryStore.get(key) ?? null;
  }
}

function writeStored(key: string, value: string): void {
  memoryStore.set(key, value);
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the in-memory copy still drives the UI */
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}

function subscribeToStorage(onChange: () => void): () => void {
  window.addEventListener('storage', onChange);
  window.addEventListener(STORAGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(STORAGE_EVENT, onChange);
  };
}

/** Raw stored string for `key` (null on the server and when unset). */
function useStoredString(key: string | null): string | null {
  return useSyncExternalStore(
    subscribeToStorage,
    () => (key ? readStored(key) : null),
    () => null,
  );
}

function parseStringArray(raw: string | null): string[] {
  if (!raw) {
    return [];
  }
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseBooleanRecord(raw: string | null): Record<string, boolean> {
  if (!raw) {
    return {};
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) {
      return {};
    }
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
      ),
    );
  } catch {
    return {};
  }
}

export interface SidebarPreferences {
  readonly mode: SidebarMode;
  readonly setMode: (mode: SidebarMode) => void;
  /** Explicit per-group state; absent ids fall back to the group default. */
  readonly collapsedGroups: Readonly<Record<string, boolean>>;
  readonly setGroupCollapsed: (groupId: string, collapsed: boolean) => void;
  readonly favoriteIds: readonly string[];
  readonly toggleFavorite: (linkId: string) => void;
}

/**
 * Persisted sidebar preferences. Labels are visible by default: compact mode
 * is opt-in. Mode and favorites are stored per user.
 */
export function useSidebarPreferences(): SidebarPreferences {
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const favoritesKey = userId
    ? `${SIDEBAR_STORAGE_KEYS.favoritesPrefix}${userId}`
    : null;

  const modeKey = userId ? `${SIDEBAR_STORAGE_KEYS.modePrefix}${userId}` : null;
  const rawUserMode = useStoredString(modeKey);
  const rawLegacyMode = useStoredString(SIDEBAR_STORAGE_KEYS.mode);
  const rawMode = rawUserMode ?? rawLegacyMode;
  const rawCollapsed = useStoredString(SIDEBAR_STORAGE_KEYS.collapsedGroups);
  const rawFavorites = useStoredString(favoritesKey);

  const mode: SidebarMode = rawMode === 'compact' ? 'compact' : 'expanded';
  const collapsedGroups = useMemo(() => parseBooleanRecord(rawCollapsed), [rawCollapsed]);
  const favoriteIds = useMemo(
    () => parseStringArray(rawFavorites).slice(0, SIDEBAR_MAX_FAVORITES),
    [rawFavorites],
  );

  const setMode = useCallback(
    (next: SidebarMode): void => {
      writeStored(modeKey ?? SIDEBAR_STORAGE_KEYS.mode, next);
    },
    [modeKey],
  );

  const setGroupCollapsed = useCallback((groupId: string, collapsed: boolean): void => {
    const current = parseBooleanRecord(readStored(SIDEBAR_STORAGE_KEYS.collapsedGroups));
    if (current[groupId] === collapsed) {
      return;
    }
    writeStored(
      SIDEBAR_STORAGE_KEYS.collapsedGroups,
      JSON.stringify({ ...current, [groupId]: collapsed }),
    );
  }, []);

  const toggleFavorite = useCallback(
    (linkId: string): void => {
      if (!favoritesKey) {
        return;
      }
      const current = parseStringArray(readStored(favoritesKey));
      let next: string[];
      if (current.includes(linkId)) {
        next = current.filter((id) => id !== linkId);
      } else if (current.length >= SIDEBAR_MAX_FAVORITES) {
        return;
      } else {
        next = [...current, linkId];
      }
      writeStored(favoritesKey, JSON.stringify(next));
    },
    [favoritesKey],
  );

  return {
    mode,
    setMode,
    collapsedGroups,
    setGroupCollapsed,
    favoriteIds,
    toggleFavorite,
  };
}
