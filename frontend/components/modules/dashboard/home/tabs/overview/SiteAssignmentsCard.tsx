'use client';

import { AlertTriangle, CalendarClock, MapPin, MapPinOff } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { DashboardOperationalStats } from '@/lib/api/reporting.types';
import type { WidgetQueryState } from '../../WidgetCard';
import { formatCount } from '../../format';
import OverviewCard from './OverviewCard';
import OverviewEmptyState from './OverviewEmptyState';
import { TONE, type OverviewTone } from './overview-tokens';

const HOME = 'pages.dashboard.home';
const STATS = `${HOME}.stats`;

function Row({
  icon: Icon,
  label,
  value,
  tone = 'neutral',
  locale,
}: {
  icon: typeof MapPin;
  label: string;
  value: number;
  tone?: OverviewTone;
  locale: string;
}): React.ReactNode {
  return (
    <li className="flex list-none items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
      <span className="flex min-w-0 items-center gap-3">
        <span
          aria-hidden
          className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${TONE[tone].badge}`}
        >
          <Icon size={15} strokeWidth={1.9} />
        </span>
        <span className="truncate text-sm font-medium text-slate-700">{label}</span>
      </span>
      <span
        className={`shrink-0 text-lg font-semibold leading-none tabular-nums ${
          tone === 'neutral' ? 'text-slate-900' : TONE[tone].value
        }`}
      >
        {formatCount(value, locale)}
      </span>
    </li>
  );
}

/** Site assignments: headline count plus 7-day / 30-day expiry rows. */
export default function SiteAssignmentsCard({
  stats,
  query,
}: {
  stats: DashboardOperationalStats | undefined;
  query: WidgetQueryState;
}): React.ReactNode {
  const { t, locale } = useEpcTranslation();
  const sites = stats?.siteAssignments ?? null;
  const exp7 = sites?.expiringIn7Days ?? 0;

  return (
    <OverviewCard
      title={t(`${STATS}.siteAssignments.title`)}
      icon={<MapPin size={18} strokeWidth={1.9} />}
      tone={exp7 > 0 ? 'warn' : 'info'}
      viewAllHref="/hr/site-assignments"
      query={query}
      isEmpty={!sites}
      emptyState={
        <OverviewEmptyState icon={MapPinOff} title={t(`${HOME}.overview.noSites`)} />
      }
    >
      {sites ? (
        <>
          <div>
            <p className="m-0 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              {t(`${STATS}.siteAssignments.current`)}
            </p>
            <p className="m-0 mt-1 text-[32px] font-semibold leading-none tracking-tight tabular-nums text-slate-900">
              {formatCount(sites.currentlyAssigned, locale)}
            </p>
          </div>
          <ul className="m-0 mt-auto flex flex-col gap-2 p-0">
            <Row
              icon={AlertTriangle}
              label={t(`${STATS}.siteAssignments.expiring7`)}
              value={sites.expiringIn7Days}
              tone={exp7 > 0 ? 'warn' : 'neutral'}
              locale={locale}
            />
            <Row
              icon={CalendarClock}
              label={t(`${STATS}.siteAssignments.expiring30`)}
              value={sites.expiringIn30Days}
              tone="neutral"
              locale={locale}
            />
          </ul>
        </>
      ) : null}
    </OverviewCard>
  );
}
