// UI polish pass - styles only, no logic changes

'use client';

import { CalendarOutlined, FlagOutlined } from '@ant-design/icons';
import KPICard from '@/components/ui/KPICard/KPICard';
import { layout } from '@/lib/theme/layout';
import { tokens } from '@/lib/theme/tokens';
import type { ScheduleMetrics } from '@/lib/utils/schedule-metrics';
import { formatScheduleVariance } from '@/lib/utils/schedule-metrics';

export default function ScheduleKpiBar({
  metrics,
}: {
  metrics: ScheduleMetrics;
}): React.ReactNode {
  const variance = metrics.scheduleVariancePct;
  const varianceIconColor =
    variance === null
      ? tokens.colorTextSecondary
      : variance >= 0
        ? tokens.colorGreen600
        : tokens.colorRed600;
  const varianceIconBg =
    variance === null
      ? tokens.colorGray50
      : variance >= 0
        ? tokens.colorGreen50
        : tokens.colorRed50;

  return (
    <section className={`${layout.cardGrid} grid-cols-2`}>
      <KPICard
        label="Actual progress"
        value={
          metrics.actualProgressPct !== null
            ? `${metrics.actualProgressPct}%`
            : '-'
        }
        icon={CalendarOutlined}
        iconBg={tokens.colorGreen50}
        iconColor={tokens.colorGreen600}
      />
      <KPICard
        label="Schedule variance"
        value={formatScheduleVariance(variance)}
        icon={FlagOutlined}
        iconBg={varianceIconBg}
        iconColor={varianceIconColor}
      />
    </section>
  );
}
