'use client';

import Link from 'next/link';
import { FileSignature, ListChecks, UserCheck } from 'lucide-react';
import StatusBadge, {
  type StatusBadgeVariant,
} from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { AttendanceMonthStatus } from '@/lib/api/attendance.types';
import { addisParts, daysUntil } from '@/lib/dashboard/addis-time';
import {
  useAttendanceImportHistory,
  useAttendanceMonthlyApproval,
} from '@/lib/query/attendance';
import { useEmployeeContracts } from '@/lib/query/employee-contract';
import type { EvaluationStatus } from '@/lib/api/evaluation.types';
import { useEvaluations } from '@/lib/query/evaluation';
import { formatEmployeeContractEmployeeName } from '@/lib/utils/employee-contract-display';
import { formatUserName } from '@/lib/utils/user-display';
import WidgetCard, { WidgetFigure, type WidgetSpan } from './WidgetCard';
import { formatCount, formatMonthYear, formatShortDate } from './format';
import OverviewCard from './tabs/overview/OverviewCard';
import OverviewEmptyState from './tabs/overview/OverviewEmptyState';

const HOME = 'pages.dashboard.home';
const ICON = { size: 18, strokeWidth: 1.9 } as const;

/**
 * Evaluations assigned to me as Discipline Lead or Team Lead. Leads are
 * defined by assignment, not role name - the same queries the Evaluation
 * Inbox page uses, so the two share cache.
 */
export function useLeadEvaluations(enabled: boolean) {
  const asDisciplineLead = useEvaluations({ disciplineLeadId: 'me' }, { enabled });
  const asTeamLead = useEvaluations({ teamLeadId: 'me' }, { enabled });
  const dl = asDisciplineLead.data ?? [];
  const tl = asTeamLead.data ?? [];
  return {
    isLead: dl.length + tl.length > 0,
    // Same "needs action" rules as DisciplineLeadInboxPageContent.
    needsAction: [
      ...dl.filter((ev) => DL_ACTION_STATUSES.includes(ev.status)),
      ...tl.filter((ev) => ev.status === 'SELF_ASSESSED'),
    ],
    query: {
      isLoading: asDisciplineLead.isLoading || asTeamLead.isLoading,
      isError: asDisciplineLead.isError || asTeamLead.isError,
      refetch: () => {
        void asDisciplineLead.refetch();
        void asTeamLead.refetch();
      },
    },
  };
}

const DL_ACTION_STATUSES: readonly EvaluationStatus[] = ['TEAM_LEAD_ASSESSED', 'DISPUTED'];

