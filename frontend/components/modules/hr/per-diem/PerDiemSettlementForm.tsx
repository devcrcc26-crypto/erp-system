'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Checkbox,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Spin,
  TimePicker,
} from 'antd';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type { PerDiemSettlementDetail } from '@/lib/api/per-diem.types';
import {
  useActiveEmployeePerDiemCategories,
  useSubmitPerDiemSettlement,
  useUnsettledPerDiemAdvances,
} from '@/lib/query/per-diem';
import { tokens } from '@/lib/theme/tokens';
import { formatDisplayDate } from '@/lib/utils/date-format';
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface SettlementFormValues {
  destination?: string;
  departureDate?: dayjs.Dayjs;
  departureTime?: dayjs.Dayjs;
  returnDate?: dayjs.Dayjs;
  returnTime?: dayjs.Dayjs;
  actualDays?: number;
  vehicleUsed?: boolean;
  kmDeparture?: number;
  kmReturn?: number;
  notes?: string;
}

interface PerDiemSettlementFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: PerDiemSettlementDetail) => void;
}

function inclusiveDays(start: dayjs.Dayjs, end: dayjs.Dayjs): number {
  return end.startOf('day').diff(start.startOf('day'), 'day') + 1;
}

const TRIP_FIELDS = [
  'destination',
  'departureDate',
  'departureTime',
  'returnDate',
  'returnTime',
  'actualDays',
] as const;

/**
 * Settlement sheet: actual trip, optional vehicle, advances taken, and the ETB balance.
 */
