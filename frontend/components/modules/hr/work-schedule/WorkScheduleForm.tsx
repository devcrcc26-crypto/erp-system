'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Button, Form, Input, Segmented, Select, Switch, TimePicker } from 'antd';
import { Copy } from 'lucide-react';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  CreateWorkSchedulePayload,
  WorkSchedule,
  WorkScheduleCheckMode,
  WorkScheduleDayInput,
} from '@/lib/api/work-schedule.types';

const DEFAULT_MORNING_START = '08:30';
const DEFAULT_MORNING_END = '12:30';
const DEFAULT_AFTERNOON_START = '13:30';
const DEFAULT_AFTERNOON_END = '17:30';
const DEFAULT_LATEST_SCAN_TIME = '08:30';

type DayMode = 'off' | 'half' | 'working';

interface DayFormValue {
  mode: DayMode;
  morningStart?: Dayjs | null;
  morningEnd?: Dayjs | null;
  afternoonStart?: Dayjs | null;
  afternoonEnd?: Dayjs | null;
}

export interface WorkScheduleFormValues {
  name: string;
  description?: string;
  isDefault: boolean;
  isActive: boolean;
  checkMode: WorkScheduleCheckMode;
  latestScanTime?: Dayjs | null;
  days: DayFormValue[];
}

function parseTime(value: string | null | undefined): Dayjs | null {
  if (!value) {
    return null;
  }
  return dayjs(value, 'HH:mm');
}

function formatTime(value: Dayjs | null | undefined): string | null {
  if (!value) {
    return null;
  }
  return value.format('HH:mm');
}

function hoursBetween(start: string, end: string): number {
  const [startH, startM] = start.split(':').map(Number);
  const [endH, endM] = end.split(':').map(Number);
  const diff = endH * 60 + endM - (startH * 60 + startM);
  if (diff <= 0) {
    return 0;
  }
  return Math.round((diff / 60) * 10) / 10;
}

function computeHours(day: DayFormValue, singleShift = false): number {
  if (day.mode === 'off') {
    return 0;
  }
  const morningStart = formatTime(day.morningStart);
  const morningEnd = formatTime(day.morningEnd);
  if (!morningStart || !morningEnd) {
    return 0;
  }
  let hours = hoursBetween(morningStart, morningEnd);
  if (day.mode === 'working' && !singleShift) {
    const afternoonStart = formatTime(day.afternoonStart);
    const afternoonEnd = formatTime(day.afternoonEnd);
    if (afternoonStart && afternoonEnd) {
      hours += hoursBetween(afternoonStart, afternoonEnd);
    }
  }
  return Math.round(hours * 10) / 10;
}

function defaultDays(): DayFormValue[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    if (dayOfWeek === 0) {
      return { mode: 'off' as const };
    }
    if (dayOfWeek === 6) {
      return {
        mode: 'half' as const,
        morningStart: parseTime(DEFAULT_MORNING_START),
        morningEnd: parseTime(DEFAULT_MORNING_END),
      };
    }
    return {
      mode: 'working' as const,
      morningStart: parseTime(DEFAULT_MORNING_START),
      morningEnd: parseTime(DEFAULT_MORNING_END),
      afternoonStart: parseTime(DEFAULT_AFTERNOON_START),
      afternoonEnd: parseTime(DEFAULT_AFTERNOON_END),
    };
  });
}

function daysFromSchedule(schedule: WorkSchedule): DayFormValue[] {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const row = schedule.days.find((item) => item.dayOfWeek === dayOfWeek);
    if (!row || !row.isWorkingDay) {
      return { mode: 'off' as const };
    }
    if (row.isHalfDay) {
      return {
        mode: 'half' as const,
        morningStart: parseTime(row.morningStart),
        morningEnd: parseTime(row.morningEnd),
      };
    }
    return {
      mode: 'working' as const,
      morningStart: parseTime(row.morningStart),
      morningEnd: parseTime(row.morningEnd),
      afternoonStart: parseTime(row.afternoonStart),
      afternoonEnd: parseTime(row.afternoonEnd),
    };
  });
}

