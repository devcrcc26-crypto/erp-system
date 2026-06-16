'use client';

import { useMemo } from 'react';
import { useUsers } from '@/lib/query/users';
import { useAuthStore } from '@/stores/auth.store';

/** Resolves user IDs to display names from the users list. */
export function useUserNameLookup(): (userId: string) => string {
  const canManageUsers = useAuthStore(
    (state) => state.capabilities.canManageUsers,
  );
  const usersQuery = useUsers(
    { page: 1, limit: 100 },
    { enabled: canManageUsers },
  );
  const users = usersQuery.data?.data ?? [];

  return useMemo(() => {
    const map = new Map(
      users.map((user) => [user.id, `${user.firstName} ${user.lastName}`]),
    );
    return (userId: string) => map.get(userId) ?? userId;
  }, [users]);
}
