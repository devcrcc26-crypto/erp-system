'use client';

import { CalendarDays, FileSignature, Inbox, UserCheck, Users } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import { formatLeaveType } from '@/lib/utils/leave-display';
import {
  DASHBOARD_CHART_COLORS,
  DashboardBarChart,
  DashboardDonutChart,
  type DashboardBarDatum,
  type DashboardDonutDatum,
} from '../charts/DashboardChart';
import {
  AttendanceStatsCard,
  KpiTile,
  Pill,
  STATS,
  SiteAssignmentsStatsCard,
  Stat,
} from '../OperationalStatsWidgets';
import WidgetCard from '../WidgetCard';
import { formatCount, formatShortDate } from '../format';
import { KpiStripShell } from './TabParts';

const HOME = 'pages.dashboard.home';
const ICON = { size: 18, strokeWidth: 1.9 } as const;

/** HR "Overview": headcount KPIs, contract expiry, attendance, leave, sites. */
export default function OverviewTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;

  const contractRows: DashboardBarDatum[] = stats?.contractsExpiring
    ? [
        {
          label: t(`${STATS}.contracts.within30`),
          value: stats.contractsExpiring.within30,
          color: DASHBOARD_CHART_COLORS.red,
        },
        {
          label: t(`${STATS}.contracts.within60`),
          value: stats.contractsExpiring.within60,
          color: DASHBOARD_CHART_COLORS.orange,
        },
        {
          label: t(`${STATS}.contracts.within90`),
          value: stats.contractsExpiring.within90,
          color: DASHBOARD_CHART_COLORS.caution,
        },
        {
          label: t(`${STATS}.contracts.expired`),
          value: stats.contractsExpiring.expiredUnrenewed,
          color: DASHBOARD_CHART_COLORS.urgentDark,
        },
      ]
    : [];
  const expiringList = stats?.contractsExpiringSoonList ?? [];

  const leaveRows: DashboardDonutDatum[] = (stats?.leaveByType ?? []).map((row) => ({
    label: formatLeaveType(row.type, t),
    value: row.count,
  }));

  const pendingCompanyWide = stats?.pendingApprovalsCompanyWide ?? 0;

  return (
    <>
      <KpiStripShell query={query} label={t(`${STATS}.headcount.title`)}>
        <KpiTile
          icon={Users}
          label={t(`${STATS}.headcount.total`)}
          value={formatCount(stats?.headcount?.total ?? 0, locale)}
        />
        <KpiTile
          icon={CalendarDays}
          label={t(`${STATS}.headcount.onLeaveToday`)}
          value={formatCount(stats?.headcount?.onLeaveToday ?? 0, locale)}
        />
        <KpiTile
          icon={UserCheck}
          label={t(`${STATS}.headcount.newThisMonth`)}
          value={formatCount(stats?.headcount?.newThisMonth ?? 0, locale)}
          tone={(stats?.headcount?.newThisMonth ?? 0) > 0 ? 'ok' : undefined}
        />
        <KpiTile
          icon={Inbox}
          label={t(`${HOME}.overview.pendingApprovals`)}
          value={formatCount(pendingCompanyWide, locale)}
          hint={t(`${HOME}.overview.pendingApprovalsHint`)}
          tone={pendingCompanyWide > 0 ? 'urgent' : undefined}
          href="/approvals"
        />
      </KpiStripShell>

      <div className="dv2-row">
        <WidgetCard
          title={t(`${HOME}.contracts.title`)}
          icon={<FileSignature {...ICON} />}
          span={6}
          viewAllHref="/hr/employee-contract"
          query={query}
        >
          <DashboardBarChart
            data={contractRows}
            emptyLabel={t(`${HOME}.contracts.empty`)}
            ariaLabel={t(`${HOME}.contracts.title`)}
          />
          {expiringList.length > 0 ? (
            <ul className="dv2-list">
              {expiringList.map((contract) => (
                <li
                  key={`${contract.employeeId}-${contract.endDate}`}
                  className="dv2-list-row dv2-list-row--static"
                >
                  <span className="dv2-list-main">
                    <span className="dv2-list-title">{contract.employeeName}</span>
                    <span className="dv2-list-sub">
                      {formatShortDate(contract.endDate, locale)}
                    </span>
                  </span>
                  {contract.endsToday ? (
                    <Pill tone="urgent">{t(`${HOME}.contracts.endsToday`)}</Pill>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </WidgetCard>

        <AttendanceStatsCard enabled={enabled} span={6} />
      </div>

      <div className="dv2-row">
        <WidgetCard
          title={t(`${STATS}.leave.title`)}
          icon={<CalendarDays {...ICON} />}
          span={6}
          viewAllHref="/hr/leave-requests"
          query={query}
        >
          {stats ? (
            <>
              <div className="dv2-stat-row">
                <Stat
                  label={t(`${STATS}.leave.pending`)}
                  value={stats.leave.pendingApprovalCount}
                  tone={stats.leave.pendingApprovalCount > 0 ? 'urgent' : undefined}
                  locale={locale}
                />
                <Stat
                  label={t(`${STATS}.leave.onLeave`)}
                  value={stats.leave.currentlyOnLeave}
                  locale={locale}
                />
                <Stat
                  label={t(`${STATS}.leave.thisMonth`)}
                  value={stats.leave.thisMonthRequests}
                  locale={locale}
                />
              </div>
              <p className="dv2-label m-0">{t(`${HOME}.overview.leaveByType`)}</p>
              <DashboardDonutChart
                data={leaveRows}
                emptyLabel={t(`${HOME}.overview.noLeaveByType`)}
                ariaLabel={t(`${HOME}.overview.leaveByType`)}
              />
            </>
          ) : null}
        </WidgetCard>

        <SiteAssignmentsStatsCard enabled={enabled} span={6} />
      </div>
    </>
  );
}