/** Scan only: a working day is one shift window (no afternoon block). */
function toDayPayload(
  days: DayFormValue[],
  singleShift: boolean,
): WorkScheduleDayInput[] {
  return days.map((day, dayOfWeek) => {
    const isWorkingDay = day.mode !== 'off';
    const isHalfDay = day.mode === 'half';
    const hasAfternoon = day.mode === 'working' && !singleShift;
    return {
      dayOfWeek,
      isWorkingDay,
      isHalfDay,
      morningStart: isWorkingDay ? formatTime(day.morningStart) : null,
      morningEnd: isWorkingDay ? formatTime(day.morningEnd) : null,
      afternoonStart: hasAfternoon ? formatTime(day.afternoonStart) : null,
      afternoonEnd: hasAfternoon ? formatTime(day.afternoonEnd) : null,
    };
  });
}

function valuesFromSchedule(schedule?: WorkSchedule): WorkScheduleFormValues {
  if (!schedule) {
    return {
      name: '',
      description: undefined,
      isDefault: false,
      isActive: true,
      checkMode: 'STANDARD',
      latestScanTime: null,
      days: defaultDays(),
    };
  }
  return {
    name: schedule.name,
    description: schedule.description ?? undefined,
    isDefault: schedule.isDefault,
    isActive: schedule.isActive,
    checkMode: schedule.checkMode ?? 'STANDARD',
    latestScanTime: parseTime(schedule.latestScanTime),
    days: daysFromSchedule(schedule),
  };
}

export function buildWorkSchedulePayload(
  values: WorkScheduleFormValues,
): CreateWorkSchedulePayload {
  const scanOnly = values.checkMode === 'SCAN_ONLY';
  return {
    name: values.name.trim(),
    description: values.description?.trim() || undefined,
    isDefault: values.isDefault,
    isActive: values.isActive,
    checkMode: scanOnly ? 'SCAN_ONLY' : 'STANDARD',
    latestScanTime: scanOnly ? formatTime(values.latestScanTime) : null,
    days: toDayPayload(values.days, scanOnly),
  };
}

const CARD =
  'rounded-2xl bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.06)]';

/** Display order: Monday first, Sunday last (dayOfWeek stays 0 = Sunday in data). */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

const MODE_DOT: Record<DayMode, string> = {
  working: 'bg-emerald-600 text-white',
  half: 'bg-amber-100 text-amber-800',
  off: 'bg-slate-100 text-slate-500',
};

function TimeRange({
  index,
  startField,
  endField,
  label,
  requiredMessage,
  orderMessage,
}: {
  index: number;
  startField: keyof DayFormValue;
  endField: keyof DayFormValue;
  label: string;
  requiredMessage: string;
  orderMessage: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p className="m-0 mb-1 text-xs font-medium text-slate-500">{label}</p>
      <div className="flex items-start gap-1.5">
        <Form.Item
          name={['days', index, startField]}
          rules={[{ required: true, message: requiredMessage }]}
          className="!mb-0 min-w-0 flex-1"
        >
          <TimePicker
            format="HH:mm"
            minuteStep={5}
            needConfirm={false}
            allowClear={false}
            className="w-full"
            aria-label={`${label} start`}
          />
        </Form.Item>
        <span className="pt-1.5 text-slate-400" aria-hidden>
          –
        </span>
        <Form.Item
          name={['days', index, endField]}
          dependencies={[['days', index, startField]]}
          rules={[
            { required: true, message: requiredMessage },
            ({ getFieldValue }) => ({
              validator(_, value: Dayjs | null | undefined) {
                const start = getFieldValue(['days', index, startField]) as Dayjs | null | undefined;
                if (!value || !start || value.isAfter(start)) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error(orderMessage));
              },
            }),
          ]}
          className="!mb-0 min-w-0 flex-1"
        >
          <TimePicker
            format="HH:mm"
            minuteStep={5}
            needConfirm={false}
            allowClear={false}
            className="w-full"
            aria-label={`${label} end`}
          />
        </Form.Item>
      </div>
    </div>
  );
}

