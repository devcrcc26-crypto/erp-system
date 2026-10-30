'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Form, Input } from 'antd';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { FormInstance } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import OvertimeHhMmTimePicker from '@/components/modules/hr/overtime/OvertimeHhMmTimePicker';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { SelectableOvertimeWindowsResult } from '@/lib/api/overtime.types';
import {
  END_OF_DAY,
  LUNCH_START_MINUTES,
  enumerateEndTimesInWindows,
  enumerateStartTimes,
  formatPeriodTimeSummary,
  overtimePeriodsOverlap,
  parseHhMmToMinutes,
  snapStartPastWeekdayLunch,
  windowsForPeriodIndex,
  type OvertimeTimePeriodRow,
} from '@/components/modules/hr/overtime/overtime-time-periods';

/**
 * Leave-style multi-period time editor for one overtime day.
 * End picker includes 24:00 as a first-class hour (minutes locked to 00).
 */
export default function OvertimeTimePeriodsEditor({
  form,
  windows,
  windowsLoading,
  timesDisabled,
  excludeWeekdayLunch,
  allowMultiple,
  maxPeriods = 8,
}: {
  form: FormInstance;
  windows: SelectableOvertimeWindowsResult | null;
  windowsLoading: boolean;
  timesDisabled: boolean;
  excludeWeekdayLunch: boolean;
  allowMultiple: boolean;
  maxPeriods?: number;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const periods =
    (Form.useWatch('periods', form) as OvertimeTimePeriodRow[] | undefined) ??
    [];
  const watchedDate = Form.useWatch('date', form) as Dayjs | undefined;
  const overlap = overtimePeriodsOverlap(periods);
  const baseWindows = windows?.windows ?? [];
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (periods.length === 0) {
      setActiveIndex(0);
      return;
    }
    if (activeIndex > periods.length - 1) {
      setActiveIndex(periods.length - 1);
    }
  }, [periods.length, activeIndex]);

  return (
    <div className="md:col-span-2">
      <p className="mb-2 text-[13px] font-medium text-[var(--color-text-primary)]">
        {t('hr.form.timePeriods')}
      </p>
      <Form.List
        name="periods"
        rules={[
          {
            validator: async (_, value: OvertimeTimePeriodRow[] | undefined) => {
              const rows = value ?? [];
              if (rows.length === 0) {
                return Promise.reject(
                  new Error(t('hr.validation.overtimePeriodRequired')),
                );
              }
              if (overtimePeriodsOverlap(rows)) {
                return Promise.reject(
                  new Error(t('hr.validation.overtimePeriodsOverlap')),
                );
              }
              for (const row of rows) {
                if (!(row.taskDescription ?? '').trim()) {
                  return Promise.reject(
                    new Error(t('hr.validation.taskDescriptionRequired')),
                  );
                }
              }
              return Promise.resolve();
            },
          },
        ]}
      >
        {(fields, { add, remove }, { errors }) => (
          <div className="flex flex-col gap-2">
            {fields.map((field, index) => {
              const periodWindows = windowsForPeriodIndex(
                baseWindows,
                periods,
                index,
              );
              const row = periods[index];
              const start = row?.startTime;
              const effectiveStart =
                start && excludeWeekdayLunch
                  ? snapStartPastWeekdayLunch(start)
                  : start;
              const startAllowed = enumerateStartTimes(periodWindows, {
                excludeWeekdayLunch,
              });
              const endAllowed =
                effectiveStart && periodWindows.length > 0
                  ? enumerateEndTimesInWindows(effectiveStart, periodWindows, {
                      excludeWeekdayLunch,
                    })
                  : [];
              const allowEndOfDay = endAllowed.includes(END_OF_DAY);
              const endsAtMidnight = row?.endTime === END_OF_DAY;
              const isActive = index === activeIndex;
              const timeSummary = formatPeriodTimeSummary(row ?? {});

              return (
                <div
                  key={field.key}
                  className={
                    isActive
                      ? 'rounded-[10px] border border-[#F47B20]/40 bg-[#fafbfc] p-3 shadow-[0_0_0_1px_rgba(244,123,32,0.08)]'
                      : 'rounded-[10px] border border-[#e8ebef] bg-white'
                  }
                >
                  {!isActive ? (
                    <div className="flex items-center gap-1 px-1 py-1">
                      <button
                        type="button"
                        className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-[#fafbfc]"
                        onClick={() => setActiveIndex(index)}
                      >
                        <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">
                          {t('hr.form.periodIndex', { index: index + 1 })}
                        </span>
                        <span className="mt-0.5 block text-[14px] font-medium tabular-nums text-[var(--color-text-primary)]">
                          {timeSummary}
                        </span>
                      </button>
                      {allowMultiple && fields.length > 1 ? (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={t('hr.form.removePeriod')}
                          onClick={() => {
                            remove(field.name);
                            setActiveIndex((current) => {
                              if (index < current) {
                                return current - 1;
                              }
                              if (index === current) {
                                return Math.max(0, current - 1);
                              }
                              return current;
                            });
                          }}
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="text-[12px] font-semibold text-[var(--color-text-secondary)]">
                        {t('hr.form.periodIndex', { index: index + 1 })}
                      </span>
                      {allowMultiple && fields.length > 1 ? (
                        <Button
                          type="text"
                          danger
                          size="small"
                          icon={<DeleteOutlined />}
                          aria-label={t('hr.form.removePeriod')}
                          onClick={() => {
                            remove(field.name);
                            setActiveIndex((current) =>
                              Math.max(0, Math.min(current, fields.length - 2)),
                            );
                          }}
                        />
                      ) : null}
                    </div>
                  )}

                  <div className={isActive ? 'block' : 'hidden'}>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <Form.Item
                        name={[field.name, 'startTime']}
                        label={t('hr.form.startTime')}
                        className="!mb-0"
                        rules={[
                          {
                            required: true,
                            message: t('hr.validation.startTimeRequired'),
                          },
                        ]}
                      >
                        <OvertimeHhMmTimePicker
                          disabled={timesDisabled || windowsLoading}
                          placeholder={t('hr.placeholder.selectStartTime')}
                          allowedTimes={startAllowed}
                          onChange={(value) => {
                            if (!value) {
                              return;
                            }
                            const nextStart = excludeWeekdayLunch
                              ? snapStartPastWeekdayLunch(value)
                              : value;
                            const next = [...periods];
                            next[index] = {
                              ...next[index],
                              startTime: nextStart,
                              endTime: undefined,
                            };
                            form.setFieldValue('periods', next);
                          }}
                        />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'endTime']}
                        label={t('hr.form.endTime')}
                        className="!mb-0"
                        dependencies={[['periods', field.name, 'startTime']]}
                        extra={
                          excludeWeekdayLunch &&
                          effectiveStart &&
                          parseHhMmToMinutes(effectiveStart) <
                            LUNCH_START_MINUTES
                            ? t('hr.labels.lunchBreakOtCapTooltip')
                            : undefined
                        }
                        rules={[
                          {
                            required: true,
                            message: t('hr.validation.endTimeRequired'),
                          },
                          ({ getFieldValue }) => ({
                            validator: (_rule, value: string | undefined) => {
                              const rowStart = getFieldValue([
                                'periods',
                                field.name,
                                'startTime',
                              ]) as string | undefined;
                              if (!rowStart || !value) {
                                return Promise.resolve();
                              }
                              const snapped = excludeWeekdayLunch
                                ? snapStartPastWeekdayLunch(rowStart)
                                : rowStart;
                              if (value === snapped) {
                                return Promise.reject(
                                  new Error(
                                    t('hr.validation.overtimeStartEndSame'),
                                  ),
                                );
                              }
                              if (
                                parseHhMmToMinutes(value) <=
                                parseHhMmToMinutes(snapped)
                              ) {
                                return Promise.reject(
                                  new Error(t('hr.dateRules.endAfterStart')),
                                );
                              }
                              const allowed = enumerateEndTimesInWindows(
                                snapped,
                                periodWindows,
                                { excludeWeekdayLunch },
                              );
                              if (
                                allowed.length > 0 &&
                                !allowed.includes(value)
                              ) {
                                return Promise.reject(
                                  new Error(
                                    t('hr.labels.noSelectableWindows'),
                                  ),
                                );
                              }
                              return Promise.resolve();
                            },
                          }),
                        ]}
                      >
                        <OvertimeHhMmTimePicker
                          key={`${index}-${effectiveStart ?? 'end'}`}
                          disabled={
                            timesDisabled ||
                            windowsLoading ||
                            !effectiveStart
                          }
                          placeholder={t('hr.placeholder.selectEndTime')}
                          allowEndOfDay={allowEndOfDay}
                          allowedTimes={endAllowed}
                        />
                      </Form.Item>
                    </div>

                    <Form.Item
                      name={[field.name, 'taskDescription']}
                      label={t('hr.labels.taskDescription')}
                      className="!mb-0 !mt-3"
                      rules={[
                        {
                          required: true,
                          message: t('hr.validation.taskDescriptionRequired'),
                        },
                        { max: 4000 },
                      ]}
                    >
                      <Input.TextArea
                        rows={3}
                        maxLength={4000}
                        showCount
                        placeholder={t(
                          'hr.placeholder.overtimeTaskDescription',
                        )}
                      />
                    </Form.Item>

                    {endsAtMidnight && watchedDate ? (
                      <Alert
                        type="info"
                        showIcon
                        className="!mt-3"
                        title={t('hr.labels.workedPastMidnight', {
                          date: watchedDate
                            .add(1, 'day')
                            .format('DD/MM/YYYY'),
                        })}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}

            {allowMultiple && fields.length < maxPeriods ? (
              <Button
                type="dashed"
                icon={<PlusOutlined />}
                className="w-full"
                disabled={timesDisabled || windowsLoading}
                onClick={() => {
                  add({
                    startTime: undefined,
                    endTime: undefined,
                    taskDescription: undefined,
                  });
                  setActiveIndex(fields.length);
                }}
              >
                {t('hr.form.addPeriod')}
              </Button>
            ) : null}

            {overlap ? (
              <Alert
                type="error"
                showIcon
                title={t('hr.validation.overtimePeriodsOverlap')}
              />
            ) : null}
            <Form.ErrorList errors={errors} />
          </div>
        )}
      </Form.List>
    </div>
  );
}
