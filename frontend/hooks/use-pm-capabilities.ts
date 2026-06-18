'use client';

import { useAuthStore } from '@/stores/auth.store';
import type { ModuleCapabilities } from '@/lib/api/project-management.types';
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
 * Checks whether the user can view a project workspace nav item.
 */
export function useCanViewProjectNav(
  capability: ProjectNavCapability,
): boolean {
  const pm = usePmCapabilities();
  const moduleCaps: ModuleCapabilities = pm[capability];
  return moduleCaps.canView;
}

/**
 * EPC global workspace entries use schedule module view access in v1.
 */
export function useCanViewEpcWorkspaces(): boolean {
  return useCanViewProjectNav('schedule');
}
