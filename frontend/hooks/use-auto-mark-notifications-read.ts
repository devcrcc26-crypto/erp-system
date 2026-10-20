'use client';

import { useEffect, useMemo } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useMarkNotificationsReadForRoute } from '@/lib/query/notifications';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Marks in-app notifications as read when the user navigates to the linked page
 * without clicking the notification row.
 */
export function useAutoMarkNotificationsRead(): void {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const allowed = useAuthStore((state) => state.isAuthenticated());
  const { mutate: markReadForRoute } = useMarkNotificationsReadForRoute();

  const routePath = useMemo(() => {
    const query = searchParams.toString();
    return query ? `${pathname}?${query}` : pathname;
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!allowed || !routePath.startsWith('/')) {
      return;
    }
    markReadForRoute(routePath);
  }, [allowed, markReadForRoute, routePath]);
}
