import type {
  ModuleCapabilities,
  PmCapabilities,
  PmModuleKey,
} from '@/lib/api/project-management.types';
import type { EpcCapabilities } from '@/lib/api/types';
import { extractProjectId } from '@/config/navConfig';
import type { ProjectWorkspaceNavItem } from '@/lib/navigation/project-workspace-nav';

/** Global icon-rail only - never shown in the project context sidebar. */
export const GLOBAL_ONLY_PROJECT_NAV_KEYS = new Set([
  'my-work',
  'review-inbox',
  'my-comments',
]);

export interface ProjectNavVisibilityContext {
  pm: PmCapabilities;
  epc: EpcCapabilities;
  hasAssignedDisciplines: boolean;
  disciplineScopeBypass: boolean;
}

/**
 * True when permission flags and discipline assignment scope are both resolved.
 */
export function isProjectNavReady(
  permissionsReady: boolean,
  disciplineScopeBypass: boolean,
  disciplinesLoading: boolean,
): boolean {
  return permissionsReady && (disciplineScopeBypass || !disciplinesLoading);
}

/** Project nav keys for discipline leaders (union can widen). */
const DISCIPLINE_LEADER_PROJECT_KEYS = new Set(['disciplines', 'submittals']);

/** Reviewer / dept·inst chief (and multi-role union with designer). */
const REVIEWER_TIER_PROJECT_KEYS = new Set<string>();

const DESIGNER_PROJECT_KEYS = new Set(['submittals']);

const SUPPORTING_DESIGNER_PROJECT_KEYS = new Set<string>();

/**
 * Narrow design-cycle assignees (FK probes) - global workspaces only.
 * Excludes navFullAccess / navDepartmentLeader (those keep the project sidebar).
 */
function isFkDesignCycleAssignee(epc: EpcCapabilities): boolean {
  return (
    epc.navDisciplineLeader ||
    epc.navReviewerTier ||
    epc.navDesigner ||
    epc.navSupportingDesigner
  );
}

/**
 * True when the user may see the project context (second) sidebar.
 * Full-access / department leaders always. Other roles need projects.canView.
 * FK design-cycle assignees never - Employee portfolio projects.canView
 * must not open this sidebar (Wei Chen / Khalid demo case).
 */
export function hasProjectSidebarAccess(
  epc: EpcCapabilities,
  pm: PmCapabilities,
): boolean {
  if (epc.navFullAccess || epc.navDepartmentLeader) {
    return true;
  }
  if (isFkDesignCycleAssignee(epc)) {
    return false;
  }
  return pm.projects.canView;
}

/**
 * Whether the project context sidebar should render for this route and session.
 */
export function canShowProjectContextSidebar(
  pathname: string,
  epc: EpcCapabilities,
  pm: PmCapabilities,
): boolean {
  return (
    extractProjectId(pathname) !== null &&
    hasProjectSidebarAccess(epc, pm)
  );
}

/**
 * Whether EPC nav probes indicate a narrowed design-cycle persona.
 * When none match, visibility falls back to PM/EPC module flags only
 * (e.g. Site Coordinator outside the design cycle).
 */
export function hasDesignCycleNavPersona(epc: EpcCapabilities): boolean {
  return (
    epc.navFullAccess ||
    epc.navDepartmentLeader ||
    epc.navDisciplineLeader ||
    epc.navReviewerTier ||
    epc.navDesigner ||
    epc.navSupportingDesigner
  );
}

/**
 * Union allowlist of project workspace nav keys for the session's design personas.
 * Returns null when no design-cycle persona applies (do not intersect).
 */
export function resolveProjectNavKeyAllowlist(
  epc: EpcCapabilities,
): ReadonlySet<string> | null {
  if (epc.navFullAccess || epc.navDepartmentLeader) {
    return null; // all PM/EPC-passing items
  }

  if (!hasDesignCycleNavPersona(epc)) {
    return null;
  }

  const keys = new Set<string>();

  if (epc.navDisciplineLeader) {
    for (const key of DISCIPLINE_LEADER_PROJECT_KEYS) {
      keys.add(key);
    }
  }
  if (epc.navReviewerTier) {
    for (const key of REVIEWER_TIER_PROJECT_KEYS) {
      keys.add(key);
    }
  }
  if (epc.navDesigner) {
    for (const key of DESIGNER_PROJECT_KEYS) {
      keys.add(key);
    }
  }
  if (epc.navSupportingDesigner) {
    for (const key of SUPPORTING_DESIGNER_PROJECT_KEYS) {
      keys.add(key);
    }
  }

  return keys;
}

/**
 * Whether a project workspace nav item should appear for the current session.
 */
export function canViewProjectNavItem(
  item: ProjectWorkspaceNavItem,
  ctx: ProjectNavVisibilityContext,
): boolean {
  if (GLOBAL_ONLY_PROJECT_NAV_KEYS.has(item.key)) {
    return false;
  }

  const allowlist = resolveProjectNavKeyAllowlist(ctx.epc);
  if (allowlist !== null && !allowlist.has(item.key)) {
    return false;
  }

  const cap: ModuleCapabilities | undefined = ctx.pm[item.capability as PmModuleKey];

  if (item.epcCapability === 'reviewInbox') {
    if (!ctx.epc.canViewReviewInbox) {
      return false;
    }
    // Assignment-backed reviewer personas may lack schedule.canEdit; still show entry.
    if (
      ctx.epc.navFullAccess ||
      ctx.epc.navDepartmentLeader ||
      ctx.epc.navDisciplineLeader ||
      ctx.epc.navReviewerTier
    ) {
      return true;
    }
    return Boolean(cap?.canView || cap?.canEdit);
  }

  if (item.key === 'submittals' || item.key === 'change-requests') {
    if (
      !ctx.epc.navFullAccess &&
      (ctx.epc.navDisciplineLeader || ctx.epc.navDesigner)
    ) {
      return item.key === 'submittals';
    }
  }

  if (!cap?.canView) {
    return false;
  }

  if (item.epcSurface === 'engineering' && !ctx.epc.canViewEngineering) {
    return false;
  }

  if (item.epcCapability === 'myComments' && !ctx.epc.canViewMyComments) {
    return false;
  }

  if (item.epcCapability === 'myWork' && !ctx.epc.canViewMyWork) {
    return false;
  }

  if (
    item.requiresDisciplineAssignment &&
    !ctx.disciplineScopeBypass &&
    !ctx.hasAssignedDisciplines
  ) {
    return false;
  }

  return true;
}

