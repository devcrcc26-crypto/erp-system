'use client';

import Link from 'next/link';
import { Banknote, CircleSlash2 } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { DashboardOperationalStats } from '@/lib/api/reporting.types';
import type { WidgetQueryState } from '../../WidgetCard';
import { formatCount } from '../../format';
import OverviewCard, { TonePill } from './OverviewCard';
import OverviewEmptyState from './OverviewEmptyState';
import { TONE, type OverviewTone } from './overview-tokens';

const HOME = 'pages.dashboard.home';

const KNOWN_PAYROLL_STATUSES: readonly string[] = [
  'DRAFT',
  'REVIEWED',
  'SUBMITTED',
  'APPROVED',
  'GM_APPROVED',
  'PAID',
  'CANCELLED',
];

function payrollTone(status: string): OverviewTone {
  if (status === 'PAID' || status === 'GM_APPROVED') return 'ok';
  if (status === 'CANCELLED') return 'urgent';
  if (status === 'DRAFT') return 'neutral';
  return 'warn';
}

/** Current-month payroll run: status pill, headcount in run, flagged count. */
export default function PayrollStatusCard({
  stats,
  query,
}: {
  stats: DashboardOperationalStats | undefined;
  query: WidgetQueryState;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const payroll = stats?.payroll ?? null;
  const tone = payroll ? payrollTone(payroll.status) : 'info';

  return (
    <OverviewCard
      title={t(`${HOME}.payrollOt.payrollStatus`)}
      icon={<Banknote size={18} strokeWidth={1.9} />}
      tone={tone}
      viewAllHref="/hr/payroll"
      query={query}
      isEmpty={!payroll}
      emptyState={
        <OverviewEmptyState
          icon={CircleSlash2}
          title={t(`${HOME}.payrollOt.noPayroll`)}
          description={t(`${HOME}.payrollOt.noPayrollHint`)}
        />
      }
    >
      {payroll ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {t(`${HOME}.payrollOt.status`)}
            </span>
            <TonePill tone={tone}>
              {KNOWN_PAYROLL_STATUSES.includes(payroll.status)
                ? t(`hr.payroll.status.${payroll.status}`)
                : payroll.status}
            </TonePill>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {t(`${HOME}.payrollOt.employeesInRun`)}
              </p>
              <p className="m-0 mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
                {formatCount(payroll.totalEmployees, locale)}
              </p>
            </div>
            <div>
              <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                {t(`${HOME}.payrollOt.flagged`)}
              </p>
              <p
                className={`m-0 mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${
                  payroll.flaggedCount > 0 ? TONE.urgent.value : 'text-slate-900'
                }`}
              >
                {formatCount(payroll.flaggedCount, locale)}
              </p>
            </div>
          </div>

          <div className="mt-auto">
            <Link
              href="/hr/payroll"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              {t(`${HOME}.payrollOt.openPayroll`)}
            </Link>
          </div>
        </>
      ) : null}
    </OverviewCard>
  );
}
