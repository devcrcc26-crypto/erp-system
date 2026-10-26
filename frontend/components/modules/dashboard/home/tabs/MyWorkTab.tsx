'use client';

import { CalendarDays, FileClock, MapPin, Timer } from 'lucide-react';
import { useCanAccessOvertime } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import { KpiTile, STATS } from '../OperationalStatsWidgets';
import {
  AttendanceWidget,
  MyEvaluationWidget,
  MyRequestsWidget,
  OvertimeWidget,
  PendingApprovalsWidget,
} from '../PersonalWidgets';
import { EvaluationInboxWidget, useLeadEvaluations } from '../RoleWidgets';
import WidgetCard from '../WidgetCard';
import { formatCount, formatShortDate } from '../format';
import { KpiStripShell } from './TabParts';

const HOME = 'pages.dashboard.home';
const ICON = { size: 18, strokeWidth: 1.9 } as const;

/** "My Work" (every user): my KPIs, approvals, requests, site, attendance. */
export default function MyWorkTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const canAccessOvertime = useCanAccessOvertime();
  const query = useDashboardOperationalStats(enabled);
  const { isLead } = useLeadEvaluations(enabled);
  const work = query.data?.myWork ?? null;
  const site = work?.nextSiteAssignment ?? null;
  const pending = work?.pendingRequestsCount ?? 0;

  const bottomWidgets: React.ReactNode[] = [];
  if (canAccessOvertime) {
    bottomWidgets.push(<OvertimeWidget key="overtime" enabled={enabled} span={6} />);
  }
  if (isLead) {
    bottomWidgets.push(
      <EvaluationInboxWidget key="evaluationInbox" enabled={enabled} span={6} />,
    );
  }

  return (
    <>
      <KpiStripShell query={query} label={t(`${STATS}.personal.title`)} columns={3}>
        <KpiTile
          icon={CalendarDays}
          label={t(`${STATS}.personal.leaveBalance`)}
          value={
            work?.leaveBalanceDays == null
              ? '—'
              : formatCount(work.leaveBalanceDays, locale)
          }
          href="/hr/leave-requests"
        />
        <KpiTile
          icon={Timer}
          label={t(`${STATS}.personal.otHours`)}
          value={formatCount(work?.otHoursThisMonth ?? 0, locale)}
        />
        <KpiTile
          icon={FileClock}
          label={t(`${STATS}.personal.pendingRequests`)}
          value={formatCount(pending, locale)}
          tone={pending > 0 ? 'warn' : undefined}
          href="/approvals"
        />
      </KpiStripShell>

      <div className="dv2-row">
        <PendingApprovalsWidget enabled={enabled} />
        <MyRequestsWidget enabled={enabled} />
      </div>

      <div className="dv2-row">
        <WidgetCard
          title={t(`${HOME}.myWork.nextSite`)}
          icon={<MapPin {...ICON} />}
          span={6}
          viewAllHref="/hr/site-assignments"
          query={query}
          isEmpty={!site}
          emptyLabel={t(`${STATS}.personal.noSite`)}
        >
          {site ? (
            <div className="dv2-figure">
              <p className="dv2-strong m-0">{site.location}</p>
              <p className="dv2-hint m-0">
                {`${formatShortDate(site.startDate, locale)} → ${formatShortDate(site.endDate, locale)}`}
              </p>
            </div>
          ) : null}
        </WidgetCard>
        <MyEvaluationWidget enabled={enabled} span={6} />
      </div>

      <AttendanceWidget enabled={enabled} span={12} />

      {bottomWidgets.length > 0 ? <div className="dv2-row">{bottomWidgets}</div> : null}
    </>
  );
}
