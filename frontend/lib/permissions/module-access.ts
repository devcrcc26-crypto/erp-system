'use client';

import { useProjectTeam } from '@/lib/query/projects';
import { useAuthStore } from '@/stores/auth.store';
import { canAccessModule, type PmModuleKey } from './pm-modules.const';

/**
 * Checks whether the current user can see a given PM module in a project.
 */
export function useProjectModuleAccess(
  projectId: string,
  module: PmModuleKey,
): { canAccess: boolean; isLoading: boolean } {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const teamQuery = useProjectTeam(projectId, Boolean(projectId) && Boolean(currentUserId));

  if (teamQuery.isLoading) {
    return { canAccess: false, isLoading: true };
  }

  const myMembership = teamQuery.data?.find(
    (member) => member.userId === currentUserId,
  );

  if (!myMembership) {
    return { canAccess: false, isLoading: false };
  }

  return {
    canAccess: canAccessModule(myMembership.visibleModules, module),
    isLoading: false,
  };
}
