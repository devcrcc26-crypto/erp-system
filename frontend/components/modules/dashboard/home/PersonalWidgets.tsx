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
import { overtimeSheetDetailHref } from '@/lib/utils/hr-self-service-nav';
import {
  formatOvertimeHours,
  formatOvertimeStatus,
  overtimeStatusVariant,
} from '@/lib/utils/overtime-display';
import { useAuthStore } from '@/stores/auth.store';
import { formatCount, formatMonthYear } from './format';
import OverviewCard, { TonePill } from './tabs/overview/OverviewCard';
import OverviewEmptyState from './tabs/overview/OverviewEmptyState';
import { ProgressRow } from './tabs/overview/AttendanceCard';

const HOME = 'pages.dashboard.home';

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

const listRowClass =
  'flex items-center gap-3 border-b border-slate-100 py-2.5 last:border-b-0 last:pb-0 text-inherit no-underline transition-colors hover:bg-slate-50/80 -mx-1 px-1 rounded-lg';

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
    <OverviewCard
      title={t(`${HOME}.pendingApprovals.title`)}
      icon={<Inbox size={18} strokeWidth={1.9} />}
      tone={total > 0 ? 'warn' : 'neutral'}
      viewAllHref="/approvals"
      query={query}
      isEmpty={items.length === 0}
      emptyState={
        <OverviewEmptyState icon={Inbox} title={t(`${HOME}.pendingApprovals.empty`)} />
      }
    >
      <div>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {t(`${HOME}.pendingApprovals.countLabel`)}
        </p>
        <p className="m-0 mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
          {formatCount(total, locale)}
        </p>
      </div>
      <ul className="m-0 mt-auto flex flex-col p-0">
        {items.map((item) => (
          <li key={item.id} className="list-none">
            <Link href={`/approvals/${item.id}`} className={listRowClass}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {categoryLabel(item, t)}
                </span>
                <span className="block truncate text-xs text-slate-500">
                  {formatApprovalUserName(item.requester)}
                </span>
              </span>
              <TonePill tone="warn">{waitingLabel(item, t)}</TonePill>
            </Link>
          </li>
        ))}
      </ul>
    </OverviewCard>
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
    <OverviewCard
      title={t(`${HOME}.myRequests.title`)}
      icon={<FileClock size={18} strokeWidth={1.9} />}
      tone="info"
      viewAllHref="/approvals"
      query={query}
      isEmpty={items.length === 0}
      emptyState={
        <OverviewEmptyState icon={FileClock} title={t(`${HOME}.myRequests.empty`)} />
      }
    >
      <ul className="m-0 flex flex-col p-0">
        {items.map((item) => (
          <li key={item.id} className="list-none">
            <Link href={`/approvals/${item.id}`} className={listRowClass}>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-slate-900">
                  {categoryLabel(item, t)}
                </span>
                <span className="block truncate text-xs tabular-nums text-slate-500">
                  {item.requestNumber}
                </span>
              </span>
              <StatusBadge
                label={formatApprovalStatus(item.status, t)}
                variant={approvalRequestStatusVariant(item.status)}
              />
            </Link>
          </li>
        ))}
      </ul>
    </OverviewCard>
  );
}

/** Remaining days for each leave type the employee holds a balance for. */
export function LeaveBalanceWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useMyLeaveBalances({ enabled });
  const leaveYearLabel = query.data?.[0]?.year ?? addisParts().year;
  const balances = (query.data ?? []).filter(
    (balance) =>
      balance.entitled + balance.broughtForward > 0 || balance.remaining > 0,
  );

  return (
    <OverviewCard
      title={t(`${HOME}.leaveBalance.title`)}
      icon={<CalendarDays size={18} strokeWidth={1.9} />}
      tone="ok"
      viewAllHref="/hr/leave-requests"
      query={query}
      isEmpty={balances.length === 0}
      emptyState={
        <OverviewEmptyState
          icon={CalendarDays}
          title={t(`${HOME}.leaveBalance.empty`, { year: leaveYearLabel })}
        />
      }
    >
      <ul className="m-0 flex flex-col p-0">
        {balances.map((balance) => (
          <li
            key={`${balance.year}-${balance.leaveType}`}
            className="flex list-none items-center justify-between gap-3 border-b border-slate-100 py-2.5 last:border-b-0 last:pb-0"
          >
            <span className="truncate text-sm font-medium text-slate-800">
              {formatLeaveType(balance.leaveType, t)}
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
              {t(`${HOME}.leaveBalance.daysLeft`, {
                days: formatCount(balance.remaining, locale),
              })}
            </span>
          </li>
        ))}
      </ul>
    </OverviewCard>
  );
}

