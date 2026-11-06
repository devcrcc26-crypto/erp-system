'use client';

import { Select, Spin } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { ProfileContractPeriod } from '@/lib/utils/contract-period';
import { formatProjectDate } from '@/lib/utils/project-display';

function periodOptionLabel(
  period: ProfileContractPeriod,
  ongoingLabel: string,
): string {
  const rangeEnd = period.endDate
    ? formatProjectDate(period.endDate)
    : ongoingLabel;
  return `${period.contractNumber} · ${formatProjectDate(period.startDate)} – ${rangeEnd}`;
}

/**
 * Shared contract-period dropdown for profile / employee detail tab cards.
 */
export default function ProfileContractPeriodSelect({
  periods,
  value,
  onChange,
  loading = false,
  className = '',
}: {
  periods: ProfileContractPeriod[];
  value: string | null;
  onChange: (contractId: string) => void;
  loading?: boolean;
  className?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  if (loading && periods.length === 0) {
    return (
      <div className={`erp-leave-year-control ${className}`.trim()}>
        <span className="erp-leave-year-label">
          {t('hr.leave.contractPeriod')}
        </span>
        <Spin size="small" />
      </div>
    );
  }

  if (periods.length === 0) {
    return (
      <div className={`erp-leave-year-control ${className}`.trim()}>
        <span className="erp-leave-year-label">
          {t('hr.leave.contractPeriod')}
        </span>
        <span className="erp-users-cell-sub">
          {t('hr.leave.noContractPeriods')}
        </span>
      </div>
    );
  }

  return (
    <div className={`erp-leave-year-control ${className}`.trim()}>
      <span className="erp-leave-year-label">
        {t('hr.leave.contractPeriod')}
      </span>
      <Select
        size="small"
        className="erp-leave-year-select w-full max-sm:!min-w-0"
        value={value ?? undefined}
        placeholder={t('hr.leave.contractPeriodPlaceholder')}
        options={periods.map((period) => ({
          value: period.id,
          label: periodOptionLabel(period, t('hr.workSchedule.ongoing')),
        }))}
        onChange={(next: string) => {
          onChange(next);
        }}
      />
    </div>
  );
}
