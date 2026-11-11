'use client';

import OverviewCard from '@/components/modules/dashboard/home/tabs/overview/OverviewCard';
import OverviewEmptyState from '@/components/modules/dashboard/home/tabs/overview/OverviewEmptyState';
import type { WidgetQueryState } from '@/components/modules/dashboard/home/WidgetCard';
import type { OverviewTone } from '@/components/modules/dashboard/home/tabs/overview/overview-tokens';
import { PAGE } from '@/components/modules/hr/reports/hr-report-tabs';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Overview-style card for an HR report section (chart or table).
 * Pass `flush` for edge-to-edge tables inside the card body.
 */
export default function ReportSectionCard({
  title,
  subtitle,
  icon,
  tone = 'neutral',
  query,
  isEmpty = false,
  emptyLabel,
  action,
  children,
  className = '',
  flush = false,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  tone?: OverviewTone;
  query: WidgetQueryState;
  isEmpty?: boolean;
  emptyLabel?: string;
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  /** Remove body padding so tables run full card width. */
  flush?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <OverviewCard
      title={title}
      subtitle={subtitle}
      icon={icon}
      tone={tone}
      query={query}
      isEmpty={isEmpty}
      emptyState={
        <OverviewEmptyState
          title={emptyLabel ?? t(`${PAGE}.chartEmpty`)}
        />
      }
      action={action}
      className={`w-full min-w-0 ${flush ? 'erp-hr-report-table-card' : ''} ${className}`.trim()}
      bodyClassName={flush ? 'gap-0 p-0' : 'gap-4 p-5'}
    >
      {flush ? (
        <div className="erp-hr-report-table-flush w-full min-w-0 max-w-none overflow-x-auto [&_.ant-table-wrapper]:!w-full [&_.ant-table]:!w-full [&_.ant-table-container]:!w-full [&_.ant-table-content]:!w-full [&_.ant-table-content>table]:!w-full">
          {children}
        </div>
      ) : (
        children
      )}
    </OverviewCard>
  );
}
