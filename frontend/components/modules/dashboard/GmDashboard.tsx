'use client';

import { Segmented } from 'antd';
import HrDashboard from '@/components/modules/dashboard/HrDashboard';
import PmDashboard from '@/components/modules/dashboard/PmDashboard';
import { useSetHeaderExtra } from '@/hooks/use-set-header-extra';

export type GmDashboardTab = 'pm' | 'hr';

/**
 * Company-wide home for GM / MD / System Administrator — PM and HR overviews behind a toggle.
 * The "Dashboard" title comes from the sticky shell header (route-driven); the PM/HR
 * toggle is rendered in the main content action row.
 */
export default function GmDashboard({
  tab,
  onTabChange,
  enabled = true,
}: {
  tab: GmDashboardTab;
  onTabChange: (tab: GmDashboardTab) => void;
  enabled?: boolean;
}): React.ReactNode {
  useSetHeaderExtra(
    <Segmented
      value={tab}
      onChange={(value) => onTabChange(value as GmDashboardTab)}
      options={[
        { label: 'PM Overview', value: 'pm' },
        { label: 'HR Overview', value: 'hr' },
      ]}
    />,
  );

  return tab === 'pm' ? (
    <PmDashboard enabled={enabled} />
  ) : (
    <HrDashboard enabled={enabled} />
  );
}
