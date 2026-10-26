'use client';

import { Timer } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { DashboardOperationalStats } from '@/lib/api/reporting.types';
import type { WidgetQueryState } from '../../WidgetCard';
import { formatCount } from '../../format';
import OverviewCard from './OverviewCard';
import { TONE } from './overview-tokens';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

/** Company overtime snapshot for the Operations tab. */
export default function OvertimeOpsCard({
  stats,
  query,
}: {
  stats: DashboardOperationalStats | undefined;
  query: WidgetQueryState;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const overtime = stats?.overtime;
  const pending = overtime?.pendingApprovalCount ?? 0;

  return (
    <OverviewCard
      title={t(`${STATS}.overtime.title`)}
      icon={<Timer size={18} strokeWidth={1.9} />}
      tone={pending > 0 ? 'urgent' : 'ok'}
      viewAllHref="/hr/overtime"
      query={query}
    >
      {overtime ? (
        <>
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {t(`${STATS}.overtime.totalHours`)}
            </p>
            <p className="m-0 mt-1 text-[32px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
              {formatCount(overtime.totalHours, locale)}
            </p>
          </div>
          <ul className="m-0 mt-auto grid grid-cols-3 gap-3 p-0">
            {(
              [
                {
                  label: t(`${STATS}.overtime.pending`),
                  value: overtime.pendingApprovalCount,
                  tone: pending > 0 ? ('urgent' as const) : null,
                },
                {
                  label: t(`${STATS}.overtime.approved`),
                  value: overtime.approvedCount,
                  tone: null,
                },
                {
                  label: t(`${STATS}.overtime.employees`),
                  value: overtime.employeesWithOT,
                  tone: null,
                },
              ] satisfies ReadonlyArray<{
                label: string;
                value: number;
                tone: 'urgent' | null;
              }>
            ).map((row) => (
              <li
                key={row.label}
                className="list-none rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
              >
                <p className="m-0 truncate text-[11px] font-medium text-slate-500">
                  {row.label}
                </p>
                <p
                  className={`m-0 mt-1 text-lg font-semibold leading-none tabular-nums ${
                    row.tone ? TONE[row.tone].value : 'text-slate-900'
                  }`}
                >
                  {formatCount(row.value, locale)}
                </p>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </OverviewCard>
  );
}
