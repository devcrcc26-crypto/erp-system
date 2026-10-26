'use client';

import { RotateCcw } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { WidgetQueryState } from '../WidgetCard';
import { OverviewStatSkeleton } from './overview/OverviewStatCard';

const HOME = 'pages.dashboard.home';

/**
 * Metric strip shell: loading skeletons, a retryable error banner, or the
 * OverviewStatCard children. Column count drives the responsive grid.
 */
export function MetricStrip({
  query,
  label,
  columns = 4,
  children,
}: {
  query: WidgetQueryState;
  label: string;
  columns?: 3 | 4;
  children: React.ReactNode;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const grid =
    columns === 3
      ? 'grid-cols-1 gap-4 sm:grid-cols-3'
      : 'grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4';

  if (query.isError) {
    return (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rose-200/70 bg-rose-50 px-5 py-4 text-sm text-rose-700"
      >
        <p className="m-0">{t(`${HOME}.loadFailed`)}</p>
        <button
          type="button"
          onClick={() => void query.refetch()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-rose-700 ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-500"
        >
          <RotateCcw size={14} aria-hidden />
          {t(`${HOME}.retry`)}
        </button>
      </div>
    );
  }

  return (
    <ul
      aria-label={label}
      aria-busy={query.isLoading || undefined}
      className={`m-0 grid p-0 ${grid}`}
    >
      {query.isLoading
        ? Array.from({ length: columns }, (_, key) => (
            <OverviewStatSkeleton key={key} />
          ))
        : children}
    </ul>
  );
}

/** @deprecated Prefer MetricStrip — kept for any leftover KPI consumers. */
export function KpiStripShell({
  query,
  label,
  columns = 4,
  children,
}: {
  query: WidgetQueryState;
  label: string;
  columns?: 3 | 4;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <MetricStrip query={query} label={label} columns={columns}>
      {children}
    </MetricStrip>
  );
}
