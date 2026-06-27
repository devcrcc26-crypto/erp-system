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

/**
 * Whether a project workspace nav item should appear for the current session.
 */
export function canViewProjectNavItem(
  item: ProjectWorkspaceNavItem,
  ctx: ProjectNavVisibilityContext,
): boolean {
  const cap: ModuleCapabilities | undefined = ctx.pm[item.capability as PmModuleKey];
  if (!cap?.canView) {
    return false;
  }

  if (item.epcSurface === 'engineering' && !ctx.epc.canViewEngineering) {
    return false;
  }

  if (item.epcCapability === 'reviewInbox' && !ctx.epc.canViewReviewInbox) {
    return false;
  }

  if (item.epcCapability === 'myComments' && !ctx.epc.canViewMyComments) {
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
