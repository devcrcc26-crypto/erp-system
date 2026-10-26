'use client';

import { Button, Skeleton } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { WidgetQueryState } from '../WidgetCard';

const HOME = 'pages.dashboard.home';

/**
 * KPI tile strip with its own loading skeleton and retryable error state, so
 * a failing stats call never blanks the rest of the tab.
 */
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
  const { t } = useEpcTranslation();
  const className = `dv2-kpi-strip${columns === 3 ? ' dv2-kpi-strip--3' : ''}`;

  if (query.isLoading) {
    return (
      <ul className={className} aria-label={label} aria-busy="true">
        {Array.from({ length: columns }, (_, key) => (
          <li key={key}>
            <div className="dv2-kpi">
              <Skeleton active title={false} paragraph={{ rows: 2 }} />
            </div>
          </li>
        ))}
      </ul>
    );
  }

  if (query.isError) {
    return (
      <div className="dv2-error" role="alert">
        <p className="m-0">{t(`${HOME}.loadFailed`)}</p>
        <Button size="small" onClick={() => void query.refetch()}>
          {t(`${HOME}.retry`)}
        </Button>
      </div>
    );
  }

  return (
    <ul className={className} aria-label={label}>
      {children}
    </ul>
  );
}
