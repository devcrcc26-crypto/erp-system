'use client';

import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import AnnouncementsWidget from '../AnnouncementsWidget';
import AttendanceCard from './overview/AttendanceCard';
import LeaveSummaryCard from './overview/LeaveSummaryCard';
import OvertimeOpsCard from './overview/OvertimeOpsCard';
import PerDiemCard from './overview/PerDiemCard';
import SiteAssignmentsCard from './overview/SiteAssignmentsCard';
import { PER_DIEM_UI_ENABLED } from '@/lib/features/per-diem-ui';

/**
 * HR "Operations": announcements plus the operational cards. Contracts are
 * deliberately excluded — they live only on the Overview tab.
 */
export default function OperationsTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const canViewHr = useCanViewHr();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;
  const showSite = canViewHr || stats?.visibility.siteAssignments === true;

  return (
    <div className="flex flex-col gap-5">
      <AnnouncementsWidget enabled={enabled} />

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <AttendanceCard stats={stats} query={query} canImport={canViewHr} />
        </div>
        <OvertimeOpsCard stats={stats} query={query} />
        <LeaveSummaryCard stats={stats} query={query} />
        {showSite ? <SiteAssignmentsCard stats={stats} query={query} /> : null}
        {/* TODO: re-enable when per diem rates are seeded */}
        {PER_DIEM_UI_ENABLED ? <PerDiemCard stats={stats} query={query} /> : null}
      </div>
    </div>
  );
}
