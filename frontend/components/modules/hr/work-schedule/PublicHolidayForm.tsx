'use client';

import { useEffect } from 'react';
import { Button, DatePicker, Form, Input, InputNumber, Select, Switch } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  CreatePublicHolidayPayload,
  HolidayNationality,
  PublicHoliday,
} from '@/lib/api/work-schedule.types';

export interface PublicHolidayFormValues {
  name: string;
  nameZh?: string;
  date: Dayjs;
  appliesToNationality: HolidayNationality;
  isRecurring: boolean;
  notifyDaysBefore: number;
  isActive: boolean;
  notes?: string;
}

function valuesFromHoliday(
  holiday?: PublicHoliday,
): Partial<PublicHolidayFormValues> {
  if (!holiday) {
    return {
      appliesToNationality: 'ALL',
      isRecurring: false,
      notifyDaysBefore: 2,
      isActive: true,
    };
  }
  return {
    name: holiday.name,
    nameZh: holiday.nameZh ?? undefined,
    date: dayjs(holiday.date),
    appliesToNationality: holiday.appliesToNationality,
    isRecurring: holiday.isRecurring,
    notifyDaysBefore: holiday.notifyDaysBefore,
    isActive: holiday.isActive,
    notes: holiday.notes ?? undefined,
  };
}

export function buildPublicHolidayPayload(
  values: PublicHolidayFormValues,
): CreatePublicHolidayPayload {
  return {
    name: values.name.trim(),
    nameZh: values.nameZh?.trim() || undefined,
    date: values.date.format('YYYY-MM-DD'),
    appliesToNationality: values.appliesToNationality,
    isRecurring: values.isRecurring,
    notifyDaysBefore: values.notifyDaysBefore,
    isActive: values.isActive,
    notes: values.notes?.trim() || undefined,
  };
}

/**
 * Create / edit public holiday form.
 */
export default function PublicHolidayForm({
  holiday,
  isSubmitting,
  submitLabel,
  onSubmit,
}: {
  holiday?: PublicHoliday;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: PublicHolidayFormValues) => Promise<void>;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<PublicHolidayFormValues>();

  useEffect(() => {
    form.setFieldsValue(valuesFromHoliday(holiday));
  }, [form, holiday]);

  return (
    <Form<PublicHolidayFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      initialValues={valuesFromHoliday(holiday)}
      onFinish={(values) => void onSubmit(values)}
      className="flex flex-col gap-4"
    >
      <FormLayout
        variant="pro"
        title={t('hr.publicHoliday.details')}
        description={t('hr.publicHoliday.formDescription')}
      >
        <Form.Item
          name="name"
          label={t('hr.publicHoliday.name')}
          rules={[{ required: true, message: t('hr.publicHoliday.nameRequired') }]}
        >
          <Input maxLength={200} />
        </Form.Item>
        <Form.Item name="nameZh" label={t('hr.publicHoliday.nameZh')}>
          <Input maxLength={200} />
        </Form.Item>
        <div className="erp-form-grid-2">
          <Form.Item
            name="date"
            label={t('hr.publicHoliday.date')}
            rules={[{ required: true, message: t('hr.publicHoliday.dateRequired') }]}
          >
            <DatePicker className="w-full" />
          </Form.Item>
          <Form.Item
            name="appliesToNationality"
            label={t('hr.publicHoliday.appliesTo')}
            rules={[{ required: true }]}
          >
            <Select
              options={[
                { value: 'ALL', label: t('hr.publicHoliday.allEmployees') },
                {
                  value: 'ETHIOPIAN',
                  label: t('hr.publicHoliday.ethiopianOnly'),
                },
                { value: 'CHINESE', label: t('hr.publicHoliday.chineseOnly') },
              ]}
            />
          </Form.Item>
        </div>
        <div className="erp-form-grid-2">
          <Form.Item
            name="isRecurring"
            label={t('hr.publicHoliday.recurring')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item
            name="isActive"
            label={t('hr.publicHoliday.active')}
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
        </div>
        <Form.Item
          name="notifyDaysBefore"
          label={t('hr.publicHoliday.notifyDaysBefore')}
        >
          <InputNumber min={0} max={90} className="w-full" />
        </Form.Item>
        <Form.Item name="notes" label={t('hr.publicHoliday.notes')}>
          <Input.TextArea rows={3} maxLength={4000} />
        </Form.Item>
      </FormLayout>

      <div className="flex justify-end">
        <Button type="primary" htmlType="submit" loading={isSubmitting}>
          {submitLabel}
        </Button>
      </div>
    </Form>
  );
}
