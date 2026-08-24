'use client';

import { useEffect, useMemo } from 'react';
import { Alert, Button, DatePicker, Form, Input, Select } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import { PER_DIEM_CATEGORY_FIELDS } from '@/lib/constants/per-diem-destination-categories';
import { useFlightApplications } from '@/lib/query/flight';
import { useBusinessTrips } from '@/lib/query/business-trip';
import { useCurrencyRates } from '@/lib/query/currency';
import {
  useMyActiveEmployeePerDiemCategories,
  useSubmitPerDiemRequest,
} from '@/lib/query/per-diem';
import { formatCurrencyAmount, formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface PerDiemFormValues {
  destinationCategory: string;
  destination: string;
  dateRange: [dayjs.Dayjs, dayjs.Dayjs];
  linkedTravel?: string;
  notes?: string;
}

/**
 * Standalone per diem request form under Approvals → New Request.
 * Rate, days, and totals are derived from the employee's configured rates.
 */
export default function PerDiemRequestFormContent(): React.ReactNode {
  const { t } = useEpcTranslation();
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<PerDiemFormValues>();

  const ratesQuery = useMyActiveEmployeePerDiemCategories(true);
  const ratesFxQuery = useCurrencyRates(true);
  const flightsQuery = useFlightApplications(
    { status: 'APPROVED', limit: 50 },
    true,
  );
  const tripsQuery = useBusinessTrips({ status: 'APPROVED', limit: 50 }, true);
  const submitMutation = useSubmitPerDiemRequest();

  const destinationCategory = Form.useWatch('destinationCategory', form);
  const dateRange = Form.useWatch('dateRange', form) as
    | [dayjs.Dayjs, dayjs.Dayjs]
    | undefined;

  useEffect(() => {
    form.setFieldsValue({ dateRange: undefined });
  }, [form]);

  const selectedRate = useMemo(
    () =>
      ratesQuery.data?.find((entry) => entry.destinationCategory === destinationCategory),
    [ratesQuery.data, destinationCategory],
  );

  const days = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) return 0;
    return dateRange[1].startOf('day').diff(dateRange[0].startOf('day'), 'day') + 1;
  }, [dateRange]);

  const totalAmount = selectedRate ? Number(selectedRate.dailyRate) * days : 0;
  const totalAmountEtb =
    selectedRate && days > 0
      ? selectedRate.currency === 'ETB'
        ? totalAmount
        : totalAmount * (ratesFxQuery.data?.[selectedRate.currency] ?? 0)
      : 0;

  const travelOptions = [
    ...(flightsQuery.data?.data ?? []).map((f) => ({
      value: `flight:${f.id}`,
      label: `Flight ${f.applicationNumber} - ${f.destination}`,
    })),
    ...(tripsQuery.data?.data ?? []).map((trip) => ({
      value: `trip:${trip.id}`,
      label: `Business Trip ${trip.tripNumber} - ${trip.destinationCountry}`,
    })),
  ];

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
          label: `${label} - ${formatCurrencyAmount(entry.dailyRate, entry.currency)}/day`,
        };
      }),
    [ratesQuery.data, t],
  );

  async function handleSubmit(values: PerDiemFormValues): Promise<void> {
    if (!selectedRate) {
      messageApi.warning(t('hr.validation.selectDestinationCategory'));
      return;
    }
    const [kind, id] = values.linkedTravel?.split(':') ?? [];
    try {
      const created = await submitMutation.mutateAsync({
        destinationCategory: values.destinationCategory,
        destination: values.destination.trim(),
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        linkedFlightId: kind === 'flight' ? id : undefined,
        linkedBusinessTripId: kind === 'trip' ? id : undefined,
        notes: values.notes?.trim() || undefined,
      });
      messageApi.success(t('hr.messages.perDiemSubmitted'));
      if (created.approvalRequestId) {
        router.push(`/approvals/${created.approvalRequestId}`);
      } else {
        router.push('/approvals/new');
      }
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.perDiemSubmitFailed'), messageApi);
    }
  }

  return (
    <HrFormPageShell
      title={t('hr.buttons.newPerDiem')}
      description={t('pages.hr.perDiem.formDescription')}
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
      headerExtra={
        <Button
          type="primary"
          loading={submitMutation.isPending}
          onClick={() => form.submit()}
          style={{ borderRadius: 0 }}
        >
          {t('hr.buttons.submitRequest')}
        </Button>
      }
    >
      {submitMutation.isError ? (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          title={
            submitMutation.error instanceof ApiRequestError
              ? submitMutation.error.message
              : t('hr.messages.perDiemSubmitFailed')
          }
        />
      ) : null}

      {!ratesQuery.isLoading && (ratesQuery.data?.length ?? 0) === 0 ? (
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          title={t('hr.messages.noActiveEmployeePerDiemRates')}
          description={t('hr.messages.noActiveEmployeePerDiemRatesDesc')}
        />
      ) : null}

      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-3 py-4 sm:px-5">
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => void handleSubmit(values)}
          >
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
              />
            </Form.Item>

            <Form.Item
              name="destination"
              label={t('hr.form.specificDestination')}
              rules={[
                { required: true, message: t('hr.validation.enterDestination') },
              ]}
            >
              <Input placeholder={t('hr.placeholder.enterDestination')} maxLength={200} />
            </Form.Item>

            <Form.Item
              name="dateRange"
              label={`${t('hr.form.startDate')} / ${t('hr.form.endDate')}`}
              rules={[
                { required: true, message: t('hr.validation.selectLeaveDates') },
              ]}
            >
              <DatePicker.RangePicker className="w-full" />
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
          </Form>
        </SectionCard>

        {selectedRate && days > 0 ? (
          <SectionCard title={t('hr.form.estimatedTotal')} bodyClassName="px-3 py-4 sm:px-5">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  {t('hr.table.days')}
                </dt>
                <dd className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {days}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  {t('hr.form.dailyRate')}
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {formatCurrencyAmount(selectedRate.dailyRate, selectedRate.currency)}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  {t('hr.form.totalAmount')}
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {formatCurrencyAmount(totalAmount, selectedRate.currency)}
                </dd>
              </div>
              <div>
                <dt className="mb-1 text-xs font-medium uppercase tracking-wide text-[var(--color-text-tertiary)]">
                  {t('hr.form.etbEquivalent')}
                </dt>
                <dd className="text-base font-bold text-[var(--color-text-primary)]">
                  {formatEtbAmount(totalAmountEtb)}
                </dd>
              </div>
            </dl>
          </SectionCard>
        ) : null}
      </div>
    </HrFormPageShell>
  );
}
