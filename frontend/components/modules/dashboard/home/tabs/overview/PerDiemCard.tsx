'use client';

import { Wallet, WalletCards } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { DashboardOperationalStats } from '@/lib/api/reporting.types';
import type { WidgetQueryState } from '../../WidgetCard';
import { formatCount } from '../../format';
import OverviewCard from './OverviewCard';
import OverviewEmptyState from './OverviewEmptyState';
import { TONE } from './overview-tokens';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

/** Per-diem queue: settlements awaiting submit vs claims awaiting approval. */
export default function PerDiemCard({
  stats,
  query,
}: {
  stats: DashboardOperationalStats | undefined;
  query: WidgetQueryState;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const perDiem = stats?.perDiem ?? null;
  const pendingApproval = perDiem?.pendingApproval ?? 0;

  return (
    <OverviewCard
      title={t(`${STATS}.perDiem.title`)}
      icon={<Wallet size={18} strokeWidth={1.9} />}
      tone={pendingApproval > 0 ? 'warn' : 'info'}
      viewAllHref="/hr/per-diem"
      query={query}
      isEmpty={!perDiem}
      emptyState={
        <OverviewEmptyState
          icon={WalletCards}
          title={t(`${HOME}.operations.noPerDiem`)}
        />
      }
    >
      {perDiem ? (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {t(`${STATS}.perDiem.pendingSettlement`)}
            </p>
            <p className="m-0 mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
              {formatCount(perDiem.pendingSettlement, locale)}
            </p>
          </div>
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {t(`${STATS}.perDiem.pendingApproval`)}
            </p>
            <p
              className={`m-0 mt-1 text-[28px] font-semibold leading-none tracking-tight tabular-nums ${
                pendingApproval > 0 ? TONE.warn.value : 'text-slate-900'
              }`}
            >
              {formatCount(perDiem.pendingApproval, locale)}
            </p>
          </div>
        </div>
      ) : null}
    </OverviewCard>
  );
}
