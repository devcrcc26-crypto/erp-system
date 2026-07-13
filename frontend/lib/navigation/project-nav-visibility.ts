import type {
  ModuleCapabilities,
  PmCapabilities,
  PmModuleKey,
} from '@/lib/api/project-management.types';
import type { EpcCapabilities } from '@/lib/api/types';
import type { ProjectWorkspaceNavItem } from '@/lib/navigation/project-workspace-nav';

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
const DISCIPLINE_LEADER_PROJECT_KEYS = new Set([
  'disciplines',
  'my-work',
  'review-inbox',
  'my-comments',
]);

/** Reviewer / dept·inst chief (and multi-role union with designer). */
const REVIEWER_TIER_PROJECT_KEYS = new Set([
  'my-work',
  'review-inbox',
  'my-comments',
]);

const DESIGNER_PROJECT_KEYS = new Set(['my-work', 'my-comments']);

const SUPPORTING_DESIGNER_PROJECT_KEYS = new Set(['my-work']);

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

  if (!cap?.canView) {
    // Design-cycle My Work / My Comments when module schedule view is absent.
    if (
      (item.key === 'my-work' &&
        (ctx.epc.navDesigner ||
          ctx.epc.navSupportingDesigner ||
          ctx.epc.navReviewerTier ||
          ctx.epc.navDisciplineLeader ||
          ctx.epc.navDepartmentLeader ||
          ctx.epc.navFullAccess)) ||
      (item.key === 'my-comments' &&
        (ctx.epc.navDesigner ||
          ctx.epc.navReviewerTier ||
          ctx.epc.navDisciplineLeader ||
          ctx.epc.navDepartmentLeader ||
          ctx.epc.navFullAccess))
    ) {
      // fall through to epcCapability checks
    } else {
      return false;
    }
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
  '/disciplines',
  '/my-work',
  '/review-inbox',
  '/my-comments',
  '/kanban-board',
  '/reports',
]);

const GLOBAL_DISCIPLINE_LEADER = new Set([
  '/',
  '/my-work',
  '/review-inbox',
  '/my-comments',
]);

const GLOBAL_REVIEWER = new Set([
  '/',
  '/my-work',
  '/review-inbox',
  '/my-comments',
]);

const GLOBAL_DESIGNER = new Set(['/', '/my-work', '/my-comments']);

const GLOBAL_SUPPORTING = new Set(['/', '/my-work']);

/**
 * Extra gate for global icon-rail items after existing capability `visible` flags.
 * Returns false to hide; true to keep (or when no design persona applies).
 */
export function canViewGlobalNavKey(
  key: string,
  epc: EpcCapabilities,
): boolean {
  if (epc.navFullAccess) {
    return true;
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
