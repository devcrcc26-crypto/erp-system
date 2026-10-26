'use client';

import Link from 'next/link';
import { Banknote, Timer, UserRound } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { useDashboardOperationalStats } from '@/lib/query/dashboard';
import { DashboardStackedBarChart } from '../charts/DashboardChart';
import {
  KpiTile,
  PerDiemStatsCard,
  Pill,
  STATS,
  Stat,
  type Tone,
} from '../OperationalStatsWidgets';
import WidgetCard from '../WidgetCard';
import { formatCount } from '../format';
import { KpiStripShell } from './TabParts';

const HOME = 'pages.dashboard.home';
const ICON = { size: 18, strokeWidth: 1.9 } as const;

const KNOWN_PAYROLL_STATUSES: readonly string[] = [
  'DRAFT',
  'REVIEWED',
  'SUBMITTED',
  'APPROVED',
  'GM_APPROVED',
  'PAID',
  'CANCELLED',
];

function payrollTone(status: string): Tone | undefined {
  if (status === 'PAID' || status === 'GM_APPROVED') return 'ok';
  if (status === 'CANCELLED') return 'urgent';
  if (status === 'DRAFT') return undefined;
  return 'warn';
}

/** HR "Payroll & OT": overtime totals and split, per diem, payroll run state. */
export default function PayrollOtTab({ enabled }: { enabled: boolean }): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const query = useDashboardOperationalStats(enabled);
  const stats = query.data;
  const pendingOt = stats?.overtime.pendingApprovalCount ?? 0;
  const payroll = stats?.payroll ?? null;

  return (
    <>
      <KpiStripShell
        query={query}
        label={t(`${STATS}.overtime.title`)}
        columns={3}
      >
        <KpiTile
          icon={Timer}
          label={t(`${STATS}.overtime.totalHours`)}
          value={formatCount(stats?.overtime.totalHours ?? 0, locale)}
          href="/hr/overtime"
        />
        <KpiTile
          icon={UserRound}
          label={t(`${STATS}.overtime.employees`)}
          value={formatCount(stats?.overtime.employeesWithOT ?? 0, locale)}
        />
        <KpiTile
          icon={Timer}
          label={t(`${STATS}.overtime.pending`)}
          value={formatCount(pendingOt, locale)}
          tone={pendingOt > 0 ? 'urgent' : undefined}
          href="/hr/overtime"
        />
      </KpiStripShell>

      <WidgetCard
        title={t(`${HOME}.payrollOt.otByEmployee`)}
        icon={<Timer {...ICON} />}
        span={12}
        viewAllHref="/hr/overtime"
        query={query}
      >
        <DashboardStackedBarChart
          data={stats?.overtimeByEmployee ?? []}
          seriesLabels={{
            normal: t(`${HOME}.charts.normal`),
            evening: t(`${HOME}.charts.evening`),
            sunday: t(`${HOME}.charts.sunday`),
            holiday: t(`${HOME}.charts.holiday`),
          }}
          emptyLabel={t(`${HOME}.payrollOt.otByEmployeeEmpty`)}
          ariaLabel={t(`${HOME}.payrollOt.otByEmployee`)}
        />
      </WidgetCard>

      <div className="dv2-row">
        <PerDiemStatsCard enabled={enabled} span={6} />

        <WidgetCard
          title={t(`${HOME}.payrollOt.payrollStatus`)}
          icon={<Banknote {...ICON} />}
          span={6}
          viewAllHref="/hr/payroll"
          query={query}
          isEmpty={!payroll}
          emptyLabel={t(`${HOME}.payrollOt.noPayroll`)}
        >
          {payroll ? (
            <>
              <div className="dv2-figure">
                <p className="dv2-label m-0">{t(`${HOME}.payrollOt.status`)}</p>
                <Pill tone={payrollTone(payroll.status)}>
                  {KNOWN_PAYROLL_STATUSES.includes(payroll.status)
                    ? t(`hr.payroll.status.${payroll.status}`)
                    : payroll.status}
                </Pill>
              </div>
              <div className="dv2-stat-row">
                <Stat
                  label={t(`${HOME}.payrollOt.employeesInRun`)}
                  value={payroll.totalEmployees}
                  locale={locale}
                />
                <Stat
                  label={t(`${HOME}.payrollOt.flagged`)}
                  value={payroll.flaggedCount}
                  tone={payroll.flaggedCount > 0 ? 'urgent' : undefined}
                  locale={locale}
                />
              </div>
              <Link href="/hr/payroll" className="dv2-button">
                {t(`${HOME}.payrollOt.openPayroll`)}
              </Link>
            </>
          ) : null}
        </WidgetCard>
      </div>
    </>
  );
}
