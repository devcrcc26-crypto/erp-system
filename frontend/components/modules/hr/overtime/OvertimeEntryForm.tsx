'use client';

import { Checkbox, DatePicker, Form, Input, TimePicker } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatOvertimeHours } from '@/lib/utils/overtime-display';
import { calculateOvertimeHours } from '@/lib/utils/overtime-hours.util';

type LiveHours = ReturnType<typeof calculateOvertimeHours>;

export interface OvertimeEntryFormValues {
  date: Dayjs;
  startTime: Dayjs;
  endTime: Dayjs;
  isHoliday: boolean;
  taskDescription: string;
}

interface OvertimeEntryFormProps {
  form: FormInstance<OvertimeEntryFormValues>;
  formId?: string;
  disabledDate: (current: Dayjs | null) => boolean;
  liveHours: LiveHours | null;
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
}: {
  label: string;
  value: string;
  emphasize?: boolean;
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
    </div>
  );
}

/**
 * Overtime sheet entry fields with live hours preview.
 */
export default function OvertimeEntryForm({
  form,
  formId = 'overtime-entry-form',
  disabledDate,
  liveHours,
  periodLabel,
  onFinish,
}: OvertimeEntryFormProps): React.ReactNode {
  const { t } = useEpcTranslation();

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
              rules={[
                {
                  required: true,
                  message: t('hr.validation.endTimeRequired'),
                },
              ]}
            >
              <TimePicker className="w-full" format="HH:mm" minuteStep={15} />
            </Form.Item>

            <Form.Item name="isHoliday" valuePropName="checked" className="md:col-span-2 !mb-0">
              <Checkbox className="erp-overtime-holiday-check w-full rounded-lg border border-[#e8ebef] bg-[#fafbfc] px-3 py-3">
                <span className="inline-flex flex-col gap-0.5 pl-1">
                  <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                    {t('hr.overtimeCategory.holiday')}
                  </span>
                  <span className="text-[12px] font-normal text-[var(--color-text-secondary)]">
                    {t('hr.labels.overtimeHolidayHint')}
                  </span>
                </span>
              </Checkbox>
            </Form.Item>
          </div>
        </DrawerSection>

        <DrawerSection title={t('hr.section.hoursPreview')}>
          {liveHours ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <HoursPreviewChip
                label={t('hr.overtimeCategory.regular')}
                value={formatOvertimeHours(liveHours.regularHours)}
              />
              <HoursPreviewChip
                label={t('hr.overtimeCategory.night')}
                value={formatOvertimeHours(liveHours.nightHours)}
              />
              <HoursPreviewChip
                label={t('hr.overtimeCategory.weekend')}
                value={formatOvertimeHours(liveHours.weekendHours)}
              />
              <HoursPreviewChip
                label={t('hr.overtimeCategory.holiday')}
                value={formatOvertimeHours(liveHours.holidayHours)}
              />
              <HoursPreviewChip
                label={t('hr.overtimeCategory.total')}
                value={formatOvertimeHours(
                  Math.round(
                    (liveHours.regularHours +
                      liveHours.nightHours +
                      liveHours.weekendHours +
                      liveHours.holidayHours) *
                      100,
                  ) / 100,
                )}
                emphasize
              />
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
