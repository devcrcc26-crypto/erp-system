'use client';

import type { ReactNode } from 'react';
import { Alert, Button, DatePicker, Select } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { Dayjs } from 'dayjs';
import LeavePeriodBreakdownTable from '@/components/modules/hr/leave/LeavePeriodBreakdownTable';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  LeaveDayPortion,
  LeavePeriodInput,
  PreviewDaysResult,
} from '@/lib/api/work-schedule.types';

export interface LeavePeriodRow {
  id: string;
  range: [Dayjs, Dayjs] | null;
  dayPortion: LeaveDayPortion;
}

export function newLeavePeriodId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyLeavePeriod(): LeavePeriodRow {
  return { id: newLeavePeriodId(), range: null, dayPortion: 'FULL' };
}

export function leavePeriodsOverlap(periods: LeavePeriodRow[]): boolean {
  const ranges = periods
    .map((row) => row.range)
    .filter((range): range is [Dayjs, Dayjs] => Boolean(range));
  for (let i = 0; i < ranges.length; i += 1) {
    for (let j = i + 1; j < ranges.length; j += 1) {
      const a = ranges[i];
      const b = ranges[j];
      if (!a[1].isBefore(b[0], 'day') && !b[1].isBefore(a[0], 'day')) {
        return true;
      }
    }
  }
  return false;
}

export function completeLeaveRange(
  value: [Dayjs | null, Dayjs | null] | null,
): [Dayjs, Dayjs] | null {
  if (!value?.[0] || !value[1]) {
    return null;
  }
  return [value[0], value[1]];
}

export function toLeavePeriodInputs(
  periods: LeavePeriodRow[],
): LeavePeriodInput[] {
  return periods
    .filter((row): row is LeavePeriodRow & { range: [Dayjs, Dayjs] } =>
      Boolean(row.range?.[0] && row.range[1]),
    )
    .map((row) => ({
      startDate: row.range[0].format('YYYY-MM-DD'),
      endDate: row.range[1].format('YYYY-MM-DD'),
      dayPortion: row.dayPortion,
    }));
}

function isSingleDay(range: [Dayjs, Dayjs] | null): boolean {
  if (!range) {
    return false;
  }
  return range[0].isSame(range[1], 'day');
}

function formatLeaveChargeSummary(
  preview: PreviewDaysResult,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  const summary = preview.summary;
  if (!summary) {
    return t('hr.form.daysCharged', { days: preview.totalDays });
  }
  const parts: string[] = [];
  if (summary.workingDays > 0) {
    parts.push(t('hr.form.summaryWorking', { count: summary.workingDays }));
  }
  if (summary.halfDays > 0) {
    parts.push(t('hr.form.summaryHalf', { count: summary.halfDays }));
  }
  if (summary.weekendDays > 0) {
    parts.push(t('hr.form.summaryWeekend', { count: summary.weekendDays }));
  }
  if (summary.holidayDays > 0) {
    parts.push(t('hr.form.summaryHoliday', { count: summary.holidayDays }));
  }
  return t('hr.form.daysChargedDetail', {
    days: preview.totalDays,
    detail: parts.join(', '),
  });
}

/**
 * Multi-period date editor with half-day portions and work-schedule day preview.
 * Same behaviour as the new leave request form.
 */
export default function LeavePeriodsEditor({
  periods,
  onChange,
  preview,
  previewError,
  previewHint,
  children,
}: {
  periods: LeavePeriodRow[];
  onChange: (periods: LeavePeriodRow[]) => void;
  preview: PreviewDaysResult | null;
  previewError: string | null;
  /** Optional line under the charge summary (e.g. remaining balance). */
  previewHint?: ReactNode;
  /** Inserted between the period list and the preview (e.g. coverage notice). */
  children?: ReactNode;
}): ReactNode {
  const { t } = useEpcTranslation();

  return (
    <div className="erp-leave-period-editor mb-4">
      <p className="erp-leave-period-editor-label">{t('hr.form.periods')}</p>
      <div className="erp-leave-period-editor-list">
        {periods.map((period, index) => (
          <div key={period.id} className="erp-leave-period-editor-row">
            <DatePicker.RangePicker
              className="w-full"
              format="DD/MM/YYYY"
              value={period.range}
              onChange={(value) => {
                const nextRange = completeLeaveRange(
                  value as [Dayjs | null, Dayjs | null] | null,
                );
                onChange(
                  periods.map((row) =>
                    row.id === period.id
                      ? {
                          ...row,
                          range: nextRange,
                          dayPortion:
                            nextRange && isSingleDay(nextRange)
                              ? row.dayPortion
                              : 'FULL',
                        }
                      : row,
                  ),
                );
              }}
            />
            {isSingleDay(period.range) ? (
              <Select
                className="w-full"
                value={period.dayPortion}
                options={[
                  { value: 'FULL', label: t('hr.form.dayPortionFull') },
                  { value: 'MORNING', label: t('hr.form.dayPortionMorning') },
                  {
                    value: 'AFTERNOON',
                    label: t('hr.form.dayPortionAfternoon'),
                  },
                ]}
                onChange={(value: LeaveDayPortion) => {
                  onChange(
                    periods.map((row) =>
                      row.id === period.id
                        ? { ...row, dayPortion: value }
                        : row,
                    ),
                  );
                }}
              />
            ) : null}
            <div className="erp-leave-period-editor-actions">
              {periods.length > 1 ? (
                <Button
                  type="text"
                  danger
                  icon={<DeleteOutlined />}
                  aria-label={t('hr.form.removePeriod')}
                  onClick={() =>
                    onChange(periods.filter((row) => row.id !== period.id))
                  }
                />
              ) : null}
              {index === periods.length - 1 ? (
                <Button
                  icon={<PlusOutlined />}
                  onClick={() =>
                    onChange([...periods, createEmptyLeavePeriod()])
                  }
                >
                  {t('hr.form.addPeriod')}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {children}
      {previewError ? (
        <Alert type="error" showIcon title={previewError} className="mt-3" />
      ) : preview ? (
        <div className="erp-leave-preview-panel mt-3">
          <p className="erp-leave-preview-title">
            {formatLeaveChargeSummary(preview, t)}
          </p>
          {previewHint}
          <LeavePeriodBreakdownTable
            breakdown={preview.periods.flatMap((row) => row.breakdown)}
            totalDays={preview.totalDays}
            showTotal
          />
        </div>
      ) : null}
    </div>
  );
}
