'use client';

import { CalendarDays, FileClock, MapPin, MapPinOff, Timer } from 'lucide-react';
import { useCanAccessOvertime } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import {
  AttendanceWidget,
  MyEvaluationWidget,
  MyRequestsWidget,
  OvertimeWidget,
  PendingApprovalsWidget,
} from '../PersonalWidgets';
import { EvaluationInboxWidget, useLeadEvaluations } from '../RoleWidgets';
import { formatCount, formatShortDate } from '../format';
import OverviewCard from './overview/OverviewCard';
import OverviewEmptyState from './overview/OverviewEmptyState';
import OverviewStatCard from './overview/OverviewStatCard';
import { MetricStrip } from './TabParts';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

/** "My Work" (every user): my KPIs, approvals, requests, site, attendance. */
export default function MyWorkTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const canAccessOvertime = useCanAccessOvertime();
  const query = useDashboardOperationalStats(enabled);
  const { isLead } = useLeadEvaluations(enabled);
  const work = query.data?.myWork ?? null;
  const site = work?.nextSiteAssignment ?? null;
  const pending = work?.pendingRequestsCount ?? 0;

  return (
    <div className="flex flex-col gap-5">
      <MetricStrip query={query} label={t(`${STATS}.personal.title`)} columns={3}>
        <OverviewStatCard
          index={0}
          icon={CalendarDays}
          tone="info"
          valueTone="neutral"
          label={t(`${STATS}.personal.leaveBalance`)}
          value={
            work?.leaveBalanceDays == null
              ? '—'
              : formatCount(work.leaveBalanceDays, locale)
          }
          badge={t(`${HOME}.myWork.leaveBalanceHint`)}
          href="/hr/leave-requests"
        />
        <OverviewStatCard
          index={1}
          icon={Timer}
          tone="ok"
          valueTone="neutral"
          label={t(`${STATS}.personal.otHours`)}
          value={formatCount(work?.otHoursThisMonth ?? 0, locale)}
          badge={t(`${HOME}.myWork.otHoursHint`)}
        />
        <OverviewStatCard
          index={2}
          icon={FileClock}
          tone={pending > 0 ? 'warn' : 'neutral'}
          valueTone={pending > 0 ? 'warn' : 'neutral'}
          label={t(`${STATS}.personal.pendingRequests`)}
          value={formatCount(pending, locale)}
          badge={t(`${HOME}.myWork.pendingHint`)}
          href="/approvals"
        />
      </MetricStrip>

      <div className="grid grid-cols-1 items-stretch gap-5 lg:grid-cols-2">
        <PendingApprovalsWidget enabled={enabled} />
        <MyRequestsWidget enabled={enabled} />

        <OverviewCard
          title={t(`${HOME}.myWork.nextSite`)}
          icon={<MapPin size={18} strokeWidth={1.9} />}
          tone="info"
          viewAllHref="/hr/site-assignments"
          query={query}
          isEmpty={!site}
          emptyState={
            <OverviewEmptyState
              icon={MapPinOff}
              title={t(`${STATS}.personal.noSite`)}
              description={t(`${HOME}.myWork.noSiteHint`)}
            />
          }
        >
          {site ? (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-lg font-semibold leading-snug text-slate-900">
                {site.location}
              </p>
              <p className="m-0 inline-flex w-fit items-center rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium tabular-nums text-slate-600 ring-1 ring-inset ring-slate-200/70">
                {`${formatShortDate(site.startDate, locale)} → ${formatShortDate(site.endDate, locale)}`}
              </p>
            </div>
          ) : null}
        </OverviewCard>

        <MyEvaluationWidget enabled={enabled} />
        <div className="lg:col-span-2">
          <AttendanceWidget enabled={enabled} />
        </div>
        {canAccessOvertime ? <OvertimeWidget enabled={enabled} /> : null}
        {isLead ? <EvaluationInboxWidget enabled={enabled} /> : null}
      </div>
    </div>
  );
}
