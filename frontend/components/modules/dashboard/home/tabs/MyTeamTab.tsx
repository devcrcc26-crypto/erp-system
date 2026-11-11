'use client';

import { CalendarDays, Inbox, MapPin, Timer, Users, UsersRound } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import { formatCount } from '../format';
import HorizontalBarList from './overview/HorizontalBarList';
import OverviewCard from './overview/OverviewCard';
import OverviewEmptyState from './overview/OverviewEmptyState';
import OverviewStatCard from './overview/OverviewStatCard';
import { TONE } from './overview/overview-tokens';
import { MetricStrip } from './TabParts';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

/** Supervisor "My Team": direct-report rollup from `stats.myTeam`. */
export default function MyTeamTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useDashboardOperationalStats(enabled);
  const team = query.data?.myTeam ?? null;

  if (!query.isLoading && !query.isError && !team) {
    return (
      <OverviewEmptyState
        icon={UsersRound}
        title={t(`${HOME}.myTeam.noTeam`)}
        description={t(`${HOME}.myTeam.noTeamHint`)}
      />
    );
  }

  const pendingMyApproval = team?.pendingMyApproval ?? 0;
  const onLeave = team?.onLeaveToday ?? 0;
  const siteExpiring = team?.siteExpiringSoon ?? 0;
  const otRows = [...(team?.otByEmployee ?? [])]
    .sort((a, b) => b.hours - a.hours)
    .map((row) => ({ label: row.name, value: row.hours }));

  return (
    <div className="flex flex-col gap-5">
      <MetricStrip query={query} label={t(`${HOME}.myTeam.title`)}>
        <OverviewStatCard
          index={0}
          icon={Users}
          tone="info"
          valueTone="neutral"
          label={t(`${HOME}.myTeam.directReports`)}
          value={formatCount(team?.totalDirectReports ?? 0, locale)}
          badge={t(`${HOME}.myTeam.directReportsHint`)}
        />
        <OverviewStatCard
          index={1}
          icon={CalendarDays}
          tone={onLeave > 0 ? 'warn' : 'neutral'}
          valueTone="neutral"
          label={t(`${STATS}.headcount.onLeaveToday`)}
          value={formatCount(onLeave, locale)}
          badge={t(`${HOME}.overview.onLeaveHint`)}
        />
        <OverviewStatCard
          index={2}
          icon={Inbox}
          tone={pendingMyApproval > 0 ? 'warn' : 'neutral'}
          valueTone={pendingMyApproval > 0 ? 'warn' : 'neutral'}
          label={t(`${HOME}.myTeam.pendingMyApproval`)}
          value={formatCount(pendingMyApproval, locale)}
          badge={t(`${HOME}.myTeam.pendingHint`)}
          href="/approvals"
        />
        <OverviewStatCard
          index={3}
          icon={Timer}
          tone="ok"
          valueTone="neutral"
          label={t(`${HOME}.myTeam.otHours`)}
          value={formatCount(team?.totalOTHoursThisMonth ?? 0, locale)}
          badge={t(`${HOME}.myTeam.otHoursHint`)}
        />
      </MetricStrip>

      <OverviewCard
        title={t(`${HOME}.myTeam.otByEmployee`)}
        subtitle={t(`${HOME}.myTeam.otByEmployeeSubtitle`)}
        icon={<Timer size={18} strokeWidth={1.9} />}
        tone="ok"
        viewAllHref="/hr/overtime"
        query={query}
      >
        <HorizontalBarList
          data={otRows}
          emptyLabel={t(`${HOME}.myTeam.otByEmployeeEmpty`)}
          ariaLabel={t(`${HOME}.myTeam.otByEmployee`)}
          locale={locale}
        />
      </OverviewCard>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <OverviewCard
          title={t(`${HOME}.myTeam.leave`)}
          icon={<CalendarDays size={18} strokeWidth={1.9} />}
          tone={pendingMyApproval > 0 ? 'urgent' : 'ok'}
          viewAllHref="/approvals"
          query={query}
        >
          {team ? (
            <>
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {t(`${HOME}.myTeam.pendingMyApproval`)}
                </p>
                <p
                  className={`m-0 mt-1 text-[32px] font-semibold leading-none tracking-tight tabular-nums ${
                    pendingMyApproval > 0 ? TONE.urgent.value : 'text-slate-900'
                  }`}
                >
                  {formatCount(team.pendingMyApproval, locale)}
                </p>
              </div>
              <div className="mt-auto rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {t(`${STATS}.leave.onLeave`)}
                </p>
                <p className="m-0 mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {formatCount(team.currentlyOnLeave, locale)}
                </p>
              </div>
            </>
          ) : null}
        </OverviewCard>

        <OverviewCard
          title={t(`${HOME}.myTeam.siteAssignments`)}
          icon={<MapPin size={18} strokeWidth={1.9} />}
          tone={siteExpiring > 0 ? 'warn' : 'info'}
          viewAllHref="/hr/site-assignments"
          query={query}
        >
          {team ? (
            <>
              <div>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {t(`${STATS}.siteAssignments.current`)}
                </p>
                <p className="m-0 mt-1 text-[32px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
                  {formatCount(team.siteCurrentlyAssigned, locale)}
                </p>
              </div>
              <div
                className={`mt-auto rounded-xl border px-4 py-3 ${
                  siteExpiring > 0
                    ? 'border-amber-100 bg-amber-50/70'
                    : 'border-slate-100 bg-slate-50/60'
                }`}
              >
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {t(`${HOME}.myTeam.siteExpiringSoon`)}
                </p>
                <p
                  className={`m-0 mt-1 text-xl font-semibold tabular-nums ${
                    siteExpiring > 0 ? TONE.warn.value : 'text-slate-900'
                  }`}
                >
                  {formatCount(team.siteExpiringSoon, locale)}
                </p>
              </div>
            </>
          ) : null}
        </OverviewCard>
      </div>
    </div>
  );
}
