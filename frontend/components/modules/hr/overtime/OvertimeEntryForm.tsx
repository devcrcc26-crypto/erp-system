'use client';

import { Alert, Checkbox, DatePicker, Form, Input, TimePicker } from 'antd';
import type { FormInstance } from 'antd/es/form';
import type { Dayjs } from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
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
}

export default function OvertimeEntryForm({
  form,
  formId = 'overtime-entry-form',
  disabledDate,
  liveHours,
}: OvertimeEntryFormProps): React.ReactNode {
  const { t } = useEpcTranslation();

  return (
    <Form<OvertimeEntryFormValues>
      id={formId}
      form={form}
      layout="vertical"
      requiredMark={false}
      onFinish={() => undefined}
    >
      <FormLayout variant="pro" dense title={t('hr.section.entryDetails')}>
        <div className="erp-form-grid-2">
          <Form.Item
            name="date"
            label={t('hr.table.date')}
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
          <Form.Item name="isHoliday" valuePropName="checked">
            <Checkbox className="mt-8">
              {t('hr.overtimeCategory.holiday')}
            </Checkbox>
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
          {liveHours ? (
            <div className="md:col-span-2">
              <Alert
                type="info"
                showIcon
                title={t('hr.labels.liveHoursBreakdown', {
                  regular: formatOvertimeHours(liveHours.regularHours),
                  night: formatOvertimeHours(liveHours.nightHours),
                  weekend: formatOvertimeHours(liveHours.weekendHours),
                  holiday: formatOvertimeHours(liveHours.holidayHours),
                })}
              />
            </div>
          ) : null}
          <Form.Item
            name="taskDescription"
            label={t('hr.labels.taskDescription')}
            className="md:col-span-2"
            rules={[
              {
                required: true,
                message: t('hr.validation.taskDescriptionRequired'),
              },
              { max: 4000 },
            ]}
          >
            <Input.TextArea rows={3} maxLength={4000} showCount />
          </Form.Item>
        </div>
      </FormLayout>
    </Form>
  );
}
