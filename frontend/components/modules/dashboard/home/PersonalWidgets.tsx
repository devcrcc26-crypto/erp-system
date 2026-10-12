'use client';

import Link from 'next/link';
import {
  CalendarCheck2,
  CalendarDays,
  ClipboardCheck,
  FileClock,
  Inbox,
  Timer,
} from 'lucide-react';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ApprovalRequestListItem } from '@/lib/api/approvals.types';
import type { EmployeeEvaluation } from '@/lib/api/evaluation.types';
import { addisParts, daysUntil } from '@/lib/dashboard/addis-time';
import { useApprovalRequests } from '@/lib/query/approvals';
import { useMyAttendance } from '@/lib/query/attendance';
import { useMyEvaluations, usePendingMyAction } from '@/lib/query/evaluation';
import { useMyLeaveBalances } from '@/lib/query/leave';
import { useCurrentOvertimeSheet } from '@/lib/query/overtime';
import {
  approvalRequestStatusVariant,
  formatApprovalStatus,
  formatApprovalUserName,
} from '@/lib/utils/approval-display';
import { formatApprovalCategoryName } from '@/lib/utils/approval-category-display';
import { EVALUATION_STATUS_BADGE } from '@/lib/utils/evaluation-status';
import { formatLeaveType } from '@/lib/utils/leave-display';
import {
  formatOvertimeHours,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { useAuthStore } from '@/stores/auth.store';
import WidgetCard, { WidgetFigure, type WidgetSpan } from './WidgetCard';
import { formatCount, formatMonthYear } from './format';

const HOME = 'pages.dashboard.home';
const ICON = { size: 18, strokeWidth: 1.9 } as const;

type TFn = ReturnType<typeof useEpcTranslation>['t'];

function categoryLabel(item: ApprovalRequestListItem, t: TFn): string {
  return formatApprovalCategoryName(
    item.categoryCode ?? item.category?.code,
    t,
    item.category?.name,
  );
}

function waitingLabel(item: ApprovalRequestListItem, t: TFn): string {
  const days = -daysUntil(item.submittedAt ?? item.createdAt);
  return days <= 0
    ? t(`${HOME}.pendingApprovals.waitingToday`)
    : t(`${HOME}.pendingApprovals.waitingDays`, { count: days });
}

/** Requests awaiting my decision: count plus the five oldest-first page items. */
export function PendingApprovalsWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useApprovalRequests(
    { page: 1, limit: 5, inbox: 'PENDING_MY_ACTION' },
    enabled,
  );
  const items = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;

  return (
    <WidgetCard
      title={t(`${HOME}.pendingApprovals.title`)}
      icon={<Inbox {...ICON} />}
      span={6}
      viewAllHref="/approvals"
      query={query}
      isEmpty={items.length === 0}
      emptyLabel={t(`${HOME}.pendingApprovals.empty`)}
    >
      <WidgetFigure
        label={t(`${HOME}.pendingApprovals.countLabel`)}
        value={formatCount(total, locale)}
      />
      <ul className="dv2-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/approvals/${item.id}`} className="dv2-list-row">
              <span className="dv2-list-main">
                <span className="dv2-list-title">{categoryLabel(item, t)}</span>
                <span className="dv2-list-sub">
                  {formatApprovalUserName(item.requester)}
                </span>
              </span>
              <span className="dv2-list-meta">{waitingLabel(item, t)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/** My last five requests with their status. */
export function MyRequestsWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t } = useEpcTranslation();
  const query = useApprovalRequests(
    { page: 1, limit: 5, inbox: 'MY_REQUESTS' },
    enabled,
  );
  const items = query.data?.data ?? [];

  return (
    <WidgetCard
      title={t(`${HOME}.myRequests.title`)}
      icon={<FileClock {...ICON} />}
      span={6}
      viewAllHref="/approvals"
      query={query}
      isEmpty={items.length === 0}
      emptyLabel={t(`${HOME}.myRequests.empty`)}
    >
      <ul className="dv2-list">
        {items.map((item) => (
          <li key={item.id}>
            <Link href={`/approvals/${item.id}`} className="dv2-list-row">
              <span className="dv2-list-main">
                <span className="dv2-list-title">{categoryLabel(item, t)}</span>
                <span className="dv2-list-sub">{item.requestNumber}</span>
              </span>
              <StatusBadge
                label={formatApprovalStatus(item.status, t)}
                variant={approvalRequestStatusVariant(item.status)}
              />
            </Link>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/** Remaining days for each leave type the employee holds a balance for. */
export function LeaveBalanceWidget({
  enabled,
  span = 4,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useMyLeaveBalances({ enabled });
  const leaveYearLabel =
    query.data?.[0]?.year ?? addisParts().year;
  const balances = (query.data ?? []).filter(
    (balance) =>
      balance.entitled + balance.broughtForward > 0 || balance.remaining > 0,
  );

  return (
    <WidgetCard
      title={t(`${HOME}.leaveBalance.title`)}
      icon={<CalendarDays {...ICON} />}
      span={span}
      viewAllHref="/hr/leave-requests"
      query={query}
      isEmpty={balances.length === 0}
      emptyLabel={t(`${HOME}.leaveBalance.empty`, { year: leaveYearLabel })}
    >
      <ul className="dv2-list">
        {balances.map((balance) => (
          <li
            key={`${balance.year}-${balance.leaveType}`}
            className="dv2-list-row dv2-list-row--static"
          >
            <span className="dv2-list-title">
              {formatLeaveType(balance.leaveType, t)}
            </span>
            <span className="dv2-list-figure">
              {t(`${HOME}.leaveBalance.daysLeft`, {
                days: formatCount(balance.remaining, locale),
              })}
            </span>
          </li>
        ))}
      </ul>
    </WidgetCard>
  );
}

/**
 * Present / absent / holiday days for the current month, with present ÷
 * scheduled as a bar. Attendance is imported after the fact, so when this
 * month has no record yet the latest imported month is shown, labelled.
 */
export function AttendanceWidget({
  enabled,
  span = 4,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const { month, year } = addisParts();
  const query = useMyAttendance(year, enabled);
  const records = query.data?.records ?? [];
  const current = records.find((record) => record.month === month);
  const latest =
    current ??
    [...records].sort((a, b) => b.year - a.year || b.month - a.month)[0];

  const scheduled = latest?.scheduledDays ?? 0;
  const present = latest?.presentDays ?? 0;
  const percent = scheduled > 0 ? Math.min(100, Math.round((present / scheduled) * 100)) : 0;

  return (
    <WidgetCard
      title={t(`${HOME}.attendance.title`)}
      icon={<CalendarCheck2 {...ICON} />}
      span={span}
      viewAllHref="/profile"
      query={query}
      isEmpty={!latest}
      emptyLabel={t(`${HOME}.attendance.empty`)}
    >
      {latest ? (
        <>
          {current ? null : (
            <p className="dv2-hint m-0 mb-3">
              {t(`${HOME}.attendance.latest`, {
                period: formatMonthYear(latest.month, latest.year, locale),
              })}
            </p>
          )}
          <div className="dv2-stat-row">
            <WidgetFigure
              label={t(`${HOME}.attendance.present`)}
              value={formatCount(present, locale)}
            />
            <WidgetFigure
              label={t(`${HOME}.attendance.absent`)}
              value={formatCount(latest.absentDays, locale)}
            />
            <WidgetFigure
              label={t(`${HOME}.attendance.holidays`)}
              value={formatCount(latest.holidayDays, locale)}
            />
          </div>
          <div
            className="dv2-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={t(`${HOME}.attendance.rate`, {
              present: formatCount(present, locale),
              scheduled: formatCount(scheduled, locale),
            })}
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <p className="dv2-hint m-0">
            {t(`${HOME}.attendance.rate`, {
              present: formatCount(present, locale),
              scheduled: formatCount(scheduled, locale),
            })}
          </p>
        </>
      ) : null}
    </WidgetCard>
  );
}

/** Current month's overtime sheet: hours, status and a link to open it. */
export function OvertimeWidget({
  enabled,
  span = 4,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const query = useCurrentOvertimeSheet(enabled);
  const sheet = query.data;

  return (
    <WidgetCard
      title={t(`${HOME}.overtime.title`)}
      icon={<Timer {...ICON} />}
      span={span}
      viewAllHref="/hr/overtime"
      query={query}
      isEmpty={!sheet}
      emptyLabel={t(`${HOME}.overtime.empty`)}
    >
      {sheet ? (
        <>
          <div className="dv2-stat-row">
            <WidgetFigure
              label={t(`${HOME}.overtime.hours`)}
              value={formatOvertimeHours(sheet.totalHours)}
            />
            <div className="dv2-figure">
              <p className="dv2-label m-0">{t(`${HOME}.overtime.status`)}</p>
              <StatusBadge
                label={formatOvertimeStatus(sheet.status, t)}
                variant={overtimeStatusVariant(sheet.status)}
              />
            </div>
          </div>
          <Link href={`/hr/overtime/${sheet.id}`} className="dv2-button">
            {t(`${HOME}.overtime.openSheet`)}
          </Link>
        </>
      ) : null}
    </WidgetCard>
  );
}

function currentEvaluation(
  evaluations: readonly EmployeeEvaluation[],
): EmployeeEvaluation | undefined {
  const newestFirst = [...evaluations].sort(
    (a, b) => b.cycle.year - a.cycle.year || b.cycle.quarter - a.cycle.quarter,
  );
  return (
    newestFirst.find((evaluation) => evaluation.cycle.status === 'ACTIVE') ??
    newestFirst[0]
  );
}

/** My evaluation in the current cycle and whether it is waiting on me. */
export function MyEvaluationWidget({
  enabled,
  span = 4,
}: {
  enabled: boolean;
  span?: WidgetSpan;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const query = useMyEvaluations();
  const pendingQuery = usePendingMyAction({ enabled });
  const evaluation = currentEvaluation(query.data ?? []);
  const waitingOnMe =
    evaluation !== undefined &&
    (pendingQuery.data ?? []).some(
      (item) => item.id === evaluation.id && item.employeeId === userId,
    );

  return (
    <WidgetCard
      title={t(`${HOME}.evaluation.title`)}
      icon={<ClipboardCheck {...ICON} />}
      span={span}
      viewAllHref="/profile/evaluations"
      query={query}
      isEmpty={!evaluation}
      emptyLabel={t(`${HOME}.evaluation.empty`)}
    >
      {evaluation ? (
        <>
          <div className="dv2-stat-row">
            <div className="dv2-figure">
              <p className="dv2-label m-0">
                {t(`${HOME}.evaluation.cycle`, {
                  quarter: evaluation.cycle.quarter,
                  year: evaluation.cycle.year,
                })}
              </p>
              <StatusBadge
                label={t(`${HOME}.evaluation.status.${evaluation.status}`)}
                variant={EVALUATION_STATUS_BADGE[evaluation.status]}
              />
            </div>
          </div>
          <p className={`dv2-callout m-0 ${waitingOnMe ? 'dv2-callout--action' : ''}`}>
            {waitingOnMe
              ? t(`${HOME}.evaluation.actionNeeded`)
              : t(`${HOME}.evaluation.noAction`)}
          </p>
          <Link href={`/hr/evaluations/${evaluation.id}`} className="dv2-button">
            {t(`${HOME}.evaluation.open`)}
          </Link>
        </>
      ) : null}
    </WidgetCard>
  );
}
