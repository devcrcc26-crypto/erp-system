'use client';

import { Spin } from 'antd';
import DashboardHome from '@/components/modules/dashboard/home/DashboardHome';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useCapabilitiesReady } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Company home dashboard - the personal widget home (v2). The previous
 * HR / personal dashboards live in `DashboardPageContentLegacy.tsx`; point
 * `app/(dashboard)/page.tsx` back at it to revert.
 */
export default function DashboardPageContent(): React.ReactNode {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const capabilitiesReady = useCapabilitiesReady();

  if (!capabilitiesReady) {
    return (
      <div className="erp-dashboard-v2 flex justify-center p-12">
        <Spin />
      </div>
    );
  }

  return <DashboardHome enabled={authHydrated && isAuthenticated} />;
}
