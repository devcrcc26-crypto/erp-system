'use client';

import {
  Alert,
  Checkbox,
  DatePicker,
  Form,
  Input,
  Spin,
  Tag,
  TimePicker,
} from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { PreviewOvertimeEntryResult } from '@/lib/api/overtime.types';
import { formatOvertimeHours } from '@/lib/utils/overtime-display';

export interface OvertimeEntryFormValues {
  date: Dayjs;
  startTime: Dayjs;
  endTime: Dayjs;
  isOvernight?: boolean;
  taskDescription: string;
}

function minutesOfDay(value: Dayjs | undefined): number | null {
  return value ? value.hour() * 60 + value.minute() : null;
}

/** True when the end time is at or before the start time (entry would cross midnight). */
export function endsAtOrBeforeStart(
  start: Dayjs | undefined,
  end: Dayjs | undefined,
): boolean {
  const s = minutesOfDay(start);
  const e = minutesOfDay(end);
  return s !== null && e !== null && e <= s;
}

/** Duration in hours for an overnight entry (end on the next day). */
function overnightHours(start: Dayjs, end: Dayjs): number {
  const s = minutesOfDay(start) ?? 0;
  const e = minutesOfDay(end) ?? 0;
  return Math.round(((e + 24 * 60 - s) / 60) * 100) / 100;
}

interface OvertimeEntryFormProps {
  form: FormInstance<OvertimeEntryFormValues>;
  formId?: string;
  disabledDate: (current: Dayjs | null) => boolean;
  preview: PreviewOvertimeEntryResult | null;
  previewLoading: boolean;
  periodLabel: string;
  onFinish?: (values: OvertimeEntryFormValues) => void | Promise<void>;
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
 * Overtime sheet entry fields with live hours preview from the schedule engine.
 */
export default function OvertimeEntryForm({
  form,
  formId = 'overtime-entry-form',
  disabledDate,
  preview,
  previewLoading,
  periodLabel,
  onFinish,
}: OvertimeEntryFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const watchedStart = Form.useWatch('startTime', form);
  const watchedEnd = Form.useWatch('endTime', form);
  const watchedOvernight = Form.useWatch('isOvernight', form);
  const crossesMidnight = endsAtOrBeforeStart(watchedStart, watchedEnd);

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
              <TimePicker className="w-full" format="HH:mm" minuteStep={15} />
            </Form.Item>

            <Form.Item
              name="endTime"
              label={t('hr.form.endTime')}
              dependencies={['startTime', 'isOvernight']}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.endTimeRequired'),
                },
                ({ getFieldValue }) => ({
                  validator: (_rule, value: Dayjs | undefined) =>
                    endsAtOrBeforeStart(getFieldValue('startTime'), value) &&
                    !getFieldValue('isOvernight')
                      ? Promise.reject(
                          new Error(t('hr.dateRules.overnightRequired')),
                        )
                      : Promise.resolve(),
                }),
              ]}
            >
              <TimePicker className="w-full" format="HH:mm" minuteStep={15} />
            </Form.Item>
            <Form.Item
              name="isOvernight"
              valuePropName="checked"
              className="md:col-span-2 !mb-0"
              extra={
                watchedOvernight && crossesMidnight && watchedStart && watchedEnd
                  ? t('hr.dateRules.overnightNote', {
                      hours: overnightHours(watchedStart, watchedEnd),
                    })
                  : undefined
              }
            >
              <Checkbox>{t('hr.dateRules.overnight')}</Checkbox>
            </Form.Item>
          </div>

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
