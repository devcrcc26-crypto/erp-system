'use client';

import { useId } from 'react';
import Link from 'next/link';
import { Button, Skeleton } from 'antd';
import { ChevronRight } from 'lucide-react';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

const HOME = 'pages.dashboard.home';

/** Columns a widget spans on the 12-column desktop grid. */
export type WidgetSpan = 4 | 6 | 12;

/** The slice of a React Query result a card needs to pick its state. */
export interface WidgetQueryState {
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly refetch: () => unknown;
}

/**
 * Shell for one dashboard widget: header (icon, title, optional figure,
 * "View all"), then exactly one of skeleton / error with retry / empty
 * message / content. Each widget owns its query, so one failure stays local.
 */
export default function WidgetCard({
  title,
  icon,
  span,
  viewAllHref,
  query,
  isEmpty = false,
  emptyLabel,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  span: WidgetSpan;
  viewAllHref?: string;
  query: WidgetQueryState;
  isEmpty?: boolean;
  emptyLabel?: string;
  children?: React.ReactNode;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const headingId = useId();

  let body: React.ReactNode;
  if (query.isLoading) {
    body = (
      <div role="status" aria-label={t(`${HOME}.loading`)}>
        <Skeleton active title={false} paragraph={{ rows: 3 }} />
      </div>
    );
  } else if (query.isError) {
    body = (
      <div className="dv2-error" role="alert">
        <p className="m-0">{t(`${HOME}.loadFailed`)}</p>
        <Button size="small" onClick={() => void query.refetch()}>
          {t(`${HOME}.retry`)}
        </Button>
      </div>
    );
  } else if (isEmpty) {
    body = <p className="dv2-empty m-0">{emptyLabel}</p>;
  } else {
    body = children;
  }

  return (
    <section
      className={`dv2-card dv2-span-${span}`}
      aria-labelledby={headingId}
    >
      <header className="dv2-card-header">
        <span className="dv2-card-icon" aria-hidden>
          {icon}
        </span>
        <h2 id={headingId} className="dv2-card-title">
          {title}
        </h2>
        {viewAllHref ? (
          <Link href={viewAllHref} className="dv2-view-all">
            {t(`${HOME}.viewAll`)}
            <span className="sr-only">{`: ${title}`}</span>
            <ChevronRight aria-hidden size={14} strokeWidth={2} />
          </Link>
        ) : null}
      </header>
      <div className="dv2-card-body">{body}</div>
    </section>
  );
}

/** Large tabular figure with a small uppercase label above it. */
export function WidgetFigure({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}): React.ReactNode {
  return (
    <div className="dv2-figure">
      <p className="dv2-label m-0">{label}</p>
      <p className="dv2-number m-0">{value}</p>
      {hint ? <p className="dv2-hint m-0">{hint}</p> : null}
    </div>
  );
}
