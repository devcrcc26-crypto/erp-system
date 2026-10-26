'use client';

import { CalendarDays, Inbox, MapPin, Timer, Users } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import {
  DASHBOARD_CHART_COLORS,
  DashboardBarChart,
  type DashboardBarDatum,
} from '../charts/DashboardChart';
import { KpiTile, STATS, Stat } from '../OperationalStatsWidgets';
import WidgetCard, { WidgetFigure } from '../WidgetCard';
import { formatCount } from '../format';
import { KpiStripShell } from './TabParts';

const HOME = 'pages.dashboard.home';
const ICON = { size: 18, strokeWidth: 1.9 } as const;

/** Supervisor "My Team": direct-report rollup from `stats.myTeam`. */
export default function MyTeamTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useDashboardOperationalStats(enabled);
  const team = query.data?.myTeam ?? null;

  if (!query.isLoading && !query.isError && !team) {
    return (
      <section className="dv2-card" aria-label={t(`${HOME}.myTeam.title`)}>
        <div className="dv2-card-body">
          <p className="dv2-empty m-0">{t(`${HOME}.myTeam.noTeam`)}</p>
        </div>
      </section>
    );
  }

  const otRows: DashboardBarDatum[] = [...(team?.otByEmployee ?? [])]
    .sort((a, b) => b.hours - a.hours)
    .map((row) => ({
      label: row.name,
      value: row.hours,
      color: DASHBOARD_CHART_COLORS.blue,
    }));
  const pendingMyApproval = team?.pendingMyApproval ?? 0;

  return (
    <>
      <KpiStripShell query={query} label={t(`${HOME}.myTeam.title`)}>
        <KpiTile
          icon={Users}
          label={t(`${HOME}.myTeam.directReports`)}
          value={formatCount(team?.totalDirectReports ?? 0, locale)}
        />
        <KpiTile
          icon={CalendarDays}
          label={t(`${STATS}.headcount.onLeaveToday`)}
          value={formatCount(team?.onLeaveToday ?? 0, locale)}
        />
        <KpiTile
          icon={Inbox}
          label={t(`${HOME}.myTeam.pendingMyApproval`)}
          value={formatCount(pendingMyApproval, locale)}
          tone={pendingMyApproval > 0 ? 'warn' : undefined}
          href="/approvals"
        />
        <KpiTile
          icon={Timer}
          label={t(`${HOME}.myTeam.otHours`)}
          value={formatCount(team?.totalOTHoursThisMonth ?? 0, locale)}
        />
      </KpiStripShell>

      <WidgetCard
        title={t(`${HOME}.myTeam.otByEmployee`)}
        icon={<Timer {...ICON} />}
        span={12}
        viewAllHref="/hr/overtime"
        query={query}
      >
        <DashboardBarChart
          data={otRows}
          emptyLabel={t(`${HOME}.myTeam.otByEmployeeEmpty`)}
          ariaLabel={t(`${HOME}.myTeam.otByEmployee`)}
          height={Math.max(200, otRows.length * 36 + 40)}
        />
      </WidgetCard>

      <div className="dv2-row">
        <WidgetCard
          title={t(`${HOME}.myTeam.leave`)}
          icon={<CalendarDays {...ICON} />}
          span={6}
          viewAllHref="/approvals"
          query={query}
        >
          {team ? (
            <>
              <WidgetFigure
                label={t(`${HOME}.myTeam.pendingMyApproval`)}
                value={formatCount(team.pendingMyApproval, locale)}
              />
              <div className="dv2-stat-row">
                <Stat
                  label={t(`${STATS}.leave.onLeave`)}
                  value={team.currentlyOnLeave}
                  locale={locale}
                />
              </div>
            </>
          ) : null}
        </WidgetCard>

        <WidgetCard
          title={t(`${HOME}.myTeam.siteAssignments`)}
          icon={<MapPin {...ICON} />}
          span={6}
          viewAllHref="/hr/site-assignments"
          query={query}
        >
          {team ? (
            <>
              <WidgetFigure
                label={t(`${STATS}.siteAssignments.current`)}
                value={formatCount(team.siteCurrentlyAssigned, locale)}
              />
              <div className="dv2-stat-row">
                <Stat
                  label={t(`${HOME}.myTeam.siteExpiringSoon`)}
                  value={team.siteExpiringSoon}
                  tone={team.siteExpiringSoon > 0 ? 'warn' : undefined}
                  locale={locale}
                />
              </div>
            </>
          ) : null}
        </WidgetCard>
      </div>
    </>
  );
}
