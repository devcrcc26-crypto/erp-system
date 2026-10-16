'use client';

import { useProject } from '@/lib/query/projects';
import { useAuthStore } from '@/stores/auth.store';
import type { PmModuleKey } from './pm-modules.const';

/**
 * Whether the current user can open a PM module page on a project.
 *
 * Access is based on project readability (full / Project Admin / department
 * leadership / discipline assignee / subtask role) - never ProjectTeam
 * membership or visibleModules.
 */
export function useProjectModuleAccess(
  projectId: string,
  _module: PmModuleKey,
): { canAccess: boolean; isLoading: boolean } {
  const isSystemAdministrator = useAuthStore(
    (state) => state.capabilities.isSystemAdministrator,
  );
  const capabilitiesReady = useAuthStore((state) => state.capabilitiesReady);
  const navFullAccess = useAuthStore(
    (state) => state.capabilities.epc.navFullAccess,
  );
  const projectQuery = useProject(
    projectId,
    Boolean(projectId) && capabilitiesReady && !isSystemAdministrator && !navFullAccess,
  );

  if (!capabilitiesReady) {
    return { canAccess: false, isLoading: true };
  }

  if (isSystemAdministrator || navFullAccess) {
    return { canAccess: true, isLoading: false };
  }

  if (projectQuery.isLoading) {
    return { canAccess: false, isLoading: true };
  }

  return {
    canAccess: projectQuery.isSuccess && Boolean(projectQuery.data),
    isLoading: false,
  };
}
