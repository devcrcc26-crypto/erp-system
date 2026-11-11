'use client';

import { useEffect, useMemo, useState } from 'react';
import { DatePicker, Form, Input, InputNumber, Select, Switch } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  CreatePublicHolidayPayload,
  HolidayNationality,
  PublicHoliday,
} from '@/lib/api/work-schedule.types';
import { formatProjectDate } from '@/lib/utils/project-display';

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

const DETAILS_FIELDS = [
  'name',
  'nameZh',
  'date',
  'appliesToNationality',
] as const;

const OPTIONS_FIELDS = [
  'isRecurring',
  'isActive',
  'notifyDaysBefore',
  'notes',
] as const;

function defaultValues(): PublicHolidayFormValues {
  return {
    name: '',
    nameZh: undefined,
    date: dayjs(),
    appliesToNationality: 'ALL',
    isRecurring: false,
    notifyDaysBefore: 2,
    isActive: true,
    notes: undefined,
  };
}

function valuesFromHoliday(holiday?: PublicHoliday): PublicHolidayFormValues {
  if (!holiday) {
    return defaultValues();
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

function ReviewItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}): React.ReactNode {
  return (
    <div
      className={`erp-ph-review-field${wide ? ' erp-ph-review-field--wide' : ''}`}
    >
      <p className="erp-ph-review-label">{label}</p>
      <p className="erp-ph-review-value">{value}</p>
    </div>
  );
}

/**
 * Create / edit public holiday - StepperForm (details → options → review).
 */
export default function PublicHolidayForm({
  holiday,
  isSubmitting,
  submitLabel,
  onSubmit,
  onCancel,
  cancelLabel,
}: {
  holiday?: PublicHoliday;
  isSubmitting: boolean;
  submitLabel: string;
  onSubmit: (values: PublicHolidayFormValues) => Promise<void>;
  onCancel?: () => void;
  cancelLabel?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const [form] = Form.useForm<PublicHolidayFormValues>();
  const [snapshot, setSnapshot] = useState<PublicHolidayFormValues>(
    defaultValues(),
  );

  useEffect(() => {
    const next = valuesFromHoliday(holiday);
    form.setFieldsValue(next);
    setSnapshot(next);
  }, [form, holiday]);

  function appliesLabel(value: HolidayNationality): string {
    if (value === 'ETHIOPIAN') {
      return t('hr.publicHoliday.ethiopianOnly');
    }
    if (value === 'CHINESE') {
      return t('hr.publicHoliday.chineseOnly');
    }
    return t('hr.publicHoliday.allEmployees');
  }

  function captureSnapshot(): PublicHolidayFormValues {
    const values = form.getFieldsValue(true) as PublicHolidayFormValues;
    setSnapshot(values);
    return values;
  }

  function resetForm(): void {
    const next = valuesFromHoliday(holiday);
    form.setFieldsValue(next);
    setSnapshot(next);
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields([...DETAILS_FIELDS]);
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function validateOptionsStep(): Promise<boolean> {
    try {
      await form.validateFields([...OPTIONS_FIELDS]);
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    const detailsOk = await validateDetailsStep();
    if (!detailsOk) {
      return;
    }
    const optionsOk = await validateOptionsStep();
    if (!optionsOk) {
      return;
    }
    const values = captureSnapshot();
    await onSubmit(values);
  }

  const review = snapshot;

  const steps = useMemo(
    () => [
      {
        title: t('hr.publicHoliday.steps.details'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.publicHoliday.steps.details')}
            description={t('pages.hr.publicHolidays.detailsStepDescription')}
          >
            <div className="erp-form-grid-2">
              <Form.Item
                name="name"
                label={t('hr.publicHoliday.name')}
                rules={[
                  {
                    required: true,
                    message: t('hr.publicHoliday.nameRequired'),
                  },
                ]}
              >
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item name="nameZh" label={t('hr.publicHoliday.nameZh')}>
                <Input maxLength={200} />
              </Form.Item>
              <Form.Item
                name="date"
                label={t('hr.publicHoliday.date')}
                rules={[
                  {
                    required: true,
                    message: t('hr.publicHoliday.dateRequired'),
                  },
                ]}
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
                    {
                      value: 'CHINESE',
                      label: t('hr.publicHoliday.chineseOnly'),
                    },
                  ]}
                />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('hr.publicHoliday.steps.options'),
        validate: () => validateOptionsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.publicHoliday.steps.options')}
            description={t('pages.hr.publicHolidays.optionsStepDescription')}
          >
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
              <Form.Item
                name="notifyDaysBefore"
                label={t('hr.publicHoliday.notifyDaysBefore')}
              >
                <InputNumber min={0} max={90} className="w-full" />
              </Form.Item>
              <Form.Item
                name="notes"
                label={t('hr.publicHoliday.notes')}
                className="md:col-span-2"
              >
                <Input.TextArea rows={3} maxLength={4000} showCount />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('hr.publicHoliday.steps.review'),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.publicHoliday.steps.review')}
            description={t('pages.hr.publicHolidays.reviewStepDescription')}
          >
            <div className="erp-ph-review-grid">
              <ReviewItem
                label={t('hr.publicHoliday.name')}
                value={review.name?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.publicHoliday.nameZh')}
                value={review.nameZh?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.publicHoliday.date')}
                value={
                  review.date
                    ? formatProjectDate(review.date.format('YYYY-MM-DD'))
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.publicHoliday.appliesTo')}
                value={appliesLabel(review.appliesToNationality ?? 'ALL')}
              />
              <ReviewItem
                label={t('hr.publicHoliday.recurring')}
                value={review.isRecurring ? t('common.yes') : t('common.no')}
              />
              <ReviewItem
                label={t('hr.publicHoliday.active')}
                value={
                  review.isActive ? t('common.active') : t('common.inactive')
                }
              />
              <ReviewItem
                label={t('hr.publicHoliday.notifyDaysBefore')}
                value={String(review.notifyDaysBefore ?? 0)}
              />
              <ReviewItem
                label={t('hr.publicHoliday.notes')}
                value={review.notes?.trim() || '-'}
                wide
              />
            </div>
          </FormLayout>
        ),
      },
    ],
    [review, t],
  );

  return (
    <Form<PublicHolidayFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      preserve
      initialValues={defaultValues()}
      className="flex min-h-0 flex-1 flex-col"
    >
      <StepperForm
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={isSubmitting}
        contentVariant="sections"
        submitLabel={submitLabel}
      />
    </Form>
  );
}