/**
 * Present / absent / holiday days for the current month, with present ÷
 * scheduled as a bar. Attendance is imported after the fact, so when this
 * month has no record yet the latest imported month is shown, labelled.
 */
export function AttendanceWidget({ enabled }: { enabled: boolean }): React.ReactNode {
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

  return (
    <OverviewCard
      title={t(`${HOME}.attendance.title`)}
      icon={<CalendarCheck2 size={18} strokeWidth={1.9} />}
      tone="info"
      viewAllHref="/profile"
      query={query}
      isEmpty={!latest}
      emptyState={
        <OverviewEmptyState
          icon={CalendarCheck2}
          title={t(`${HOME}.attendance.empty`)}
        />
      }
    >
      {latest ? (
        <>
          {current ? null : (
            <TonePill tone="neutral">
              {t(`${HOME}.attendance.latest`, {
                period: formatMonthYear(latest.month, latest.year, locale),
              })}
            </TonePill>
          )}
          <div className="grid grid-cols-3 gap-4">
            {(
              [
                { label: t(`${HOME}.attendance.present`), value: present },
                { label: t(`${HOME}.attendance.absent`), value: latest.absentDays },
                { label: t(`${HOME}.attendance.holidays`), value: latest.holidayDays },
              ] as const
            ).map((row) => (
              <div key={row.label}>
                <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                  {row.label}
                </p>
                <p className="m-0 mt-1 text-xl font-semibold tabular-nums text-slate-900">
                  {formatCount(row.value, locale)}
                </p>
              </div>
            ))}
          </div>
          <ProgressRow
            label={t(`${HOME}.attendance.rate`, {
              present: formatCount(present, locale),
              scheduled: formatCount(scheduled, locale),
            })}
            current={present}
            total={scheduled}
            tone="ok"
            locale={locale}
          />
        </>
      ) : null}
    </OverviewCard>
  );
}

/** Current month's overtime sheet: hours, status and a link to open it. */
export function OvertimeWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t } = useEpcTranslation();
  const query = useCurrentOvertimeSheet(enabled);
  const sheet = query.data;

  return (
    <OverviewCard
      title={t(`${HOME}.overtime.title`)}
      icon={<Timer size={18} strokeWidth={1.9} />}
      tone="ok"
      viewAllHref="/hr/overtime"
      query={query}
      isEmpty={!sheet}
      emptyState={
        <OverviewEmptyState icon={Timer} title={t(`${HOME}.overtime.empty`)} />
      }
    >
      {sheet ? (
        <>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {t(`${HOME}.overtime.hours`)}
              </p>
              <p className="m-0 mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
                {formatOvertimeHours(sheet.totalHours)}
              </p>
            </div>
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {t(`${HOME}.overtime.status`)}
              </p>
              <div className="mt-2">
                <StatusBadge
                  label={formatOvertimeStatus(sheet.status, t)}
                  variant={overtimeStatusVariant(sheet.status)}
                />
              </div>
            </div>
          </div>
          <Link
            href={overtimeSheetDetailHref(sheet.id, '/profile?tab=overtime')}
            className="mt-auto inline-flex w-fit items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            {t(`${HOME}.overtime.openSheet`)}
          </Link>
        </>
      ) : null}
    </OverviewCard>
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
export function MyEvaluationWidget({ enabled }: { enabled: boolean }): React.ReactNode {
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
    <OverviewCard
      title={t(`${HOME}.evaluation.title`)}
      icon={<ClipboardCheck size={18} strokeWidth={1.9} />}
      tone={waitingOnMe ? 'warn' : 'info'}
      viewAllHref="/profile/evaluations"
      query={query}
      isEmpty={!evaluation}
      emptyState={
        <OverviewEmptyState
          icon={ClipboardCheck}
          title={t(`${HOME}.evaluation.empty`)}
        />
      }
    >
      {evaluation ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {t(`${HOME}.evaluation.cycle`, {
                quarter: evaluation.cycle.quarter,
                year: evaluation.cycle.year,
              })}
            </span>
            <StatusBadge
              label={t(`${HOME}.evaluation.status.${evaluation.status}`)}
              variant={EVALUATION_STATUS_BADGE[evaluation.status]}
            />
          </div>
          <p
            className={`m-0 rounded-xl px-4 py-3 text-sm ${
              waitingOnMe
                ? 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-100'
                : 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-100'
            }`}
          >
            {waitingOnMe
              ? t(`${HOME}.evaluation.actionNeeded`)
              : t(`${HOME}.evaluation.noAction`)}
          </p>
          <Link
            href={`/hr/evaluations/${evaluation.id}`}
            className="mt-auto inline-flex w-fit items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            {t(`${HOME}.evaluation.open`)}
          </Link>
        </>
      ) : null}
    </OverviewCard>
  );
}
