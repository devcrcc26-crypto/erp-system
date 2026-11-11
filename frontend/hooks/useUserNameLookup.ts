'use client';

import { useCallback, useMemo } from 'react';
import { useFullUsersDirectory } from '@/lib/query/users';
import {
  displayUserLabel,
  formatUserName,
  formatUserPickerLabel,
} from '@/lib/utils/user-display';
import type { User } from '@/lib/api/types';
import { useAuthStore } from '@/stores/auth.store';

function buildUserNameMap(users: User[]): Map<string, string> {
  return new Map(users.map((user) => [user.id, formatUserName(user)]));
}

/** Resolves user IDs to display names from the full company user directory. */
export function useUserNameLookup(): (userId: string) => string {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const usersQuery = useFullUsersDirectory({ enabled: isAuthenticated });
  const users = usersQuery.data ?? [];

  return useMemo(() => {
    const map = buildUserNameMap(users);
    return (userId: string) => displayUserLabel(userId, map.get(userId));
  }, [users]);
}

/**
 * Prefers API-provided display names, then directory lookup - never raw UUIDs.
 */
export function useUserDisplayResolver(): (
  userId: string | null | undefined,
  apiName?: string | null,
  emptyLabel?: string,
) => string {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const usersQuery = useFullUsersDirectory({ enabled: isAuthenticated });
  const users = usersQuery.data ?? [];

  return useCallback(
    (userId, apiName, emptyLabel = 'Unassigned') => {
      if (!userId) {
        return emptyLabel;
      }
      const map = buildUserNameMap(users);
      const directoryName = map.get(userId);
      if (directoryName) {
        return directoryName;
      }
      if (apiName?.trim()) {
        return apiName;
      }
      return displayUserLabel(userId, undefined, emptyLabel);
    },
    [users],
  );
}

/** Resolves user IDs to picker-style labels (name, roles, email). */
export function useUserPickerLabelLookup(): (userId: string) => string {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const usersQuery = useFullUsersDirectory({ enabled: isAuthenticated });
  const users = usersQuery.data ?? [];

  return useMemo(() => {
    const map = new Map(users.map((user) => [user.id, formatUserPickerLabel(user)]));
    return (userId: string) => displayUserLabel(userId, map.get(userId));
  }, [users]);
}
