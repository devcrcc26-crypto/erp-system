'use client';

import { useEffect, useMemo } from 'react';
import { Button, Form, Input, Select, Switch, TimePicker } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  CreateWorkSchedulePayload,
  WorkSchedule,
  WorkScheduleDayInput,
} from '@/lib/api/work-schedule.types';

const DEFAULT_MORNING_START = '08:30';
const DEFAULT_MORNING_END = '12:30';
const DEFAULT_AFTERNOON_START = '13:30';
const DEFAULT_AFTERNOON_END = '17:30';

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

function computeHours(day: DayFormValue): number {
  if (day.mode === 'off') {
    return 0;
  }
  const morningStart = formatTime(day.morningStart);
  const morningEnd = formatTime(day.morningEnd);
  if (!morningStart || !morningEnd) {
    return 0;
  }
  let hours = hoursBetween(morningStart, morningEnd);
  if (day.mode === 'working') {
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

function toDayPayload(days: DayFormValue[]): WorkScheduleDayInput[] {
  return days.map((day, dayOfWeek) => {
    const isWorkingDay = day.mode !== 'off';
    const isHalfDay = day.mode === 'half';
    return {
      dayOfWeek,
      isWorkingDay,
      isHalfDay,
      morningStart: isWorkingDay ? formatTime(day.morningStart) : null,
      morningEnd: isWorkingDay ? formatTime(day.morningEnd) : null,
      afternoonStart:
        day.mode === 'working' ? formatTime(day.afternoonStart) : null,
      afternoonEnd: day.mode === 'working' ? formatTime(day.afternoonEnd) : null,
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
      days: defaultDays(),
    };
  }
  return {
    name: schedule.name,
    description: schedule.description ?? undefined,
    isDefault: schedule.isDefault,
    isActive: schedule.isActive,
    days: daysFromSchedule(schedule),
  };
}

export function buildWorkSchedulePayload(
  values: WorkScheduleFormValues,
): CreateWorkSchedulePayload {
  return {
    name: values.name.trim(),
    description: values.description?.trim() || undefined,
    isDefault: values.isDefault,
    isActive: values.isActive,
    days: toDayPayload(values.days),
  };
}

/**
 * Create / edit work schedule — details plus Sunday–Saturday hours.
 */
export default function WorkScheduleForm({
  schedule,
  isSubmitting,
  submitLabel,
  onSubmit,
}: {
  schedule?: WorkSchedule;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: WorkScheduleFormValues) => Promise<void>;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<WorkScheduleFormValues>();
  const watchedDays = Form.useWatch('days', form) as DayFormValue[] | undefined;

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

  useEffect(() => {
    form.setFieldsValue(valuesFromSchedule(schedule));
  }, [form, schedule]);

  return (
    <Form<WorkScheduleFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={valuesFromSchedule(schedule)}
      onFinish={(values) => void onSubmit(values)}
      className="flex flex-col gap-4"
    >
      <FormLayout
        variant="pro"
        title={t('hr.workSchedule.details')}
        description={t('hr.workSchedule.formDescription')}
      >
        <Form.Item
          name="name"
          label={t('hr.workSchedule.name')}
          rules={[{ required: true, message: t('hr.workSchedule.nameRequired') }]}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="description" label={t('hr.workSchedule.description')}>
          <Input.TextArea rows={2} maxLength={2000} />
        </Form.Item>
        <div className="erp-form-grid-2">
          <Form.Item
            name="isDefault"
            label={t('hr.workSchedule.defaultBadge')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="isActive"
            label={t('common.active')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>
      </FormLayout>

      <FormLayout variant="pro" title={t('hr.workSchedule.weekPattern')}>
        {dayLabels.map((label, index) => {
          const day = watchedDays?.[index];
          const mode = day?.mode ?? 'off';
          const hours = day ? computeHours(day) : 0;
          return (
            <div
              key={label}
              className="mb-4 rounded-xl border border-[#e8ebef] p-3 last:mb-0"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-medium">{label}</span>
                <span className="erp-users-cell-sub">
                  {hours} {t('hr.workSchedule.hours')}
                </span>
              </div>
              <Form.Item name={['days', index, 'mode']} className="mb-2">
                <Select
                  options={[
                    { value: 'working', label: t('hr.workSchedule.workingDay') },
                    { value: 'half', label: t('hr.workSchedule.halfDay') },
                    { value: 'off', label: t('hr.workSchedule.offDay') },
                  ]}
                />
              </Form.Item>
              {mode !== 'off' ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Form.Item
                    name={['days', index, 'morningStart']}
                    label={t('hr.workSchedule.morningStart')}
                    rules={[{ required: true }]}
                  >
                    <TimePicker format="HH:mm" className="w-full" />
                  </Form.Item>
                  <Form.Item
                    name={['days', index, 'morningEnd']}
                    label={t('hr.workSchedule.morningEnd')}
                    rules={[{ required: true }]}
                  >
                    <TimePicker format="HH:mm" className="w-full" />
                  </Form.Item>
                  {mode === 'working' ? (
                    <>
                      <Form.Item
                        name={['days', index, 'afternoonStart']}
                        label={t('hr.workSchedule.afternoonStart')}
                        rules={[{ required: true }]}
                      >
                        <TimePicker format="HH:mm" className="w-full" />
                      </Form.Item>
                      <Form.Item
                        name={['days', index, 'afternoonEnd']}
                        label={t('hr.workSchedule.afternoonEnd')}
                        rules={[{ required: true }]}
                      >
                        <TimePicker format="HH:mm" className="w-full" />
                      </Form.Item>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </FormLayout>

      <div className="flex justify-end">
        <Button type="primary" htmlType="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}
