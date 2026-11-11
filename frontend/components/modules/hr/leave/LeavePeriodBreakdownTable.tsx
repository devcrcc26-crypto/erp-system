'use client';

import { useMemo } from 'react';
import type { ColumnsType } from 'antd/es/table';
import DataTable from '@/components/ui/DataTable/DataTable';
import StatusBadge from '@/components/ui/StatusBadge/StatusBadge';
import type { StatusBadgeVariant } from '@/components/ui/StatusBadge/StatusBadge';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  DayBreakdownItem,
  DayBreakdownType,
} from '@/lib/api/work-schedule.types';
import { formatProjectDate } from '@/lib/utils/project-display';

function dayTypeVariant(type: DayBreakdownType): StatusBadgeVariant {
  switch (type) {
    case 'working':
      return 'success';
    case 'half':
      return 'orange';
    case 'holiday':
      return 'info';
    case 'weekend':
    default:
      return 'default';
  }
}

function weekdayLabel(
  value: string,
  t: (key: string) => string,
): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) {
    return '-';
  }
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  const keys = [
    'hr.workSchedule.day0',
    'hr.workSchedule.day1',
    'hr.workSchedule.day2',
    'hr.workSchedule.day3',
    'hr.workSchedule.day4',
    'hr.workSchedule.day5',
    'hr.workSchedule.day6',
  ] as const;
  return t(keys[date.getUTCDay()] ?? keys[0]);
}

/**
 * Compact table for leave day breakdown (weekday, date, type, counted days).
 */
export default function LeavePeriodBreakdownTable({
  breakdown,
  totalDays,
  showTotal = false,
}: {
  breakdown: DayBreakdownItem[];
  totalDays?: number;
  showTotal?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const columns: ColumnsType<DayBreakdownItem> = useMemo(
    () => [
      {
        title: t('hr.form.previewWeekday'),
        key: 'weekday',
        width: 120,
        render: (_value, row) => weekdayLabel(row.date, t),
      },
      {
        title: t('hr.form.previewDate'),
        dataIndex: 'date',
        key: 'date',
        width: 140,
        render: (value: string) => formatProjectDate(value),
      },
      {
        title: t('hr.form.previewType'),
        key: 'type',
        render: (_value, row) => (
          <StatusBadge
            label={
              row.type === 'holiday' && row.holidayName
                ? row.holidayName
                : t(`hr.dayType.${row.type}`)
            }
            variant={dayTypeVariant(row.type)}
          />
        ),
      },
      {
        title: t('hr.form.previewCounted'),
        dataIndex: 'weight',
        key: 'weight',
        width: 100,
        align: 'right',
        render: (value: number) => (
          <span className="tabular-nums">{value}</span>
        ),
      },
    ],
    [t],
  );

  if (breakdown.length === 0) {
    return null;
  }

  return (
    <div className="min-w-0">
      {showTotal && totalDays != null ? (
        <p className="mb-2 text-sm font-medium">
          {t('hr.form.runningTotal')}:{' '}
          <span className="tabular-nums">{totalDays}</span>
        </p>
      ) : null}
      <p className="erp-users-cell-sub mb-2">{t('hr.form.periodPreview')}</p>
      <DataTable<DayBreakdownItem>
        rowKey="date"
        size="small"
        className="erp-pro-table erp-users-table"
        columns={columns}
        dataSource={breakdown}
        pagination={false}
        scroll={{ x: 420 }}
      />
    </div>
  );
}
