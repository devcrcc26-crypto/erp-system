'use client';

import { Timer, UserRound } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import { formatCount } from '../format';
import OverviewCard from './overview/OverviewCard';
import OverviewStatCard from './overview/OverviewStatCard';
import OtStackedBarChart from './overview/OtStackedBarChart';
import PayrollStatusCard from './overview/PayrollStatusCard';
import PerDiemCard from './overview/PerDiemCard';
import { MetricStrip } from './TabParts';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

/** HR "Payroll & OT": overtime totals and split, per diem, payroll run state. */
export default function PayrollOtTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;
  const pendingOt = stats?.overtime.pendingApprovalCount ?? 0;
  const totalHours = stats?.overtime.totalHours ?? 0;
  const employeesWithOt = stats?.overtime.employeesWithOT ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <MetricStrip query={query} label={t(`${STATS}.overtime.title`)} columns={3}>
        <OverviewStatCard
          index={0}
          icon={Timer}
          tone="ok"
          valueTone="neutral"
          label={t(`${STATS}.overtime.totalHours`)}
          value={formatCount(totalHours, locale)}
          badge={t(`${HOME}.payrollOt.hoursHint`)}
          href="/hr/overtime"
        />
        <OverviewStatCard
          index={1}
          icon={UserRound}
          tone="info"
          valueTone="neutral"
          label={t(`${STATS}.overtime.employees`)}
          value={formatCount(employeesWithOt, locale)}
          badge={t(`${HOME}.payrollOt.employeesHint`)}
        />
        <OverviewStatCard
          index={2}
          icon={Timer}
          tone={pendingOt > 0 ? 'urgent' : 'neutral'}
          valueTone={pendingOt > 0 ? 'urgent' : 'neutral'}
          label={t(`${STATS}.overtime.pending`)}
          value={formatCount(pendingOt, locale)}
          badge={t(`${HOME}.payrollOt.pendingHint`)}
          href="/hr/overtime"
        />
      </MetricStrip>

      <OverviewCard
        title={t(`${HOME}.payrollOt.otByEmployee`)}
        subtitle={t(`${HOME}.payrollOt.otByEmployeeSubtitle`)}
        icon={<Timer size={18} strokeWidth={1.9} />}
        tone="ok"
        viewAllHref="/hr/overtime"
        query={query}
        className="lg:col-span-2"
      >
        <OtStackedBarChart
          data={stats?.overtimeByEmployee ?? []}
          emptyLabel={t(`${HOME}.payrollOt.otByEmployeeEmpty`)}
          ariaLabel={t(`${HOME}.payrollOt.otByEmployee`)}
        />
      </OverviewCard>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <PerDiemCard stats={stats} query={query} />
        <PayrollStatusCard stats={stats} query={query} />
      </div>
    </div>
  );
}
