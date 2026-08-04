'use client';

import { useEffect, useMemo } from 'react';
import { Alert, Button, DatePicker, Form, Input, Select, Space } from 'antd';
import dayjs from 'dayjs';
import { useRouter } from 'next/navigation';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { ApiRequestError } from '@/lib/api/errors';
import { useFlightApplications } from '@/lib/query/flight';
import { useBusinessTrips } from '@/lib/query/business-trip';
import { useCurrencyRates } from '@/lib/query/currency';
import { useActivePerDiemRates, useSubmitPerDiemRequest } from '@/lib/query/per-diem';
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
 * Rate, days, and totals are all derived — the employee only picks a
 * destination category, dates, and optionally links an approved trip.
 */
export default function PerDiemRequestFormContent(): React.ReactNode {
  const router = useRouter();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<PerDiemFormValues>();

  const ratesQuery = useActivePerDiemRates(true);
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
    () => ratesQuery.data?.find((r) => r.destinationCategory === destinationCategory),
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
    ...(tripsQuery.data?.data ?? []).map((t) => ({
      value: `trip:${t.id}`,
      label: `Business Trip ${t.tripNumber} - ${t.destinationCountry}`,
    })),
  ];

  async function handleSubmit(values: PerDiemFormValues): Promise<void> {
    if (!selectedRate) {
      messageApi.warning('Select a destination category');
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
      messageApi.success('Per diem request submitted');
      if (created.approvalRequestId) {
        router.push(`/approvals/${created.approvalRequestId}`);
      } else {
        router.push('/approvals/new');
      }
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit per diem request', messageApi);
    }
  }

  return (
    <FormLayout
      title="New Per Diem Request"
      description="Daily allowance based on your destination category. Amount auto-calculates from days × rate."
      extra={
        <Space>
          <Button onClick={() => router.push('/approvals/new')}>Cancel</Button>
          <Button
            type="primary"
            loading={submitMutation.isPending}
            onClick={() => form.submit()}
          >
            Submit
          </Button>
        </Space>
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
              : 'Submit failed'
          }
        />
      ) : null}

      <div className="mx-auto w-full max-w-2xl flex flex-col gap-4">
        <SectionCard title="Per Diem Details" bodyClassName="px-5 py-4">
          <Form
            form={form}
            layout="vertical"
            onFinish={(values) => void handleSubmit(values)}
          >
            <Form.Item
              name="destinationCategory"
              label="Destination Category"
              rules={[{ required: true, message: 'Select a destination category' }]}
            >
              <Select
                loading={ratesQuery.isLoading}
                placeholder="Select destination category"
                options={(ratesQuery.data ?? []).map((rate) => ({
                  value: rate.destinationCategory,
                  label: `${rate.destinationCategory} - ${formatCurrencyAmount(rate.dailyRate, rate.currency)}/day`,
                }))}
              />
            </Form.Item>

            <Form.Item
              name="destination"
              label="Destination"
              rules={[{ required: true, message: 'Enter the specific destination' }]}
            >
              <Input placeholder="e.g. Nairobi, Kenya" maxLength={200} />
            </Form.Item>

            <Form.Item
              name="dateRange"
              label="Travel Dates"
              rules={[{ required: true, message: 'Select start and end dates' }]}
            >
              <DatePicker.RangePicker className="w-full" />
            </Form.Item>

            <Form.Item name="linkedTravel" label="Linked Travel (optional)">
              <Select
                allowClear
                placeholder="Link to an approved flight or business trip"
                options={travelOptions}
              />
            </Form.Item>

            <Form.Item name="notes" label="Notes">
              <Input.TextArea rows={3} maxLength={2000} showCount />
            </Form.Item>
          </Form>
        </SectionCard>

        {selectedRate && days > 0 ? (
          <SectionCard title="Estimated Amount" bodyClassName="px-5 py-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  Days
                </dt>
                <dd className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {days}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  Daily Rate
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {formatCurrencyAmount(selectedRate.dailyRate, selectedRate.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  Total Amount
                </dt>
                <dd className="text-sm text-[var(--color-text-primary)]">
                  {formatCurrencyAmount(totalAmount, selectedRate.currency)}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-[var(--color-text-tertiary)] uppercase tracking-wide mb-1">
                  ETB Equivalent
                </dt>
                <dd className="text-base font-bold text-[var(--color-text-primary)]">
                  {formatEtbAmount(totalAmountEtb)}
                </dd>
              </div>
            </dl>
          </SectionCard>
        ) : null}
      </div>
    </FormLayout>
  );
}