/** Discipline / team leads: evaluations of other people waiting on me. */
export function EvaluationInboxWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const { needsAction: items, query } = useLeadEvaluations(enabled);

  return (
    <OverviewCard
      title={t(`${HOME}.evaluationInbox.title`)}
      icon={<ListChecks size={18} strokeWidth={1.9} />}
      tone={items.length > 0 ? 'warn' : 'info'}
      viewAllHref="/hr/evaluations/inbox"
      query={query}
      isEmpty={items.length === 0}
      emptyState={
        <OverviewEmptyState
          icon={ListChecks}
          title={t(`${HOME}.evaluationInbox.empty`)}
        />
      }
    >
      <div>
        <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
          {t(`${HOME}.evaluationInbox.countLabel`)}
        </p>
        <p className="m-0 mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
          {formatCount(items.length, locale)}
        </p>
      </div>
      <ul className="m-0 mt-auto flex flex-col p-0">
        {items.slice(0, 3).map((item) => (
          <li key={item.id} className="list-none">
            <Link
              href={`/hr/evaluations/${item.id}`}
              className="flex items-center justify-between gap-3 border-b border-slate-100 py-2.5 text-inherit no-underline last:border-b-0 last:pb-0 transition-colors hover:bg-slate-50/80 -mx-1 rounded-lg px-1"
            >
              <span className="truncate text-sm font-medium text-slate-900">
                {formatUserName(item.employee)}
              </span>
              <span className="shrink-0 text-xs text-slate-500">
                {t(`${HOME}.evaluation.cycle`, {
                  quarter: item.cycle.quarter,
                  year: item.cycle.year,
                })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </OverviewCard>
  );
}

/** HR: active contracts ending within 90 days (server window), nearest first. */
export function ContractsExpiringWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useEmployeeContracts(
    { page: 1, limit: 50, expiringSoon: true },
    enabled,
  );
  const contracts = [...(query.data?.data ?? [])]
    .filter((contract) => contract.endDate)
    .sort((a, b) => (a.endDate ?? '').localeCompare(b.endDate ?? ''));
  const total = query.data?.meta.total ?? 0;

  return (
    <WidgetCard
      title={t(`${HOME}.contracts.title`)}
      icon={<FileSignature {...ICON} />}
      span={6}
      viewAllHref="/hr/employee-contract"
      query={query}
      isEmpty={contracts.length === 0}
      emptyLabel={t(`${HOME}.contracts.empty`)}
    >
      <WidgetFigure
        label={t(`${HOME}.contracts.countLabel`)}
        value={formatCount(total, locale)}
      />
      <ul className="dv2-list">
        {contracts.slice(0, 5).map((contract) => {
          const days = daysUntil(contract.endDate ?? '');
          return (
            <li key={contract.id}>
              <Link
                href={`/hr/employee-contract/${contract.id}`}
                className="dv2-list-row"
              >
                <span className="dv2-list-main">
                  <span className="dv2-list-title">
                    {formatEmployeeContractEmployeeName(contract.employee)}
                  </span>
                  <span className="dv2-list-sub">
                    {formatShortDate(contract.endDate ?? '', locale)}
                  </span>
                </span>
                <span
                  className={`dv2-list-meta ${days <= 30 ? 'dv2-list-meta--urgent' : ''}`}
                >
                  {days <= 0
                    ? t(`${HOME}.contracts.endsToday`)
                    : t(`${HOME}.contracts.daysLeft`, { count: days })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </WidgetCard>
  );
}

const MONTH_STATUS_VARIANT: Record<AttendanceMonthStatus, StatusBadgeVariant> = {
  PENDING_REVIEW: 'warning',
  REVIEWED: 'info',
  APPROVED: 'success',
  UNLOCKED: 'orange',
};

/** HR: this month's attendance import and its monthly approval state. */
export function AttendanceReviewWidget({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const { month, year } = addisParts();
  const historyQuery = useAttendanceImportHistory(enabled);
  const approvalQuery = useAttendanceMonthlyApproval(month, year, enabled);
  const batch = (historyQuery.data ?? []).find(
    (item) => item.month === month && item.year === year,
  );
  const approval = approvalQuery.data ?? null;
  const period = formatMonthYear(month, year, locale);

  return (
    <WidgetCard
      title={t(`${HOME}.attendanceReview.title`)}
      icon={<UserCheck {...ICON} />}
      span={6}
      viewAllHref="/hr/attendance"
      query={{
        isLoading: historyQuery.isLoading || approvalQuery.isLoading,
        isError: historyQuery.isError || approvalQuery.isError,
        refetch: () => {
          void historyQuery.refetch();
          void approvalQuery.refetch();
        },
      }}
    >
      <p className="dv2-label m-0">{period}</p>
      <div className="dv2-stat-row">
        <div className="dv2-figure">
          <p className="dv2-hint m-0">{t(`${HOME}.attendanceReview.import`)}</p>
          <p className="dv2-strong m-0">
            {batch
              ? t(`${HOME}.attendanceReview.imported`, {
                  date: formatShortDate(batch.importedAt, locale),
                  rows: formatCount(batch.matchedRows, locale),
                })
              : t(`${HOME}.attendanceReview.notImported`)}
          </p>
        </div>
        <div className="dv2-figure">
          <p className="dv2-hint m-0">{t(`${HOME}.attendanceReview.approval`)}</p>
          {approval ? (
            <StatusBadge
              label={t(`pages.hr.attendance.review.status.${approval.status}`)}
              variant={MONTH_STATUS_VARIANT[approval.status] ?? 'default'}
            />
          ) : (
            <p className="dv2-strong m-0">{t(`${HOME}.attendanceReview.noApproval`)}</p>
          )}
        </div>
      </div>
      {batch ? (
        <Link
          href={`/hr/attendance/review/${month}/${year}`}
          className="dv2-button"
        >
          {t(`${HOME}.attendanceReview.open`)}
        </Link>
      ) : null}
    </WidgetCard>
  );
}
