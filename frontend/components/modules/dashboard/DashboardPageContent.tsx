'use client';

import { useState } from 'react';
import { Spin } from 'antd';
import GmDashboard, {
  type GmDashboardTab,
} from '@/components/modules/dashboard/GmDashboard';
import HrDashboard from '@/components/modules/dashboard/HrDashboard';
import PersonalDashboard from '@/components/modules/dashboard/PersonalDashboard';
import PmDashboard from '@/components/modules/dashboard/PmDashboard';
import { useAuthHydrated } from '@/hooks/useAuthHydrated';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useCapabilitiesReady, usePmCapabilities } from '@/hooks/use-pm-capabilities';
import { layout } from '@/lib/theme/layout';
import { useAuthStore } from '@/stores/auth.store';

/**
 * Company home dashboard — routes to the GM, HR, PM, or personal view based on
 * session capabilities. Rewritten from scratch; no legacy dashboard state kept.
 */
export default function DashboardPageContent(): React.ReactNode {
  const authHydrated = useAuthHydrated();
  const isAuthenticated = useAuthStore((state) => Boolean(state.accessToken));
  const capabilitiesReady = useCapabilitiesReady();
  const canViewHr = useCanViewHr();
  const pm = usePmCapabilities();
  const [tab, setTab] = useState<GmDashboardTab>('pm');

  const canFetch = authHydrated && isAuthenticated;
  const canViewProjects = pm.projects.canView;

  if (!capabilitiesReady) {
    return (
      <div className={layout.loadingCard}>
        <Spin />
      </div>
    );
  }

  const isGmOrAbove = canViewProjects && canViewHr;
  const isHrOnly = canViewHr && !canViewProjects;
  const isPmOnly = canViewProjects && !canViewHr;

  if (isGmOrAbove) {
    return <GmDashboard tab={tab} onTabChange={setTab} enabled={canFetch} />;
  }

  if (isHrOnly) {
    return <HrDashboard enabled={canFetch} />;
  }

  if (isPmOnly) {
    return <PmDashboard enabled={canFetch} />;
  }

  return <PersonalDashboard enabled={canFetch} />;
}
