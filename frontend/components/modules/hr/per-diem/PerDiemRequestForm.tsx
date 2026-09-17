'use client';

import { useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, Select } from 'antd';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { PerDiemRequestDetail } from '@/lib/api/per-diem.types';
import { PER_DIEM_CATEGORY_FIELDS } from '@/lib/constants/per-diem-destination-categories';
import { useBusinessTrips } from '@/lib/query/business-trip';
import { useCurrencyRates } from '@/lib/query/currency';
import { useFlightApplications } from '@/lib/query/flight';
import {
  useActiveEmployeePerDiemCategories,
  useSubmitPerDiemRequest,
} from '@/lib/query/per-diem';
import { tokens } from '@/lib/theme/tokens';
import { formatDisplayDate } from '@/lib/utils/date-format';
import {
  formatCurrencyAmount,
  formatEtbAmount,
} from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PerDiemFormValues {
  destinationCategory?: string;
  destination?: string;
  dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
  linkedTravel?: string;
  notes?: string;
}

interface PerDiemRequestFormProps {
  onSuccess: (result: PerDiemRequestDetail) => void;
}

const DESTINATION_FIELDS = ['destinationCategory', 'destination'] as const;
const DATES_FIELDS = ['dateRange'] as const;

function calcInclusiveCalendarDays(
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
): number {
  return end.startOf('day').diff(start.startOf('day'), 'day') + 1;
}

/**
 * Per diem create form — same StepperForm chrome as Add Employee.
 */
