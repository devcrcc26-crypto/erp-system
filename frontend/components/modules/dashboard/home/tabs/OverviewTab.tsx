'use client';

import { CalendarDays, Inbox, UserPlus, Users } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import { formatCount } from '../format';
import AttendanceCard from './overview/AttendanceCard';
import ContractsExpiringCard from './overview/ContractsExpiringCard';
import LeaveSummaryCard from './overview/LeaveSummaryCard';
import OverviewStatCard from './overview/OverviewStatCard';
import SiteAssignmentsCard from './overview/SiteAssignmentsCard';
import { MetricStrip } from './TabParts';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

/**
 * HR "Overview": a four-up metric strip, then a two-column CSS grid of
 * equal-height widgets (contracts / attendance, leave / sites). Each widget
 * owns its own loading, error and zero states so one failure stays local.
 */
export default function OverviewTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const canViewHr = useCanViewHr();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;

  const headcount = stats?.headcount ?? null;
  const newHires = headcount?.newThisMonth ?? 0;
  const onLeave = headcount?.onLeaveToday ?? 0;
  const pendingCompanyWide = stats?.pendingApprovalsCompanyWide ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <MetricStrip query={query} label={t(`${STATS}.headcount.title`)}>
        <OverviewStatCard
          index={0}
          icon={Users}
          tone="info"
          valueTone="neutral"
          label={t(`${STATS}.headcount.total`)}
          value={formatCount(headcount?.total ?? 0, locale)}
          badge={t(`${HOME}.overview.headcountHint`)}
          href="/users"
        />
        <OverviewStatCard
          index={1}
          icon={CalendarDays}
          tone={onLeave > 0 ? 'warn' : 'neutral'}
          valueTone="neutral"
          label={t(`${STATS}.headcount.onLeaveToday`)}
          value={formatCount(onLeave, locale)}
          badge={t(`${HOME}.overview.onLeaveHint`)}
          href="/hr/leave-requests"
        />
        <OverviewStatCard
          index={2}
          icon={UserPlus}
          tone={newHires > 0 ? 'ok' : 'neutral'}
          valueTone={newHires > 0 ? 'ok' : 'neutral'}
          label={t(`${STATS}.headcount.newThisMonth`)}
          value={formatCount(newHires, locale)}
          badge={
            newHires > 0
              ? t(`${HOME}.overview.newHiresHint`)
              : t(`${HOME}.overview.noNewHires`)
          }
          href="/users"
        />
        <OverviewStatCard
          index={3}
          icon={Inbox}
          tone={pendingCompanyWide > 0 ? 'urgent' : 'neutral'}
          valueTone={pendingCompanyWide > 0 ? 'urgent' : 'neutral'}
          label={t(`${HOME}.overview.pendingApprovals`)}
          value={formatCount(pendingCompanyWide, locale)}
          badge={t(`${HOME}.overview.pendingApprovalsHint`)}
          href="/approvals"
        />
      </MetricStrip>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <ContractsExpiringCard stats={stats} query={query} />
        <AttendanceCard stats={stats} query={query} canImport={canViewHr} />
        <LeaveSummaryCard stats={stats} query={query} />
        <SiteAssignmentsCard stats={stats} query={query} />
      </div>
    </div>
  );
}
