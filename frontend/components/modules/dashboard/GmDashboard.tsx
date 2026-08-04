'use client';

import { Segmented } from 'antd';
import HrDashboard from '@/components/modules/dashboard/HrDashboard';
import PmDashboard from '@/components/modules/dashboard/PmDashboard';

export type GmDashboardTab = 'pm' | 'hr';

/**
 * Company-wide home for GM / MD / System Administrator — PM and HR overviews behind a toggle.
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
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-text-primary)] m-0">
            Dashboard
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-0.5 m-0">
            Company-wide overview
          </p>
        </div>
        <Segmented
          value={tab}
          onChange={(value) => onTabChange(value as GmDashboardTab)}
          options={[
            { label: 'PM Overview', value: 'pm' },
            { label: 'HR Overview', value: 'hr' },
          ]}
        />
      </div>

      {tab === 'pm' ? (
        <PmDashboard enabled={enabled} />
      ) : (
        <HrDashboard enabled={enabled} />
      )}
    </div>
  );
}