/** Global icon-rail keys gated by design-cycle persona (href/key in navConfig). */
const GLOBAL_ALWAYS = new Set(['/']);

const GLOBAL_DEPT_LEADER = new Set([
  '/',
  '/projects',
  '/departments',
  '/positions',
  '/seniority-levels',
  '/disciplines',
  '/my-work',
  '/review-inbox',
  '/my-comments',
  '/submittals',
  '/change-requests',
  '/rfis',
  '/kanban-board',
  '/reports',
]);

const GLOBAL_DISCIPLINE_LEADER = new Set([
  '/',
  '/my-work',
  '/review-inbox',
  '/my-comments',
  '/submittals',
  '/change-requests',
  '/rfis',
]);

const GLOBAL_REVIEWER = new Set([
  '/',
  '/my-work',
  '/review-inbox',
  '/my-comments',
]);

const GLOBAL_DESIGNER = new Set([
  '/',
  '/my-work',
  '/my-comments',
  '/submittals',
  '/change-requests',
  '/rfis',
]);

const GLOBAL_SUPPORTING = new Set(['/', '/my-work']);

/**
 * Extra gate for global icon-rail items after existing capability `visible` flags.
 * Returns false to hide; true to keep (or when no design persona applies).
 */
export function canViewGlobalNavKey(
  key: string,
  epc: EpcCapabilities,
  pm?: Partial<
    Pick<
      PmCapabilities,
      | 'submittals'
      | 'change_requests'
      | 'rfis'
      | 'issues'
      | 'meetings'
      | 'dailyLogs'
      | 'projects'
      | 'risks'
      | 'punchItems'
    >
  > | null,
): boolean {
  // Risks intentionally deviates from the "full access always sees every
  // global icon" rule below: full-access users always have the project
  // sidebar, so the global Risks icon is reserved for discipline leads and
  // risks.canView-only roles that lack project-sidebar access.
  if (key === '/risks') {
    if (epc.navDisciplineLeader) {
      return true;
    }
    if (epc.navFullAccess) {
      return false;
    }
    return pm?.risks?.canView ?? false;
  }

  if (key === '/punch-list') {
    if (epc.navDisciplineLeader) {
      return true;
    }
    if (epc.navFullAccess) {
      return false;
    }
    return pm?.punchItems?.canView ?? false;
  }

  if (key === '/correspondence') {
    return epc.navFullAccess;
  }

  if (key === '/approvals') {
    return true;
  }

  if (key.startsWith('/hr/')) {
    return true;
  }

  if (key.startsWith('/organization/')) {
    return true;
  }

  if (epc.navFullAccess) {
    return true;
  }

  if (key === '/issues') {
    const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
    if (isFkUser) {
      return true;
    }
    return pm?.issues?.canView ?? false;
  }

  if (key === '/rfis') {
    const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
    if (isFkUser) {
      return true;
    }
    return pm?.rfis?.canView ?? false;
  }

  if (key === '/daily-logs') {
    const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
    if (isFkUser) {
      return true;
    }
    return pm?.dailyLogs?.canView ?? false;
  }

  if (key === '/meetings') {
    const isFkUser = epc.navDesigner || epc.navDisciplineLeader;
    if (isFkUser) {
      return true;
    }
    return pm?.meetings?.canView ?? false;
  }

  // Submittals never use the "no design persona → allow all" shortcut.
  if (key === '/submittals') {
    return (
      epc.navDesigner ||
      epc.navDisciplineLeader ||
      (pm?.submittals?.canView ?? false)
    );
  }

  if (key === '/external-releases') {
    return (
      epc.navDesigner ||
      epc.navDisciplineLeader ||
      (pm?.submittals?.canView ?? false)
    );
  }

  if (key === '/change-requests') {
    return (
      epc.navDesigner ||
      epc.navDisciplineLeader ||
      (pm?.change_requests?.canView ?? false)
    );
  }

  if (!hasDesignCycleNavPersona(epc)) {
    return true;
  }

  const keys = new Set<string>(GLOBAL_ALWAYS);

  if (epc.navDepartmentLeader) {
    for (const k of GLOBAL_DEPT_LEADER) {
      keys.add(k);
    }
  }
  if (epc.navDisciplineLeader) {
    for (const k of GLOBAL_DISCIPLINE_LEADER) {
      keys.add(k);
    }
  }
  if (epc.navReviewerTier) {
    for (const k of GLOBAL_REVIEWER) {
      keys.add(k);
    }
  }
  if (epc.navDesigner) {
    for (const k of GLOBAL_DESIGNER) {
      keys.add(k);
    }
  }
  if (epc.navSupportingDesigner) {
    for (const k of GLOBAL_SUPPORTING) {
      keys.add(k);
    }
  }

  return keys.has(key);
}
