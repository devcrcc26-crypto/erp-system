'use client';

import { Spin } from 'antd';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { canAccessRoute } from '@/lib/permissions/route-access';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Route-level permission gate for every dashboard page.
 *
 * The page is never rendered (so it never mounts or fetches) until session
 * capabilities are known and the route is allowed; a denied route redirects
 * to /unauthorized. This covers direct URL entry, breadcrumbs and any other
 * link. Section layouts (hr, settings, project workspace) and in-page checks
 * still apply on top of this, and the API authorises every request.
 */
export default function RouteAccessGate({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const capabilities = useAuthStore((state) => state.capabilities);
  const ready = useAuthStore((state) => state.capabilitiesReady);
  const allowed = canAccessRoute(pathname, { capabilities, ready });

  useEffect(() => {
    if (ready && !allowed) {
      router.replace('/unauthorized');
    }
  }, [ready, allowed, router]);

  if (!allowed) {
    return (
      <div
        className="flex min-h-[240px] items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <Spin />
      </div>
    );
  }

  return children;
}