function SwitchRow({
  name,
  label,
  hint,
  disabled,
}: {
  name: 'isDefault' | 'isActive';
  label: string;
  hint: string;
  disabled: boolean;
}): React.ReactNode {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl bg-slate-50 px-4 py-3">
      <div className="min-w-0">
        <p className="m-0 text-sm font-medium text-slate-800">{label}</p>
        <p className="m-0 mt-0.5 text-xs leading-snug text-slate-500">{hint}</p>
      </div>
      <Form.Item name={name} valuePropName="checked" className="!mb-0 shrink-0">
        <Switch disabled={disabled} aria-label={label} />
      </Form.Item>
    </div>
  );
}

/**
 * Create / edit work schedule - details, a compact Monday–Sunday grid and a
 * live week summary with the save action.
 */
export default function WorkScheduleForm({
  schedule,
  isSubmitting,
  submitLabel,
  onSubmit,
  cancelHref,
}: {
  schedule?: WorkSchedule;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: WorkScheduleFormValues) => Promise<void>;
  cancelHref?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<WorkScheduleFormValues>();
  const watchedDays = Form.useWatch('days', form) as DayFormValue[] | undefined;
  const watchedCheckMode = Form.useWatch('checkMode', form) as
    | WorkScheduleCheckMode
    | undefined;
  const scanOnly =
    (watchedCheckMode ?? schedule?.checkMode ?? 'STANDARD') === 'SCAN_ONLY';
  /** The default is transferred by making another schedule default, never cleared here. */
  const isDefaultSchedule = Boolean(schedule?.isDefault);

  const dayLabels = useMemo(
    () => [
      t('hr.workSchedule.day0'),
      t('hr.workSchedule.day1'),
      t('hr.workSchedule.day2'),
      t('hr.workSchedule.day3'),
      t('hr.workSchedule.day4'),
      t('hr.workSchedule.day5'),
      t('hr.workSchedule.day6'),
    ],
    [t],
  );
  const dayShort = useMemo(
    () => Array.from({ length: 7 }, (_, index) => t(`hr.workSchedule.dayShort${index}`)),
    [t],
  );

  useEffect(() => {
    form.setFieldsValue(valuesFromSchedule(schedule));
  }, [form, schedule]);

  const days = watchedDays ?? valuesFromSchedule(schedule).days;
  const summary = useMemo(() => {
    const totals = days.map((day) => (day ? computeHours(day, scanOnly) : 0));
    return {
      hours: Math.round(totals.reduce((sum, value) => sum + value, 0) * 10) / 10,
      working: days.filter((day) => day?.mode === 'working').length,
      half: days.filter((day) => day?.mode === 'half').length,
      totals,
    };
  }, [days, scanOnly]);

  function copyMondayToWeekdays(): void {
    const monday = form.getFieldValue(['days', 1]) as DayFormValue | undefined;
    if (!monday) {
      return;
    }
    const current = (form.getFieldValue('days') as DayFormValue[]) ?? [];
    const next = current.map((day, index) =>
      index >= 2 && index <= 5 ? { ...monday } : day,
    );
    form.setFieldsValue({ days: next });
    messageApi.success(t('hr.workSchedule.copiedMonday'));
  }

  const modeOptions = [
    { value: 'working', label: t('hr.workSchedule.workingDay') },
    { value: 'half', label: t('hr.workSchedule.halfDay') },
    { value: 'off', label: t('hr.workSchedule.offDay') },
  ];
  const requiredTime = t('hr.workSchedule.timeRequired');
  const orderMessage = t('hr.workSchedule.endAfterStart');

  return (
    <Form<WorkScheduleFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={valuesFromSchedule(schedule)}
      onFinish={(values) => void onSubmit(values)}
      className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <section className={`${CARD} p-5 sm:p-6`}>
          <h2 className="m-0 text-base font-semibold text-slate-900">
            {t('hr.workSchedule.details')}
          </h2>
          <div className="mt-4 grid gap-x-4 md:grid-cols-2">
            <Form.Item
              name="name"
              label={<span className="font-medium text-slate-700">{t('hr.workSchedule.name')}</span>}
              rules={[{ required: true, whitespace: true, message: t('hr.workSchedule.nameRequired') }]}
            >
              <Input maxLength={200} placeholder={t('hr.workSchedule.namePlaceholder')} />
            </Form.Item>
            <Form.Item
              name="description"
              label={<span className="font-medium text-slate-700">{t('hr.workSchedule.description')}</span>}
            >
              <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={2000} />
            </Form.Item>
          </div>
          <div className="grid gap-x-4 md:grid-cols-2">
            <Form.Item
              name="checkMode"
              label={<span className="font-medium text-slate-700">{t('hr.workSchedule.checkMode')}</span>}
              extra={<span className="text-xs text-slate-600">{t('hr.workSchedule.checkModeHint')}</span>}
            >
              <Select
                options={[
                  { value: 'STANDARD', label: t('hr.workSchedule.checkModeStandard') },
                  { value: 'SCAN_ONLY', label: t('hr.workSchedule.checkModeScanOnly') },
                ]}
                onChange={(value: WorkScheduleCheckMode) => {
                  if (value === 'SCAN_ONLY' && !form.getFieldValue('latestScanTime')) {
                    form.setFieldsValue({ latestScanTime: parseTime(DEFAULT_LATEST_SCAN_TIME) });
                  }
                }}
              />
            </Form.Item>
            {scanOnly ? (
              <Form.Item
                name="latestScanTime"
                label={<span className="font-medium text-slate-700">{t('hr.workSchedule.latestScanTime')}</span>}
                rules={[{ required: true, message: t('hr.workSchedule.latestScanTimeRequired') }]}
                extra={<span className="text-xs text-slate-600">{t('hr.workSchedule.scanOnlyNote')}</span>}
              >
                <TimePicker
                  format="HH:mm"
                  minuteStep={5}
                  needConfirm={false}
                  allowClear={false}
                  className="w-full"
                  aria-label={t('hr.workSchedule.latestScanTime')}
                />
              </Form.Item>
            ) : null}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <SwitchRow
              name="isDefault"
              label={t('hr.workSchedule.defaultBadge')}
              hint={
                isDefaultSchedule
                  ? t('hr.workSchedule.defaultLockedHint')
                  : t('hr.workSchedule.defaultHint')
              }
              disabled={isDefaultSchedule}
            />
            <SwitchRow
              name="isActive"
              label={t('common.active')}
              hint={
                isDefaultSchedule
                  ? t('hr.workSchedule.defaultCannotDeactivate')
                  : t('hr.workSchedule.activeHint')
              }
              disabled={isDefaultSchedule}
            />
          </div>
        </section>

        <section className={CARD}>
          <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
            <div>
              <h2 className="m-0 text-base font-semibold text-slate-900">
                {t('hr.workSchedule.weekPattern')}
              </h2>
              <p className="m-0 mt-0.5 text-[13px] text-slate-500">
                {scanOnly
                  ? t('hr.workSchedule.shiftHint')
                  : t('hr.workSchedule.weekPatternHint')}
              </p>
            </div>
            <Button size="small" icon={<Copy size={14} strokeWidth={2} />} onClick={copyMondayToWeekdays}>
              {t('hr.workSchedule.copyMonday')}
            </Button>
          </div>

          <ul className="m-0 mt-4 list-none divide-y divide-slate-100 p-0">
            {DISPLAY_ORDER.map((index) => {
              const day = days[index];
              const mode: DayMode = day?.mode ?? 'off';
              const hours = summary.totals[index] ?? 0;
              return (
                <li
                  key={index}
                  className={`grid gap-3 px-5 py-4 sm:px-6 lg:grid-cols-[120px_minmax(0,1fr)_72px] lg:items-start ${
                    mode === 'off' ? 'bg-slate-50/60' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 lg:block lg:pt-1">
                    <p className="m-0 text-sm font-semibold text-slate-900">{dayLabels[index]}</p>
                    <span className="text-xs font-medium text-slate-500 tabular-nums lg:hidden">
                      {hours} {t('hr.workSchedule.hours')}
                    </span>
                  </div>

                  <div className="flex min-w-0 flex-col gap-3">
                    <Form.Item name={['days', index, 'mode']} className="!mb-0">
                      <Segmented options={modeOptions} size="middle" />
                    </Form.Item>
                    {mode !== 'off' ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <TimeRange
                          index={index}
                          startField="morningStart"
                          endField="morningEnd"
                          label={
                            scanOnly && mode === 'working'
                              ? t('hr.workSchedule.shift')
                              : t('hr.workSchedule.morning')
                          }
                          requiredMessage={requiredTime}
                          orderMessage={orderMessage}
                        />
                        {mode === 'working' && !scanOnly ? (
                          <TimeRange
                            index={index}
                            startField="afternoonStart"
                            endField="afternoonEnd"
                            label={t('hr.workSchedule.afternoon')}
                            requiredMessage={requiredTime}
                            orderMessage={orderMessage}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <p className="m-0 hidden text-right text-sm font-semibold text-slate-900 tabular-nums lg:block lg:pt-1">
                    {hours}
                    <span className="ml-1 text-xs font-medium text-slate-500">
                      {t('hr.workSchedule.hours')}
                    </span>
                  </p>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      <aside className={`${CARD} p-5 lg:sticky lg:top-0`}>
        <p className="m-0 text-xs font-semibold tracking-wide text-slate-500 uppercase">
          {t('hr.workSchedule.summaryTitle')}
        </p>
        <p className="m-0 mt-2 text-3xl font-semibold tracking-tight text-slate-900 tabular-nums">
          {summary.hours}
          <span className="ml-1.5 text-sm font-medium text-slate-500">
            {t('hr.workSchedule.hoursPerWeek')}
          </span>
        </p>

        <ol className="m-0 mt-4 grid list-none grid-cols-7 gap-1.5 p-0" aria-label={t('hr.workSchedule.weekPattern')}>
          {DISPLAY_ORDER.map((index) => {
            const mode: DayMode = days[index]?.mode ?? 'off';
            return (
              <li
                key={index}
                className={`flex h-9 items-center justify-center rounded-lg text-xs font-semibold ${MODE_DOT[mode]}`}
                title={`${dayLabels[index]}: ${modeOptions.find((option) => option.value === mode)?.label ?? ''}`}
              >
                {dayShort[index]}
              </li>
            );
          })}
        </ol>

        <dl className="m-0 mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <dt className="text-xs text-slate-500">{t('hr.workSchedule.workingDays')}</dt>
            <dd className="m-0 mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">{summary.working}</dd>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5">
            <dt className="text-xs text-slate-500">{t('hr.workSchedule.halfDays')}</dt>
            <dd className="m-0 mt-0.5 text-lg font-semibold text-slate-900 tabular-nums">{summary.half}</dd>
          </div>
        </dl>

        <div className="mt-5 flex flex-col gap-2">
          <Button type="primary" htmlType="submit" size="large" block loading={isSubmitting}>
            {submitLabel}
          </Button>
          {cancelHref ? (
            <Link href={cancelHref} className="block lg:hidden">
              <Button size="large" block>
                {t('common.cancel')}
              </Button>
            </Link>
          ) : null}
        </div>
      </aside>
    </Form>
  );
}
