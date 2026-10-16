'use client';

import { Spin } from 'antd';
import HrDashboard from '@/components/modules/dashboard/HrDashboard';
import PersonalDashboard from '@/components/modules/dashboard/PersonalDashboard';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useCapabilitiesReady } from '@/hooks/use-pm-capabilities';
import { useAuthStore } from '@/stores/auth.store';

/**
 * LEGACY - unused. Kept so the v2 home (DashboardPageContent) is easy to revert.
 * Company home dashboard. The PM overview is hidden: HR users see the
 * company HR overview; everyone else sees their own HR stats (leave,
 * overtime, holidays). Restore GmDashboard / PmDashboard to bring PM back.
 */
export default function DashboardPageContentLegacy(): React.ReactNode {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const capabilitiesReady = useCapabilitiesReady();
  const canViewHr = useCanViewHr();

  const canFetch = authHydrated && isAuthenticated;

  if (!capabilitiesReady) {
    return (
      <div className="erp-pro-list-page erp-users-page erp-dashboard-page">
        <div className="flex justify-center rounded-xl border border-[#e8ebef] bg-white p-12">
          <Spin />
        </div>
      </div>
    );
  }

  if (canViewHr) {
    return <HrDashboard enabled={canFetch} />;
  }

  return <PersonalDashboard enabled={canFetch} />;
}
