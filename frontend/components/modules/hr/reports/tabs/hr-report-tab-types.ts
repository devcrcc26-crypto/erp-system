import type { WidgetQueryState } from '@/components/modules/dashboard/home/WidgetCard';
import type { HrReport } from '@/lib/api/reporting.types';

export interface HrReportTabProps {
  report: HrReport;
  query: WidgetQueryState;
  isCompact: boolean;
  /** Default open for collapsible detail tables (HR Manager). */
  tablesOpenByDefault: boolean;
}
