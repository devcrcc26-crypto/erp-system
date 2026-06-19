'use client';

import { useAuthStore } from '@/stores/auth.store';
import type { ModuleCapabilities } from '@/lib/api/project-management.types';
import type { EpcCapabilities } from '@/lib/api/types';
import { EMPTY_EPC_CAPABILITIES } from '@/lib/api/types';
import type { ProjectNavCapability } from '@/lib/navigation/project-workspace-nav';

/**
 * Returns PM module capabilities from the authenticated session.
 */
export function usePmCapabilities(): ReturnType<
  typeof useAuthStore.getState
>['capabilities']['pm'] {
  return useAuthStore((state) => state.capabilities.pm);
}

/**
 * Returns EPC workspace capability flags from endpoint probes.
 */
export function useEpcCapabilities(): EpcCapabilities {
  return useAuthStore(
    (state) => state.capabilities.epc ?? EMPTY_EPC_CAPABILITIES,
  );
}

/**
 * True after session capabilities have been loaded from the API.
 */
export function useCapabilitiesReady(): boolean {
  return useAuthStore((state) => state.capabilitiesReady);
}

/**
 * Checks whether the user can view a project workspace nav item (PM module only).
 */
export function useCanViewProjectNav(
  capability: ProjectNavCapability,
): boolean {
  const pm = usePmCapabilities();
  const moduleCaps: ModuleCapabilities = pm[capability];
  return moduleCaps.canView;
}

/**
 * Review inbox — requires inbox probe and schedule module access.
 */
export function useCanViewReviewInbox(): boolean {
  return useEpcCapabilities().canViewReviewInbox;
}

/**
 * Designer comment queue — requires my-comments probe.
 */
export function useCanViewMyComments(): boolean {
  return useEpcCapabilities().canViewMyComments;
}

/**
 * Any EPC global workspace nav entry.
 */
export function useCanViewEpcWorkspaces(): boolean {
  return (
    useCanViewReviewInbox() ||
    useCanViewMyComments() ||
    useEpcCapabilities().canViewEngineering
  );
}

/**
 * Schedule-scoped EPC engineering pages (disciplines, status board, workload).
 */
export function useCanViewEpcEngineering(): boolean {
  const pm = usePmCapabilities();
  const epc = useEpcCapabilities();
  return pm.schedule.canView && epc.canViewEngineering;
}
