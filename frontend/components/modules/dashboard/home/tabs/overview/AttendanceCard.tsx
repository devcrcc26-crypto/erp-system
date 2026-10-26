'use client';

import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { CalendarX2, Upload, UserCheck } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { DashboardOperationalStats } from '@/lib/api/reporting.types';
import type { WidgetQueryState } from '../../WidgetCard';
import { formatCount } from '../../format';
import OverviewCard, { TonePill } from './OverviewCard';
import OverviewEmptyState from './OverviewEmptyState';
import { TONE, type OverviewTone } from './overview-tokens';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

/** Labelled progress bar with a soft neutral track and a fraction badge. */
export function ProgressRow({
  label,
  current,
  total,
  tone = 'ok',
  locale,
}: {
  label: string;
  current: number;
  total: number;
  tone?: OverviewTone;
  locale: string;
}): React.ReactNode {
  const reduceMotion = useReducedMotion();
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-md bg-slate-50 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-slate-700 ring-1 ring-inset ring-slate-200/70">
            {formatCount(current, locale)}
            <span className="mx-0.5 text-slate-400">/</span>
            {formatCount(total, locale)}
          </span>
          <span className="w-9 text-right text-xs tabular-nums text-slate-500">{percent}%</span>
        </span>
      </div>
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-slate-100"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={`${current} of ${total}`}
      >
        <motion.span
          className={`block h-full rounded-full ${TONE[tone].fill}`}
          initial={reduceMotion ? false : { width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
    </div>
  );
}

/**
 * Attendance this month: import + approval status pills, two progress rows
 * (submitted / approved) and an import CTA while nothing has been imported.
 */
export default function AttendanceCard({
  stats,
  query,
  canImport,
}: {
  stats: DashboardOperationalStats | undefined;
  query: WidgetQueryState;
  canImport: boolean;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const attendance = stats?.attendance ?? null;

  const importTone: OverviewTone =
    attendance?.importStatus === 'imported' ? 'ok' : 'neutral';
  const approvalTone: OverviewTone =
    attendance?.approvalStatus === 'approved'
      ? 'ok'
      : attendance?.approvalStatus === 'in_progress'
        ? 'warn'
        : 'neutral';

  return (
    <OverviewCard
      title={t(`${STATS}.attendance.title`)}
      subtitle={attendance?.month}
      icon={<UserCheck size={18} strokeWidth={1.9} />}
      tone="info"
      viewAllHref="/hr/attendance"
      query={query}
      isEmpty={!attendance}
      emptyState={
        <OverviewEmptyState
          icon={CalendarX2}
          title={t(`${HOME}.overview.noAttendance`)}
          action={
            canImport ? (
              <Link
                href="/hr/attendance"
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <Upload size={14} aria-hidden />
                {t(`${STATS}.attendance.importAction`)}
              </Link>
            ) : undefined
          }
        />
      }
    >
      {attendance ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <TonePill tone={importTone}>
              {t(`${STATS}.attendance.import.${attendance.importStatus}`)}
            </TonePill>
            <TonePill tone={approvalTone}>
              {t(`${STATS}.attendance.approval.${attendance.approvalStatus}`)}
            </TonePill>
          </div>

          <div className="flex flex-col gap-5">
            <ProgressRow
              label={t(`${STATS}.attendance.submitted`)}
              current={attendance.submittedCount}
              total={attendance.totalEmployees}
              tone="ok"
              locale={locale}
            />
            <ProgressRow
              label={t(`${STATS}.attendance.approved`)}
              current={attendance.approvedCount}
              total={attendance.totalEmployees}
              tone="info"
              locale={locale}
            />
          </div>

          {canImport && attendance.importStatus === 'not_imported' ? (
            <div className="mt-auto flex items-center justify-between gap-3 rounded-xl bg-emerald-50/70 px-4 py-3 ring-1 ring-inset ring-emerald-100">
              <p className="m-0 text-xs text-emerald-800">
                {t(`${HOME}.overview.attendanceImportHint`)}
              </p>
              <Link
                href="/hr/attendance"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 ring-1 ring-inset ring-emerald-200 transition-colors hover:bg-emerald-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
              >
                <Upload size={14} aria-hidden />
                {t(`${STATS}.attendance.importAction`)}
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </OverviewCard>
  );
}
