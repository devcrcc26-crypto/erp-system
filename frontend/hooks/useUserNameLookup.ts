'use client';

import { useMemo } from 'react';
import { useUsers } from '@/lib/query/users';

/** Resolves user IDs to display names from the users list. */
export function useUserNameLookup(): (userId: string) => string {
  const usersQuery = useUsers({ page: 1, limit: 100 });
  const users = usersQuery.data?.data ?? [];

  return useMemo(() => {
    const map = new Map(
      users.map((user) => [user.id, `${user.firstName} ${user.lastName}`]),
    );
    return (userId: string) => map.get(userId) ?? userId;
  }, [users]);
}
