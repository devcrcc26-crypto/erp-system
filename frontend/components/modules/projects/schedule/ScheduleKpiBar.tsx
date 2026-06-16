'use client';

import {
  CalendarOutlined,
  FlagOutlined,
  LineChartOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import KPICard from '@/components/ui/KPICard/KPICard';
import { layout } from '@/lib/theme/layout';
import type { ScheduleMetrics } from '@/lib/utils/schedule-metrics';
import { formatScheduleVariance } from '@/lib/utils/schedule-metrics';

export default function ScheduleKpiBar({
  metrics,
}: {
  metrics: ScheduleMetrics;
}): React.ReactNode {
  const variance = metrics.scheduleVariancePct;
  const varianceColor =
    variance === null
      ? '#64748b'
      : variance >= 0
        ? '#16a34a'
        : '#dc2626';

  return (
    <section className={`${layout.cardGrid} grid-cols-2 xl:grid-cols-4`}>
      <KPICard
        label="Planned progress"
        value={
          metrics.plannedProgressPct !== null
            ? `${metrics.plannedProgressPct}%`
            : '—'
        }
        icon={LineChartOutlined}
        iconBg="#dbeafe"
        iconColor="#2563eb"
      />
      <KPICard
        label="Actual progress"
        value={
          metrics.actualProgressPct !== null
            ? `${metrics.actualProgressPct}%`
            : '—'
        }
        icon={CalendarOutlined}
        iconBg="#dcfce7"
        iconColor="#16a34a"
      />
      <KPICard
        label="Schedule variance"
        value={formatScheduleVariance(variance)}
        icon={FlagOutlined}
        iconBg="#fef3c7"
        iconColor={varianceColor}
      />
      <KPICard
        label="Critical tasks"
        value={String(metrics.criticalCount)}
        icon={WarningOutlined}
        iconBg="#fee2e2"
        iconColor="#dc2626"
      />
    </section>
  );
}