export default function PerDiemRequestForm({
  onSuccess,
}: PerDiemRequestFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('PER_DIEM');
  const messageApi = useAppMessage();
  const [form] = Form.useForm<PerDiemFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const ratesQuery = useActiveEmployeePerDiemCategories(onBehalf.employeeId);
  const ratesFxQuery = useCurrencyRates(true);
  const flightsQuery = useFlightApplications(
    { status: 'APPROVED', limit: 50 },
    true,
  );
  const tripsQuery = useBusinessTrips({ status: 'APPROVED', limit: 50 }, true);
  const submitMutation = useSubmitPerDiemRequest();

  const formValues = Form.useWatch([], form) as PerDiemFormValues | undefined;
  const destinationCategory = formValues?.destinationCategory;
  const dateRange = formValues?.dateRange;

  const selectedRate = useMemo(
    () =>
      ratesQuery.data?.find(
        (entry) => entry.destinationCategory === destinationCategory,
      ),
    [ratesQuery.data, destinationCategory],
  );

  const days = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) {
      return 0;
    }
    return calcInclusiveCalendarDays(dateRange[0], dateRange[1]);
  }, [dateRange]);

  const totalAmount = selectedRate ? Number(selectedRate.dailyRate) * days : 0;
  const totalAmountEtb =
    selectedRate && days > 0
      ? selectedRate.currency === 'ETB'
        ? totalAmount
        : totalAmount * (ratesFxQuery.data?.[selectedRate.currency] ?? 0)
      : 0;

  const travelOptions = useMemo(
    () => [
      ...(flightsQuery.data?.data ?? [])
        .filter((flight) => flight.submittedBy === onBehalf.effectiveEmployeeId)
        .map((flight) => ({
        value: `flight:${flight.id}`,
        label: `Flight ${flight.applicationNumber} — ${flight.destination}`,
      })),
      ...(tripsQuery.data?.data ?? [])
        .filter((trip) => trip.submittedBy === onBehalf.effectiveEmployeeId)
        .map((trip) => ({
        value: `trip:${trip.id}`,
        label: `Business Trip ${trip.tripNumber} — ${trip.destinationCountry}`,
      })),
    ],
    [flightsQuery.data?.data, tripsQuery.data?.data, onBehalf.effectiveEmployeeId],
  );

  const categoryOptions = useMemo(
    () =>
      (ratesQuery.data ?? []).map((entry) => {
        const labelKey =
          PER_DIEM_CATEGORY_FIELDS[
            entry.destinationCategory as keyof typeof PER_DIEM_CATEGORY_FIELDS
          ]?.labelKey;
        const label = labelKey ? t(labelKey) : entry.destinationCategory;
        return {
          value: entry.destinationCategory,
          label: `${label} — ${formatCurrencyAmount(entry.dailyRate, entry.currency)}/day`,
        };
      }),
    [ratesQuery.data, t],
  );

  const categoryLabel = useMemo(() => {
    if (!destinationCategory) {
      return '—';
    }
    return (
      categoryOptions.find((option) => option.value === destinationCategory)
        ?.label ?? destinationCategory
    );
  }, [categoryOptions, destinationCategory]);

  const linkedTravelLabel = useMemo(() => {
    const value = formValues?.linkedTravel;
    if (!value) {
      return '—';
    }
    return travelOptions.find((option) => option.value === value)?.label ?? '—';
  }, [formValues?.linkedTravel, travelOptions]);

  const noActiveRates =
    !ratesQuery.isLoading && (ratesQuery.data?.length ?? 0) === 0;

  function resetForm(): void {
    onBehalf.reset();
    form.resetFields();
    setFormError(null);
  }

  async function validateFields(
    fields: readonly string[],
  ): Promise<boolean> {
    try {
      await form.validateFields([...fields]);
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);

    if (noActiveRates) {
      messageApi.warning(t('hr.messages.noActiveEmployeePerDiemRates'));
      return;
    }

    let values: PerDiemFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    if (
      !values.destinationCategory ||
      !values.destination?.trim() ||
      !values.dateRange?.[0] ||
      !values.dateRange?.[1]
    ) {
      return;
    }

    const rate = ratesQuery.data?.find(
      (entry) => entry.destinationCategory === values.destinationCategory,
    );
    if (!rate) {
      messageApi.warning(t('hr.validation.selectDestinationCategory'));
      return;
    }

    const [kind, id] = values.linkedTravel?.split(':') ?? [];

    setSubmitting(true);
    try {
      const created = await submitMutation.mutateAsync({
        ...onBehalf.payload,
        destinationCategory: values.destinationCategory,
        destination: values.destination.trim(),
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        linkedFlightId: kind === 'flight' ? id : undefined,
        linkedBusinessTripId: kind === 'trip' ? id : undefined,
        notes: values.notes?.trim() || undefined,
      });
      messageApi.success(t('hr.messages.perDiemSubmitted'));
      onSuccess(created);
    } catch (error: unknown) {
      const message = t('hr.messages.perDiemSubmitFailed');
      notifyApiError(error, message, messageApi);
      setFormError(
        error instanceof ApiRequestError ? error.message : message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const estimateBlock =
    selectedRate && days > 0 ? (
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-[rgba(0,0,0,0.06)] pt-4 sm:grid-cols-2">
        <EstimateItem
          label={t('hr.form.totalDays')}
          value={String(days)}
        />
        <EstimateItem
          label={t('hr.form.dailyRate')}
          value={formatCurrencyAmount(
            selectedRate.dailyRate,
            selectedRate.currency,
          )}
        />
        <EstimateItem
          label={t('hr.form.totalAmount')}
          value={formatCurrencyAmount(totalAmount, selectedRate.currency)}
          emphasize
        />
        <EstimateItem
          label={t('hr.form.etbEquivalent')}
          value={formatEtbAmount(totalAmountEtb)}
        />
      </div>
    ) : null;

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.destinationCategory'),
        validate: () => validateFields(DESTINATION_FIELDS),
        content: (
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
            <FormLayout
              variant="pro"
              title={t('hr.form.destinationCategory')}
              description={t('pages.hr.perDiem.destinationStepDescription')}
            >
              <div className="erp-form-grid-2">
                <Form.Item
                  name="destinationCategory"
                  label={t('hr.form.destinationCategory')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.selectDestinationCategory'),
                    },
                  ]}
                >
                  <Select
                    loading={ratesQuery.isLoading}
                    placeholder={t('hr.placeholder.selectDestinationCategory')}
                    options={categoryOptions}
                    disabled={noActiveRates}
                  />
                </Form.Item>
                <Form.Item
                  name="destination"
                  label={t('hr.form.specificDestination')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.enterDestination'),
                    },
                  ]}
                >
                  <Input
                    placeholder={t('hr.placeholder.enterDestination')}
                    maxLength={200}
                  />
                </Form.Item>
              </div>
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateFields(DATES_FIELDS),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.requestDetails')}
            description={t('pages.hr.perDiem.detailsStepDescription')}
          >
            <Form.Item
              name="dateRange"
              label={`${t('hr.form.startDate')} / ${t('hr.form.endDate')}`}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.selectLeaveDates'),
                },
              ]}
              extra={
                days > 0
                  ? t('hr.form.totalDaysCalculated', { days })
                  : undefined
              }
            >
              <DatePicker.RangePicker
                className="w-full"
                picker="date"
                format="YYYY-MM-DD"
              />
            </Form.Item>

            <Form.Item name="linkedTravel" label={t('hr.form.linkedTravel')}>
              <Select
                allowClear
                placeholder={t('hr.placeholder.selectLinkedTravel')}
                options={travelOptions}
              />
            </Form.Item>

            <Form.Item name="notes" label={t('hr.form.notes')}>
              <Input.TextArea
                rows={3}
                maxLength={2000}
                showCount
                placeholder={t('hr.placeholder.enterNotes')}
              />
            </Form.Item>

            {estimateBlock}
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.reviewSubmit')}
            description={t('pages.hr.perDiem.reviewStepDescription')}
          >
            <div className="erp-form-grid-2">
              <ReviewItem
                label={t('hr.form.destinationCategory')}
                value={categoryLabel}
              />
              <ReviewItem
                label={t('hr.form.specificDestination')}
                value={formValues?.destination?.trim() || '—'}
              />
              <ReviewItem
                label={t('hr.form.startDate')}
                value={
                  dateRange?.[0]
                    ? formatDisplayDate(dateRange[0].format('YYYY-MM-DD'))
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.form.endDate')}
                value={
                  dateRange?.[1]
                    ? formatDisplayDate(dateRange[1].format('YYYY-MM-DD'))
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.form.totalDays')}
                value={days > 0 ? String(days) : '—'}
              />
              <ReviewItem
                label={t('hr.form.dailyRate')}
                value={
                  selectedRate
                    ? formatCurrencyAmount(
                        selectedRate.dailyRate,
                        selectedRate.currency,
                      )
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.form.totalAmount')}
                value={
                  selectedRate && days > 0
                    ? formatCurrencyAmount(totalAmount, selectedRate.currency)
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.form.linkedTravel')}
                value={linkedTravelLabel}
              />
              {formValues?.notes?.trim() ? (
                <ReviewItem
                  label={t('hr.form.notes')}
                  value={formValues.notes.trim()}
                />
              ) : null}
            </div>
            {estimateBlock}
          </FormLayout>
        ),
      },
    ],
    [
      onBehalf,
      t,
      ratesQuery.isLoading,
      categoryOptions,
      noActiveRates,
      travelOptions,
      estimateBlock,
      categoryLabel,
      formValues,
      dateRange,
      linkedTravelLabel,
      days,
      selectedRate,
      totalAmount,
    ],
  );

  return (
    <Form<PerDiemFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      preserve
      className="flex min-h-0 flex-1 flex-col"
    >
      {formError ? (
        <Alert
          type="error"
          showIcon
          title={formError}
          className="mb-4"
          closable
          onClose={() => setFormError(null)}
        />
      ) : null}

      {noActiveRates ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          title={t('hr.messages.noActiveEmployeePerDiemRates')}
          description={t('hr.messages.noActiveEmployeePerDiemRatesDesc')}
        />
      ) : null}

      <StepperForm
        steps={steps}
        onSubmit={handleSubmit}
        onReset={resetForm}
        isSubmitting={submitting}
        contentVariant="sections"
        submitLabel={t('hr.buttons.submitRequest')}
      />
    </Form>
  );
}

function EstimateItem({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p
        className="mb-1 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p
        className={`m-0 ${emphasize ? 'text-base font-bold' : 'text-sm font-semibold'}`}
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
}

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p
        className="mb-0.5 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p
        className="m-0 whitespace-pre-wrap text-sm"
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
}
