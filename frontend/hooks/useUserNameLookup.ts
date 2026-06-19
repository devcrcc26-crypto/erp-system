'use client';

import { useMemo } from 'react';
import { useUsersDirectory } from '@/lib/query/users';
import { useAuthStore } from '@/stores/auth.store';

/** Resolves user IDs to display names from the company user directory. */
export function useUserNameLookup(): (userId: string) => string {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated());
  const usersQuery = useUsersDirectory(
    { page: 1, limit: 100 },
    { enabled: isAuthenticated },
  );
  const users = usersQuery.data?.data ?? [];

  return useMemo(() => {
    const map = new Map(
      users.map((user) => [user.id, `${user.firstName} ${user.lastName}`]),
    );
    return (userId: string) => map.get(userId) ?? userId;
  }, [users]);
}