export default function PerDiemSettlementForm({
  onSuccess,
  onCancel,
  cancelLabel,
}: PerDiemSettlementFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<SettlementFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const advancesQuery = useUnsettledPerDiemAdvances();
  const ratesQuery = useActiveEmployeePerDiemCategories(undefined);
  const submitMutation = useSubmitPerDiemSettlement();
  const values = Form.useWatch([], form) as SettlementFormValues | undefined;

  const advances = advancesQuery.data ?? [];
  const paidAdvances = advances.filter(
    (row) => (row._count?.disbursements ?? 0) > 0,
  );
  const selected = advances.filter((row) => selectedIds.includes(row.id));
  const category = selected[0]?.destinationCategory;
  const mixedCategory =
    selected.length > 1 &&
    selected.some((row) => row.destinationCategory !== category);

  const calendarSpan =
    values?.departureDate && values?.returnDate
      ? Math.max(inclusiveDays(values.departureDate, values.returnDate), 0)
      : 0;
  const actualDays = values?.actualDays ?? 0;
  const rate = ratesQuery.data?.find(
    (entry) => entry.destinationCategory === category,
  );
  const dailyRate = rate ? Number(rate.dailyRate) : 0;
  const totalAdvances = selected.reduce(
    (sum, row) => sum + Number(row.totalAmount),
    0,
  );
  const perDiemEarned = actualDays > 0 && dailyRate > 0 ? actualDays * dailyRate : 0;
  const difference = totalAdvances - perDiemEarned;
  const kmDifference =
    values?.vehicleUsed &&
    values.kmDeparture != null &&
    values.kmReturn != null
      ? values.kmReturn - values.kmDeparture
      : null;

  const directionLabel =
    difference > 0
      ? t('pages.hr.perDiemSettlement.balanceCompany')
      : difference < 0
        ? t('pages.hr.perDiemSettlement.balanceEmployee')
        : t('pages.hr.perDiemSettlement.balanceNone');

  function toggleAdvance(id: string, checked: boolean): void {
    setSelectedIds((current) =>
      checked ? [...current, id] : current.filter((item) => item !== id),
    );
  }

  async function validateFields(fields: readonly string[]): Promise<boolean> {
    try {
      await form.validateFields([...fields]);
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    let formValues: SettlementFormValues;
    try {
      formValues = await form.validateFields();
    } catch {
      return;
    }
    if (
      !formValues.destination?.trim() ||
      !formValues.departureDate ||
      !formValues.returnDate ||
      !formValues.departureTime ||
      !formValues.returnTime ||
      !formValues.actualDays
    ) {
      return;
    }
    if (selected.length === 0) {
      messageApi.warning(t('hr.validation.selectAdvances'));
      return;
    }
    if (mixedCategory) {
      messageApi.warning(t('hr.validation.advancesSameCategory'));
      return;
    }
    const span = inclusiveDays(formValues.departureDate, formValues.returnDate);
    if (formValues.actualDays < 1 || formValues.actualDays > span) {
      messageApi.warning(t('hr.validation.perDiemDaysRange', { max: span }));
      return;
    }
    if (formValues.vehicleUsed) {
      if (formValues.kmDeparture == null || formValues.kmReturn == null) {
        messageApi.warning(t('hr.validation.kmReadingsRequired'));
        return;
      }
      if (formValues.kmReturn < formValues.kmDeparture) {
        messageApi.warning(t('hr.validation.kmReturnOrder'));
        return;
      }
    }

    setSubmitting(true);
    try {
      const created = await submitMutation.mutateAsync({
        destination: formValues.destination.trim(),
        actualDepartureDate: formValues.departureDate.format('YYYY-MM-DD'),
        actualDepartureTime: formValues.departureTime.format('HH:mm'),
        actualReturnDate: formValues.returnDate.format('YYYY-MM-DD'),
        actualReturnTime: formValues.returnTime.format('HH:mm'),
        actualDays: formValues.actualDays,
        advanceIds: selectedIds,
        vehicleUsed: formValues.vehicleUsed === true,
        kmDeparture: formValues.vehicleUsed ? formValues.kmDeparture : undefined,
        kmReturn: formValues.vehicleUsed ? formValues.kmReturn : undefined,
        notes: formValues.notes?.trim() || undefined,
      });
      messageApi.success(t('hr.messages.perDiemSettlementSubmitted'));
      onSuccess(created);
    } catch (error: unknown) {
      const message = t('hr.messages.perDiemSettlementSubmitFailed');
      notifyApiError(error, message, messageApi);
      setFormError(error instanceof ApiRequestError ? error.message : message);
    } finally {
      setSubmitting(false);
    }
  }

  const calculation = (
    <div className="mt-4 border-t border-[rgba(0,0,0,0.06)] pt-4">
      <p className="mb-3 text-sm font-semibold" style={{ color: tokens.colorTextPrimary }}>
        {t('pages.hr.perDiemSettlement.calculation')}
      </p>
      <CalculationRow
        label={t('pages.hr.perDiemSettlement.advancesTaken')}
        value={formatEtbAmount(totalAdvances)}
      />
      <CalculationRow
        label={t('pages.hr.perDiemSettlement.lessPerDiem', {
          days: actualDays || 0,
          rate: formatEtbAmount(dailyRate),
        })}
        value={formatEtbAmount(perDiemEarned)}
      />
      <div className="my-2 border-t border-[rgba(0,0,0,0.12)]" />
      <CalculationRow
        label={directionLabel}
        value={formatEtbAmount(Math.abs(difference))}
        emphasize
      />
    </div>
  );

  const steps = useMemo(
    () => [
      {
        title: t('pages.hr.perDiemSettlement.tripStep'),
        validate: () => validateFields(TRIP_FIELDS),
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.perDiemSettlement.tripStep')}
            description={t('pages.hr.perDiemSettlement.tripStepDescription')}
          >
            <Form.Item
              name="destination"
              label={t('hr.form.specificDestination')}
              rules={[{ required: true, message: t('hr.validation.enterDestination') }]}
            >
              <Input maxLength={200} placeholder={t('hr.placeholder.enterDestination')} />
            </Form.Item>
            <div className="erp-form-grid-2">
              <Form.Item
                name="departureDate"
                label={t('hr.form.departureDate')}
                rules={[{ required: true, message: t('hr.validation.selectLeaveDates') }]}
              >
                <DatePicker
                  className="w-full"
                  format="YYYY-MM-DD"
                />
              </Form.Item>
              <Form.Item
                name="departureTime"
                label={t('hr.form.departureTime')}
                rules={[{ required: true, message: t('hr.validation.selectDepartureTime') }]}
              >
                <TimePicker className="w-full" format="HH:mm" needConfirm={false} />
              </Form.Item>
              <Form.Item
                name="returnDate"
                label={t('hr.form.returnDate')}
                rules={[{ required: true, message: t('hr.validation.selectLeaveDates') }]}
              >
                <DatePicker
                  className="w-full"
                  format="YYYY-MM-DD"
                />
              </Form.Item>
              <Form.Item
                name="returnTime"
                label={t('hr.form.returnTime')}
                rules={[{ required: true, message: t('hr.validation.selectReturnTime') }]}
              >
                <TimePicker className="w-full" format="HH:mm" needConfirm={false} />
              </Form.Item>
            </div>
            <Form.Item
              name="actualDays"
              label={t('hr.form.perDiemDays')}
              rules={[
                { required: true, message: t('hr.validation.enterPerDiemDays') },
                {
                  validator: async (_, value: number | null | undefined) => {
                    const start = form.getFieldValue('departureDate') as
                      | dayjs.Dayjs
                      | undefined;
                    const end = form.getFieldValue('returnDate') as dayjs.Dayjs | undefined;
                    if (value == null || !start || !end) {
                      return;
                    }
                    const span = inclusiveDays(start, end);
                    if (value < 1 || value > span) {
                      throw new Error(t('hr.validation.perDiemDaysRange', { max: span }));
                    }
                  },
                },
              ]}
              extra={
                calendarSpan > 0
                  ? t('hr.form.perDiemDaysHint', { max: calendarSpan })
                  : undefined
              }
            >
              <InputNumber min={1} precision={0} className="w-full" />
            </Form.Item>
          </FormLayout>
        ),
      },
      {
        title: t('pages.hr.perDiemSettlement.vehicleStep'),
        validate: async () => {
          if (!values?.vehicleUsed) {
            return true;
          }
          return validateFields(['kmDeparture', 'kmReturn']);
        },
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.perDiemSettlement.vehicleStep')}
            description={t('pages.hr.perDiemSettlement.vehicleStepDescription')}
          >
            <Form.Item name="vehicleUsed" valuePropName="checked">
              <Checkbox>{t('pages.hr.perDiemSettlement.vehicleUsed')}</Checkbox>
            </Form.Item>
            {values?.vehicleUsed ? (
              <div className="erp-form-grid-2">
                <Form.Item
                  name="kmDeparture"
                  label={t('pages.hr.perDiemSettlement.kmOut')}
                  rules={[{ required: true, message: t('hr.validation.kmReadingsRequired') }]}
                >
                  <InputNumber min={0} precision={0} className="w-full" />
                </Form.Item>
                <Form.Item
                  name="kmReturn"
                  label={t('pages.hr.perDiemSettlement.kmIn')}
                  rules={[
                    { required: true, message: t('hr.validation.kmReadingsRequired') },
                    {
                      validator: async (_, value: number | null | undefined) => {
                        const start = form.getFieldValue('kmDeparture') as number | undefined;
                        if (value == null || start == null) {
                          return;
                        }
                        if (value < start) {
                          throw new Error(t('hr.validation.kmReturnOrder'));
                        }
                      },
                    },
                  ]}
                >
                  <InputNumber min={0} precision={0} className="w-full" />
                </Form.Item>
                <p className="erp-users-cell-strong m-0">
                  {t('pages.hr.perDiemSettlement.kmDifference')}:{' '}
                  {kmDifference != null && kmDifference >= 0 ? kmDifference : '-'}
                </p>
              </div>
            ) : null}
          </FormLayout>
        ),
      },
      {
        title: t('pages.hr.perDiemSettlement.advancesStep'),
        validate: async () => {
          if (selectedIds.length === 0 || mixedCategory) {
            messageApi.warning(
              mixedCategory
                ? t('hr.validation.advancesSameCategory')
                : t('hr.validation.selectAdvances'),
            );
            return false;
          }
          return true;
        },
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.perDiemSettlement.advancesStep')}
            description={t('pages.hr.perDiemSettlement.advancesStepDescription')}
          >
            {advancesQuery.isLoading ? (
              <p className="erp-users-cell-sub m-0">{t('common.loading')}</p>
            ) : advances.length === 0 ? (
              <Alert type="info" showIcon title={t('pages.hr.perDiemSettlement.noAdvances')} />
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {advances.map((advance) => {
                  const unpaid = (advance._count?.disbursements ?? 0) === 0;
                  const lockedOut =
                    unpaid ||
                    (category != null &&
                      !selectedIds.includes(advance.id) &&
                      advance.destinationCategory !== category);
                  return (
                    <li
                      key={advance.id}
                      className="flex items-start gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] px-3 py-2"
                    >
                      <Checkbox
                        checked={selectedIds.includes(advance.id)}
                        disabled={lockedOut}
                        onChange={(event) =>
                          toggleAdvance(advance.id, event.target.checked)
                        }
                      />
                      <div className="min-w-0">
                        <p className="erp-users-cell-strong m-0">
                          {advance.pvNumber ?? advance.requestNumber}
                          {' · '}
                          {formatEtbAmount(advance.totalAmount)}
                          {unpaid ? (
                            <span className="erp-users-cell-sub ml-2">
                              {t('pages.hr.perDiemSettlement.awaitingPayment')}
                            </span>
                          ) : null}
                        </p>
                        <p className="erp-users-cell-sub m-0 mt-0.5">
                          {advance.pvDate
                            ? formatDisplayDate(String(advance.pvDate).slice(0, 10))
                            : formatDisplayDate(String(advance.startDate).slice(0, 10))}
                          {' · '}
                          {advance.destinationCategory}
                          {' · '}
                          {advance.destination}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            {mixedCategory ? (
              <Alert
                className="mt-3"
                type="warning"
                showIcon
                title={t('hr.validation.advancesSameCategory')}
              />
            ) : null}
            {calculation}
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.reviewSubmit')}
            description={t('pages.hr.perDiemSettlement.reviewStepDescription')}
          >
            <div className="erp-form-grid-2">
              <ReviewItem
                label={t('hr.form.specificDestination')}
                value={values?.destination?.trim() || '-'}
              />
              <ReviewItem label={t('hr.form.destinationCategory')} value={category ?? '-'} />
              <ReviewItem
                label={t('hr.form.departureDate')}
                value={
                  values?.departureDate
                    ? `${formatDisplayDate(values.departureDate.format('YYYY-MM-DD'))} ${values.departureTime?.format('HH:mm') ?? ''}`
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.returnDate')}
                value={
                  values?.returnDate
                    ? `${formatDisplayDate(values.returnDate.format('YYYY-MM-DD'))} ${values.returnTime?.format('HH:mm') ?? ''}`
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.perDiemDays')}
                value={actualDays > 0 ? String(actualDays) : '-'}
              />
              <ReviewItem
                label={t('pages.hr.perDiemSettlement.kmDifference')}
                value={
                  values?.vehicleUsed && kmDifference != null && kmDifference >= 0
                    ? String(kmDifference)
                    : t('pages.hr.perDiemSettlement.noVehicle')
                }
              />
            </div>
            {calculation}
            <Form.Item name="notes" label={t('hr.form.notes')} className="mt-4">
              <Input.TextArea rows={3} maxLength={2000} />
            </Form.Item>
          </FormLayout>
        ),
      },
    ],
    [
      t,
      values,
      calendarSpan,
      advances,
      advancesQuery.isLoading,
      selectedIds,
      category,
      mixedCategory,
      calculation,
      actualDays,
      kmDifference,
      messageApi,
    ],
  );

  if (advancesQuery.isLoading && !advancesQuery.data) {
    return (
      <div className="flex justify-center py-16">
        <Spin />
      </div>
    );
  }

  if (paidAdvances.length === 0) {
    return (
      <Alert
        type="info"
        showIcon
        title={t('pages.hr.perDiemSettlement.noPaidAdvances')}
        description={t('pages.hr.perDiemSettlement.noPaidAdvancesDescription')}
      />
    );
  }

  return (
    <Form<SettlementFormValues>
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
      <StepperForm
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        steps={steps}
        onSubmit={handleSubmit}
        onReset={() => {
          form.resetFields();
          setSelectedIds([]);
          setFormError(null);
        }}
        isSubmitting={submitting}
        contentVariant="sections"
        submitLabel={t('hr.buttons.submitRequest')}
      />
    </Form>
  );
}

function CalculationRow({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}): React.ReactNode {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className="text-sm" style={{ color: tokens.colorTextSecondary }}>
        {label}
      </span>
      <span
        className={emphasize ? 'text-base font-bold' : 'text-sm font-semibold'}
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </span>
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
      <p className="m-0 text-sm" style={{ color: tokens.colorTextPrimary }}>
        {value}
      </p>
    </div>
  );
}
