'use client';

import { useMemo } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  Select,
  Spin,
  Tag,
} from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  PreviewOvertimeEntryResult,
  SelectableOvertimeWindowsResult,
} from '@/lib/api/overtime.types';
import { formatOvertimeHours } from '@/lib/utils/overtime-display';

export interface OvertimeEntryFormValues {
  date: Dayjs;
  startTime: string;
  endTime: string;
  taskDescription: string;
}

const END_OF_DAY = '24:00';

function parseHhMmToMinutes(value: string): number {
  if (value === END_OF_DAY) {
    return 24 * 60;
  }
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/** End times strictly after start, within the same selectable window, 15-min steps. */
export function enumerateEndTimes(
  startTime: string,
  windows: Array<{ start: string; end: string }>,
): string[] {
  const start = parseHhMmToMinutes(startTime);
  const window = windows.find((w) => {
    const ws = parseHhMmToMinutes(w.start);
    const we = parseHhMmToMinutes(w.end);
    return start >= ws && start < we;
  });
  if (!window) {
    return [];
  }
  const we = parseHhMmToMinutes(window.end);
  const times: string[] = [];
  for (let m = start + 15; m <= we; m += 15) {
    times.push(
      m >= 24 * 60
        ? END_OF_DAY
        : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
    );
  }
  return times;
}

/** Start times inside windows (exclusive of window end), 15-min steps. */
export function enumerateStartTimes(
  windows: Array<{ start: string; end: string }>,
): string[] {
  const times = new Set<string>();
  for (const window of windows) {
    const ws = parseHhMmToMinutes(window.start);
    const we = parseHhMmToMinutes(window.end);
    for (let m = ws; m < we; m += 15) {
      times.add(
        `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`,
      );
    }
  }
  return [...times].sort((a, b) => parseHhMmToMinutes(a) - parseHhMmToMinutes(b));
}

interface OvertimeEntryFormProps {
  form: FormInstance<OvertimeEntryFormValues>;
  formId?: string;
  disabledDate: (current: Dayjs | null) => boolean;
  preview: PreviewOvertimeEntryResult | null;
  previewLoading: boolean;
  periodLabel: string;
  windows: SelectableOvertimeWindowsResult | null;
  windowsLoading: boolean;
  onFinish?: (values: OvertimeEntryFormValues) => void | Promise<void>;
  onAddNextDay?: (nextDate: Dayjs) => void;
}

function DrawerSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className="overflow-hidden rounded-[12px] border border-[#e8ebef] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="border-b border-[#e8ebef] bg-[#fafbfc] px-4 py-2.5">
        <h3 className="m-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-text-tertiary)]">
          {title}
        </h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

function HoursPreviewChip({
  label,
  value,
  emphasize,
  hint,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  hint?: string | null;
}): React.ReactNode {
  return (
    <div
      className={`min-w-0 rounded-lg border px-3 py-2.5 ${
        emphasize
          ? 'border-[#1D9E75]/30] bg-[#E1F5EE]'
          : 'border-[#e8ebef] bg-[#fafbfc]'
      }`}
    >
      <p className="m-0 text-[10px] font-medium uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">
        {label}
      </p>
      <p
        className={`m-0 mt-0.5 text-[15px] font-semibold tabular-nums leading-tight ${
          emphasize ? 'text-[#0F6E56]' : 'text-[var(--color-text-primary)]'
        }`}
      >
        {value}
      </p>
      {hint ? (
        <p className="m-0 mt-0.5 text-[11px] text-[var(--color-text-secondary)]">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Overtime sheet entry fields: same-day only, windows from the server, live hours preview.
 */
export default function OvertimeEntryForm({
  form,
  formId = 'overtime-entry-form',
  disabledDate,
  preview,
  previewLoading,
  periodLabel,
  windows,
  windowsLoading,
  onFinish,
  onAddNextDay,
}: OvertimeEntryFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const watchedDate = Form.useWatch('date', form);
  const watchedStart = Form.useWatch('startTime', form);
  const watchedEnd = Form.useWatch('endTime', form);

  const startOptions = useMemo(() => {
    if (!windows?.windows?.length) {
      return [];
    }
    return enumerateStartTimes(windows.windows).map((value) => ({
      value,
      label: value,
    }));
  }, [windows]);

  const endOptions = useMemo(() => {
    if (!watchedStart || !windows?.windows?.length) {
      return [];
    }
    return enumerateEndTimes(watchedStart, windows.windows).map((value) => ({
      value,
      label: value,
    }));
  }, [watchedStart, windows]);

  const blockedLeave = windows?.blockedReason === 'FULL_DAY_LEAVE';
  const timesDisabled =
    blockedLeave || windowsLoading || !windows?.windows?.length;

  return (
    <Form<OvertimeEntryFormValues>
      id={formId}
      form={form}
      layout="vertical"
      requiredMark={false}
      className="erp-drawer-form"
      onFinish={(values) => void onFinish?.(values)}
    >
      <div className="flex flex-col gap-4">
        <DrawerSection title={t('hr.section.entryDetails')}>
          <div className="erp-form-grid-2">
            <Form.Item
              name="date"
              label={t('hr.table.date')}
              className="md:col-span-2"
              extra={t('hr.labels.overtimeEntryDateHint', {
                period: periodLabel,
              })}
              rules={[
                { required: true, message: t('hr.validation.selectDate') },
              ]}
            >
              <DatePicker
                className="w-full"
                format="DD/MM/YYYY"
                disabledDate={disabledDate}
              />
            </Form.Item>

            {windowsLoading ? (
              <div className="md:col-span-2 flex items-center gap-2 py-1">
                <Spin size="small" />
                <span className="text-[13px] text-[var(--color-text-secondary)]">
                  {t('hr.labels.selectableWindowsLoading')}
                </span>
              </div>
            ) : null}

            {blockedLeave ? (
              <Alert
                type="info"
                showIcon
                className="md:col-span-2"
                message={
                  windows?.message ?? t('hr.labels.approvedLeaveNoOvertime')
                }
              />
            ) : null}

            {!windowsLoading &&
            windows &&
            !blockedLeave &&
            windows.windows.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                className="md:col-span-2"
                message={t('hr.labels.noSelectableWindows')}
              />
            ) : null}

            <Form.Item
              name="startTime"
              label={t('hr.form.startTime')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.startTimeRequired'),
                },
              ]}
            >
              <Select
                className="w-full"
                showSearch
                options={startOptions}
                disabled={timesDisabled}
                placeholder={t('hr.placeholder.selectStartTime')}
                onChange={() => {
                  form.setFieldValue('endTime', undefined);
                }}
              />
            </Form.Item>

            <Form.Item
              name="endTime"
              label={t('hr.form.endTime')}
              dependencies={['startTime']}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.endTimeRequired'),
                },
                ({ getFieldValue }) => ({
                  validator: (_rule, value: string | undefined) => {
                    const start = getFieldValue('startTime') as
                      | string
                      | undefined;
                    if (!start || !value) {
                      return Promise.resolve();
                    }
                    if (parseHhMmToMinutes(value) <= parseHhMmToMinutes(start)) {
                      return Promise.reject(
                        new Error(t('hr.dateRules.endAfterStart')),
                      );
                    }
                    return Promise.resolve();
                  },
                }),
              ]}
            >
              <Select
                className="w-full"
                showSearch
                options={endOptions}
                disabled={timesDisabled || !watchedStart}
                placeholder={t('hr.placeholder.selectEndTime')}
              />
            </Form.Item>
          </div>

          {watchedEnd === END_OF_DAY && watchedDate ? (
            <Alert
              type="info"
              showIcon
              className="!mt-3"
              message={t('hr.labels.workedPastMidnight', {
                date: watchedDate.add(1, 'day').format('DD/MM/YYYY'),
              })}
              action={
                onAddNextDay ? (
                  <Button
                    size="small"
                    type="link"
                    onClick={() => onAddNextDay(watchedDate.add(1, 'day'))}
                  >
                    {t('hr.buttons.addNextDayEntry')}
                  </Button>
                ) : null
              }
            />
          ) : null}

          {watchedStart && watchedEnd ? (
            <div
              style={{
                padding: '10px 14px',
                background: 'var(--color-bg-secondary, #fafafa)',
                borderRadius: 8,
                border: '1px solid var(--color-border, #e8ebef)',
                marginTop: 8,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  marginBottom: 6,
                  color: 'var(--color-text-secondary)',
                }}
              >
                {t('pages.hr.overtime.classificationPreview')}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {preview && Number(preview.regularHours) > 0 ? (
                  <Tag color="blue">{t('pages.hr.overtime.rateRegular')}</Tag>
                ) : null}
                {preview && Number(preview.nightHours) > 0 ? (
                  <Tag color="purple">{t('pages.hr.overtime.rateNight')}</Tag>
                ) : null}
                {preview && Number(preview.weekendHours) > 0 ? (
                  <Tag color="orange">{t('pages.hr.overtime.rateWeekend')}</Tag>
                ) : null}
                {preview && Number(preview.holidayHours) > 0 ? (
                  <Tag color="red">{t('pages.hr.overtime.rateHoliday')}</Tag>
                ) : null}
                {!preview && !previewLoading ? (
                  <>
                    <Tag color="blue">{t('pages.hr.overtime.rateRegular')}</Tag>
                    <Tag color="purple">{t('pages.hr.overtime.rateNight')}</Tag>
                  </>
                ) : null}
              </div>
              <p
                style={{
                  margin: '6px 0 0',
                  fontSize: 11,
                  color: 'var(--color-text-tertiary)',
                }}
              >
                {t('pages.hr.overtime.classificationPreviewHint')}
              </p>
            </div>
          ) : null}
        </DrawerSection>

        <DrawerSection title={t('hr.section.hoursPreview')}>
          {previewLoading && !preview ? (
            <div className="flex items-center gap-2 py-2">
              <Spin size="small" />
              <span className="text-[13px] text-[var(--color-text-secondary)]">
                {t('hr.labels.hoursPreviewLoading')}
              </span>
            </div>
          ) : preview ? (
            <div className="relative">
              {previewLoading ? (
                <div className="absolute inset-0 z-[1] flex items-center justify-center rounded-lg bg-white/60">
                  <Spin size="small" />
                </div>
              ) : null}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.regular')}
                  value={formatOvertimeHours(preview.regularHours)}
                />
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.night')}
                  value={formatOvertimeHours(preview.nightHours)}
                />
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.weekend')}
                  value={formatOvertimeHours(preview.weekendHours)}
                />
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.holiday')}
                  value={formatOvertimeHours(preview.holidayHours)}
                  hint={preview.holidayName}
                />
                <HoursPreviewChip
                  label={t('hr.overtimeCategory.total')}
                  value={formatOvertimeHours(preview.totalHours)}
                  emphasize
                />
              </div>
              {preview.attendanceWarning ? (
                <Alert
                  type="warning"
                  showIcon
                  className="!mt-3"
                  message={preview.attendanceWarning}
                />
              ) : null}
              {preview.scheduleNote ? (
                <p className="m-0 mt-3 text-[12px] text-[var(--color-text-secondary)]">
                  {preview.scheduleNote}
                </p>
              ) : null}
            </div>
          ) : (
            <p className="m-0 text-[13px] text-[var(--color-text-secondary)]">
              {t('hr.labels.hoursPreviewEmpty')}
            </p>
          )}
        </DrawerSection>

        <DrawerSection title={t('hr.labels.taskDescription')}>
          <Form.Item
            name="taskDescription"
            className="!mb-0"
            rules={[
              {
                required: true,
                message: t('hr.validation.taskDescriptionRequired'),
              },
              { max: 4000 },
            ]}
          >
            <Input.TextArea
              rows={4}
              maxLength={4000}
              showCount
              placeholder={t('hr.placeholder.overtimeTaskDescription')}
            />
          </Form.Item>
        </DrawerSection>
      </div>
    </Form>
  );
}
