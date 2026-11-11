'use client';

import { useId } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { WidgetQueryState } from '../../WidgetCard';
import { TONE, type OverviewTone } from './overview-tokens';

const HOME = 'pages.dashboard.home';

/**
 * Card shell for Overview widgets: rounded-2xl surface, hairline border, soft
 * ambient shadow, header with a tinted icon badge, and exactly one body state
 * (skeleton / error / empty / content). `h-full` keeps side-by-side cards level.
 */
export default function OverviewCard({
  title,
  subtitle,
  icon,
  tone = 'ok',
  viewAllHref,
  query,
  isEmpty = false,
  emptyState,
  action,
  children,
  className = '',
  bodyClassName = 'p-5',
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  tone?: OverviewTone;
  viewAllHref?: string;
  query: WidgetQueryState;
  isEmpty?: boolean;
  emptyState?: React.ReactNode;
  /** Optional element rendered to the right of the title (e.g. pills). */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Body padding/layout; use `p-0` for edge-to-edge tables. */
  bodyClassName?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const headingId = useId();
  const reduceMotion = useReducedMotion();

  let body: React.ReactNode;
  if (query.isLoading) {
    body = <CardSkeleton />;
  } else if (query.isError) {
    body = (
      <div
        role="alert"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-200/70 bg-rose-50 px-4 py-3 text-sm text-rose-700"
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
  } else if (isEmpty) {
    body = emptyState ?? null;
  } else {
    body = children;
  }

  return (
    <motion.section
      aria-labelledby={headingId}
      aria-busy={query.isLoading || undefined}
      initial={reduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      className={`flex h-full min-w-0 flex-col rounded-2xl border border-slate-100 bg-white shadow-sm transition-all duration-200 hover:border-slate-200 hover:shadow-md ${className}`.trim()}
    >
      <header className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
        <span
          aria-hidden
          className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${TONE[tone].badge}`}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <h2
            id={headingId}
            className="m-0 truncate text-[15px] font-semibold leading-6 text-slate-900"
          >
            {title}
          </h2>
          {subtitle ? (
            <p className="m-0 mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
          ) : null}
        </div>
        {action}
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="inline-flex shrink-0 items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
          >
            {t(`${HOME}.viewAll`)}
            <span className="sr-only">{`: ${title}`}</span>
            <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
          </Link>
        ) : null}
      </header>
      <div className={`flex flex-1 flex-col gap-4 ${bodyClassName}`.trim()}>
        {body}
      </div>
    </motion.section>
  );
}

/** Soft pulse placeholder matching the card's typical content rhythm. */
export function CardSkeleton({ rows = 3 }: { rows?: number }): React.ReactNode {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Loading">
      <div className="h-7 w-24 animate-pulse rounded-lg bg-slate-100" />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="h-3.5 animate-pulse rounded-md bg-slate-100"
          style={{ width: `${88 - i * 14}%` }}
        />
      ))}
    </div>
  );
}

/** Small inline pill for statuses and trend hints. */
export function TonePill({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: OverviewTone;
  children: React.ReactNode;
  className?: string;
}): React.ReactNode {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-5 ring-1 ring-inset ${TONE[tone].pill} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
