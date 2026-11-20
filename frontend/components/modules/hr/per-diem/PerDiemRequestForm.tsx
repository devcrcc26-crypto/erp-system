'use client';

import { useEffect, useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, InputNumber, Radio, Select, TimePicker } from 'antd';
import dayjs from 'dayjs';
import CitySelector from '@/components/modules/hr/shared/CitySelector';
import CountrySelector from '@/components/modules/hr/shared/CountrySelector';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { ApiRequestError } from '@/lib/api/errors';
import type {
  PerDiemRequestDetail,
  PerDiemTripType,
  UpdatePerDiemRequestPayload,
} from '@/lib/api/per-diem.types';
import type { PerDiemDestinationCategory } from '@/lib/constants/per-diem-destination-categories';
import {
  PER_DIEM_CATEGORY_FIELDS,
  PER_DIEM_DESTINATION_CATEGORIES,
} from '@/lib/constants/per-diem-destination-categories';
import { getPerDiemCategoryForCountry } from '@/lib/constants/world-countries';
import { useBusinessTrips } from '@/lib/query/business-trip';
import { useFlightApplications } from '@/lib/query/flight';
import {
  useActiveEmployeePerDiemCategories,
  useSubmitPerDiemRequest,
  useUpdatePerDiemRequest,
} from '@/lib/query/per-diem';
import { useEmployeeSiteAssignments } from '@/lib/query/site-assignment';
import { tokens } from '@/lib/theme/tokens';
import { formatDisplayDate } from '@/lib/utils/date-format';
import { formatCurrencyAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

type PerDiemCurrency = 'ETB' | 'USD' | 'CNY';

interface PerDiemFormValues {
  tripType?: PerDiemTripType;
  destinationCountry?: string;
  destinationCity?: string;
  destinationCategory?: string;
  dateRange?: [dayjs.Dayjs, dayjs.Dayjs];
  departureTime?: dayjs.Dayjs;
  returnTime?: dayjs.Dayjs;
  days?: number;
  dailyRate?: number;
  currency?: PerDiemCurrency;
  linkedTravel?: string;
  siteAssignmentId?: string;
  notes?: string;
}

interface PerDiemRequestFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: PerDiemRequestDetail) => void;
  /** Edit mode: the employee's own DRAFT / RETURNED request, prefilled. */
  initialRecord?: PerDiemRequestDetail;
}

/** "HH:mm" → today at that time (TimePicker value). */
function timeOfDay(value: string | null | undefined): dayjs.Dayjs | undefined {
  const match = value ? /^(\d{1,2}):(\d{2})/.exec(value) : null;
  return match
    ? dayjs().hour(Number(match[1])).minute(Number(match[2])).second(0)
    : undefined;
}

/** Form values from a saved request (destination is stored as "City, Country"). */
function perDiemFormValuesFrom(record: PerDiemRequestDetail): PerDiemFormValues {
  const parts = record.destination.split(',').map((part) => part.trim());
  const country = parts.length > 1 ? parts.pop() : undefined;
  const linkedTravel = record.linkedFlight?.id
    ? `flight:${record.linkedFlight.id}`
    : record.linkedTrip?.id
      ? `trip:${record.linkedTrip.id}`
      : undefined;
  return {
    tripType: record.tripType ?? 'TRAVEL',
    destinationCountry: country,
    destinationCity: parts.join(', ') || undefined,
    destinationCategory: record.destinationCategory,
    dateRange: [dayjs(record.startDate), dayjs(record.endDate)],
    departureTime: timeOfDay(record.departureTime),
    returnTime: timeOfDay(record.returnTime),
    days: record.days,
    linkedTravel,
    siteAssignmentId: record.siteAssignmentId ?? undefined,
    notes: record.notes ?? undefined,
    dailyRate: Number(record.dailyRate),
    currency: (record.currency as PerDiemCurrency | undefined) ?? 'ETB',
  };
}

const DESTINATION_FIELDS = ['tripType', 'destinationCountry', 'destinationCity', 'destinationCategory'] as const;
const DETAILS_FIELDS = [
  'dateRange',
  'departureTime',
  'returnTime',
  'days',
  'dailyRate',
  'currency',
] as const;

function calcInclusiveCalendarDays(
  start: dayjs.Dayjs,
  end: dayjs.Dayjs,
): number {
  return end.startOf('day').diff(start.startOf('day'), 'day') + 1;
}

/**
 * Per diem create form - same StepperForm chrome as Add Employee.
 */
export default function PerDiemRequestForm({
  onSuccess,
  initialRecord,
  onCancel,
  cancelLabel,
}: PerDiemRequestFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('PER_DIEM');
  const messageApi = useAppMessage();
  const [form] = Form.useForm<PerDiemFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const initialValues = useMemo(
    () =>
      initialRecord
        ? perDiemFormValuesFrom(initialRecord)
        : ({ currency: 'ETB' } satisfies PerDiemFormValues),
    [initialRecord],
  );
  const updateMutation = useUpdatePerDiemRequest(initialRecord?.id ?? '');

  const ratesQuery = useActiveEmployeePerDiemCategories(
    onBehalf.effectiveEmployeeId,
    Boolean(onBehalf.effectiveEmployeeId),
  );
  const flightsQuery = useFlightApplications(
    { status: 'APPROVED', limit: 50 },
    true,
  );
  const tripsQuery = useBusinessTrips({ status: 'APPROVED', limit: 50 }, true);
  const siteAssignmentsQuery = useEmployeeSiteAssignments(
    onBehalf.effectiveEmployeeId,
    Boolean(onBehalf.effectiveEmployeeId),
  );
  const submitMutation = useSubmitPerDiemRequest();

  const formValues = Form.useWatch([], form) as PerDiemFormValues | undefined;
  const tripType = formValues?.tripType ?? 'TRAVEL';
  const isSiteDeployment = tripType === 'SITE_DEPLOYMENT';
  const destinationCategory = isSiteDeployment
    ? 'Domestic'
    : formValues?.destinationCategory;
  const dateRange = formValues?.dateRange;

  const companyRate = useMemo(
    () =>
      (ratesQuery.data ?? []).find(
        (entry) => entry.destinationCategory === destinationCategory,
      ) ?? null,
    [ratesQuery.data, destinationCategory],
  );
  const hasCompanyRate = companyRate != null;

  useEffect(() => {
    if (isSiteDeployment) {
      form.setFieldValue('linkedTravel', undefined);
      form.setFieldValue('destinationCategory', 'Domestic');
    } else {
      form.setFieldValue('siteAssignmentId', undefined);
    }
  }, [form, isSiteDeployment]);

  // When a seeded company rate matches, lock the form to that amount/currency.
  useEffect(() => {
    if (!companyRate) {
      return;
    }
    form.setFieldsValue({
      dailyRate: Number(companyRate.dailyRate),
      currency: (companyRate.currency as PerDiemCurrency) || 'ETB',
    });
  }, [form, companyRate]);

  const approvedSiteAssignments = useMemo(
    () =>
      (siteAssignmentsQuery.data ?? []).filter(
        (row) => row.status === 'APPROVED',
      ),
    [siteAssignmentsQuery.data],
  );

  const siteAssignmentOptions = useMemo(
    () =>
      approvedSiteAssignments.map((row) => ({
        value: row.id,
        label: `${row.requestNumber} - ${row.siteName} (${formatDisplayDate(String(row.startDate).slice(0, 10))} – ${formatDisplayDate(String(row.endDate).slice(0, 10))})`,
      })),
    [approvedSiteAssignments],
  );

  const calendarSpan = useMemo(() => {
    if (!dateRange?.[0] || !dateRange?.[1]) {
      return 0;
    }
    return calcInclusiveCalendarDays(dateRange[0], dateRange[1]);
  }, [dateRange]);

  const days =
    formValues?.days != null && formValues.days > 0 ? formValues.days : 0;
  const dailyRate =
    formValues?.dailyRate != null && formValues.dailyRate > 0
      ? formValues.dailyRate
      : 0;
  const currency: PerDiemCurrency = formValues?.currency ?? 'ETB';
  const totalAmount = dailyRate > 0 && days > 0 ? dailyRate * days : 0;

  const travelOptions = useMemo(
    () => [
      {
        value: '',
        label: t('hr.placeholder.noLinkedTravel'),
      },
      ...(flightsQuery.data?.data ?? [])
        .filter((flight) => flight.submittedBy === onBehalf.effectiveEmployeeId)
        .map((flight) => ({
          value: `flight:${flight.id}`,
          label: `${flight.isInternational ? t('hr.labels.intlFlightPrefix') : t('hr.labels.flightPrefix')} ${flight.applicationNumber} - ${flight.destination}`,
        })),
      ...(tripsQuery.data?.data ?? [])
        .filter((trip) => trip.submittedBy === onBehalf.effectiveEmployeeId)
        .map((trip) => ({
          value: `trip:${trip.id}`,
          label: `${t('hr.labels.businessTripPrefix')} ${trip.tripNumber} - ${
            trip.destinationCity
              ? `${trip.destinationCity}, ${trip.destinationCountry}`
              : trip.destinationCountry
          }`,
        })),
    ],
    [
      flightsQuery.data?.data,
      tripsQuery.data?.data,
      onBehalf.effectiveEmployeeId,
      t,
    ],
  );

  const linkedKind = useMemo(() => {
    const val = formValues?.linkedTravel ?? '';
    if (val.startsWith('flight:')) {
      const flightId = val.replace('flight:', '');
      const flight = flightsQuery.data?.data.find((f) => f.id === flightId);
      return flight?.isInternational ? 'international-flight' : 'domestic-flight';
    }
    if (val.startsWith('trip:')) {
      return 'trip';
    }
    return 'none';
  }, [formValues?.linkedTravel, flightsQuery.data?.data]);

  const categoryOptions = useMemo(
    () =>
      PER_DIEM_DESTINATION_CATEGORIES.map((category) => ({
        value: category,
        label: t(PER_DIEM_CATEGORY_FIELDS[category].labelKey),
      })),
    [t],
  );

  const categoryLabel = useMemo(() => {
    if (!destinationCategory) {
      return '-';
    }
    return (
      categoryOptions.find((option) => option.value === destinationCategory)
        ?.label ?? destinationCategory
    );
  }, [categoryOptions, destinationCategory]);

  const linkedTravelLabel = useMemo(() => {
    const value = formValues?.linkedTravel;
    if (!value) {
      return t('hr.labels.standalonePerDiem');
    }
    return travelOptions.find((option) => option.value === value)?.label ?? '-';
  }, [formValues?.linkedTravel, travelOptions, t]);

  function resetForm(): void {
    onBehalf.reset();
    form.resetFields();
    setFormError(null);
  }

  function handleSiteAssignmentChange(val: string | null | undefined): void {
    const assignmentId = val ?? '';
    form.setFieldValue('siteAssignmentId', assignmentId || undefined);
    if (!assignmentId) {
      return;
    }
    const assignment = approvedSiteAssignments.find(
      (row) => row.id === assignmentId,
    );
    if (!assignment) {
      return;
    }
    form.setFieldValue('destinationCity', assignment.siteName);
    const start = dayjs(assignment.startDate);
    const end = dayjs(assignment.endDate);
    form.setFieldValue('dateRange', [start, end]);
  }

  function handleLinkedTravelChange(val: string | null | undefined): void {
    const linked = val ?? '';
    form.setFieldValue('linkedTravel', linked || undefined);

    if (!linked) {
      return;
    }

    if (linked.startsWith('flight:')) {
      const flightId = linked.replace('flight:', '');
      const flight = flightsQuery.data?.data.find((f) => f.id === flightId);
      if (!flight) {
        return;
      }
      if (!flight.isInternational) {
        form.setFieldValue('destinationCountry', 'Ethiopia');
        form.setFieldValue('destinationCategory', 'Domestic');
      }
      if (flight.destination) {
        form.setFieldValue('destinationCity', flight.destination);
      }
      if (flight.departureDate) {
        const start = dayjs(flight.departureDate);
        const end = flight.returnDate ? dayjs(flight.returnDate) : start;
        form.setFieldValue('dateRange', [start, end]);
        form.setFieldValue('days', calcInclusiveCalendarDays(start, end));
      }
      return;
    }

    if (linked.startsWith('trip:')) {
      const tripId = linked.replace('trip:', '');
      const trip = tripsQuery.data?.data.find((item) => item.id === tripId);
      if (!trip) {
        return;
      }
      if (trip.destinationCountry) {
        form.setFieldValue('destinationCountry', trip.destinationCountry);
        const category = getPerDiemCategoryForCountry(trip.destinationCountry);
        if (category) {
          form.setFieldValue('destinationCategory', category);
        }
      }
      if (trip.destinationCity) {
        form.setFieldValue('destinationCity', trip.destinationCity);
      }
      if (trip.departureDate) {
        const start = dayjs(trip.departureDate);
        const end = trip.returnDate ? dayjs(trip.returnDate) : start;
        form.setFieldValue('dateRange', [start, end]);
        form.setFieldValue('days', calcInclusiveCalendarDays(start, end));
      }
    }
  }

  function handleCountryChange(
    _country: string,
    category: PerDiemDestinationCategory | null,
  ): void {
    form.setFieldValue('destinationCity', undefined);
    if (category != null) {
      form.setFieldValue('destinationCategory', category);
    }
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

    let values: PerDiemFormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    if (
      !values.destinationCategory ||
      !values.destinationCountry?.trim() ||
      !values.dateRange?.[0] ||
      !values.dateRange?.[1] ||
      values.dailyRate == null ||
      !(values.dailyRate > 0)
    ) {
      return;
    }

    const [kind, id] = values.linkedTravel?.split(':') ?? [];

    setSubmitting(true);
    try {
      const span = calcInclusiveCalendarDays(
        values.dateRange[0],
        values.dateRange[1],
      );
      if (!values.days || values.days < 1 || values.days > span) {
        messageApi.warning(
          t('hr.validation.perDiemDaysRange', { max: span }),
        );
        return;
      }
      const payload = {
        tripType: values.tripType ?? 'TRAVEL',
        destinationCategory: values.destinationCategory,
        destination: [values.destinationCity?.trim(), values.destinationCountry?.trim()]
          .filter(Boolean)
          .join(', '),
        startDate: values.dateRange[0].format('YYYY-MM-DD'),
        endDate: values.dateRange[1].format('YYYY-MM-DD'),
        departureTime: values.departureTime?.format('HH:mm'),
        returnTime: values.returnTime?.format('HH:mm'),
        days: values.days,
        dailyRate: values.dailyRate,
        currency: values.currency ?? 'ETB',
        linkedFlightId: kind === 'flight' ? id : undefined,
        linkedBusinessTripId: kind === 'trip' ? id : undefined,
        siteAssignmentId:
          values.tripType === 'SITE_DEPLOYMENT'
            ? values.siteAssignmentId
            : undefined,
        notes: values.notes?.trim() || undefined,
      } satisfies UpdatePerDiemRequestPayload;
      if (initialRecord) {
        const saved = await updateMutation.mutateAsync(payload);
        messageApi.success(t('pages.approvals.edit.saved'));
        onSuccess(saved);
        return;
      }
      const created = await submitMutation.mutateAsync({
        ...onBehalf.payload,
        ...payload,
      });
      messageApi.success(t('hr.messages.perDiemSubmitted'));
      onSuccess(created);
    } catch (error: unknown) {
      const message = initialRecord
        ? t('pages.approvals.edit.failed')
        : t('hr.messages.perDiemSubmitFailed');
      notifyApiError(error, message, messageApi);
      setFormError(
        error instanceof ApiRequestError ? error.message : message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  const estimateBlock =
    dailyRate > 0 && days > 0 ? (
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-[rgba(0,0,0,0.06)] pt-4 sm:grid-cols-2">
        <EstimateItem
          label={t('hr.form.totalDays')}
          value={String(days)}
        />
        <EstimateItem
          label={t('hr.form.dailyRate')}
          value={formatCurrencyAmount(dailyRate, currency)}
        />
        <EstimateItem
          label={t('hr.form.totalAmount')}
          value={formatCurrencyAmount(totalAmount, currency)}
          emphasize
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
            {initialRecord ? null : <OnBehalfSection state={onBehalf} />}
            <FormLayout
              variant="pro"
              title={t('hr.form.destinationCategory')}
              description={t('pages.hr.perDiem.destinationStepDescription')}
            >
              <Form.Item
                name="tripType"
                label={t('hr.form.tripType')}
                initialValue="TRAVEL"
                rules={[{ required: true, message: t('hr.validation.selectTripType') }]}
              >
                <Radio.Group
                  optionType="button"
                  options={[
                    { value: 'TRAVEL', label: t('hr.form.tripTypeTravel') },
                    {
                      value: 'SITE_DEPLOYMENT',
                      label: t('hr.form.tripTypeSiteDeployment'),
                    },
                  ]}
                />
              </Form.Item>

              {isSiteDeployment ? (
                <Form.Item
                  name="siteAssignmentId"
                  label={t('hr.form.linkedSiteAssignment')}
                  extra={t('hr.messages.linkedSiteAssignmentHint')}
                  className="mb-4"
                >
                  <Select
                    allowClear
                    loading={siteAssignmentsQuery.isLoading}
                    placeholder={t('hr.placeholder.selectSiteAssignment')}
                    options={siteAssignmentOptions}
                    onChange={handleSiteAssignmentChange}
                  />
                </Form.Item>
              ) : (
                <Form.Item
                  name="linkedTravel"
                  label={t('hr.form.linkedTravel')}
                  extra={t('hr.messages.linkedTravelHint')}
                  className="mb-4"
                >
                  <Select
                    allowClear
                    placeholder={t('hr.placeholder.selectLinkedTravel')}
                    options={travelOptions}
                    onChange={handleLinkedTravelChange}
                  />
                </Form.Item>
              )}

              <div className="erp-form-grid-2">
                <Form.Item
                  name="destinationCountry"
                  label={t('hr.form.destinationCountry')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.destinationCountryRequired'),
                    },
                  ]}
                >
                  <CountrySelector
                    placeholder={t('hr.placeholder.selectDestinationCountry')}
                    onChange={handleCountryChange}
                  />
                </Form.Item>
                <Form.Item
                  name="destinationCity"
                  label={t('hr.form.destinationCity')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.destinationCityRequired'),
                    },
                  ]}
                >
                  <CitySelector
                    countryName={formValues?.destinationCountry}
                    placeholder={t('hr.placeholder.selectDestinationCity')}
                  />
                </Form.Item>
                <Form.Item
                  name="destinationCategory"
                  label={t('hr.form.destinationCategory')}
                  extra={t('hr.messages.categoryAutoSetFromCountry')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.selectDestinationCategory'),
                    },
                  ]}
                >
                  <Select
                    placeholder={t('hr.placeholder.selectDestinationCategory')}
                    options={categoryOptions}
                  />
                </Form.Item>
              </div>
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateFields(DETAILS_FIELDS),
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

            <div className="erp-form-grid-2">
              <Form.Item
                name="departureTime"
                label={t('hr.form.departureTime')}
                rules={[{ required: true, message: t('hr.validation.selectDepartureTime') }]}
              >
                <TimePicker className="w-full" format="HH:mm" needConfirm={false} />
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
              name="days"
              label={t('hr.form.perDiemDays')}
              rules={[
                { required: true, message: t('hr.validation.enterPerDiemDays') },
                {
                  validator: async (_, value: number | null | undefined) => {
                    if (value == null || !dateRange?.[0] || !dateRange?.[1]) {
                      return;
                    }
                    const span = calcInclusiveCalendarDays(dateRange[0], dateRange[1]);
                    if (value < 1 || value > span) {
                      throw new Error(
                        t('hr.validation.perDiemDaysRange', { max: span }),
                      );
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

            {hasCompanyRate && companyRate ? (
              <div className="mb-4 rounded-md border border-[rgba(0,0,0,0.08)] bg-[var(--color-teal-50,#f0f9f7)] p-4">
                <p
                  className="m-0 text-sm font-semibold"
                  style={{ color: tokens.colorTextPrimary }}
                >
                  {t('hr.perDiem.companyRateDisplay', {
                    amount: formatCurrencyAmount(
                      companyRate.dailyRate,
                      companyRate.currency,
                    ),
                  })}
                </p>
                <Form.Item name="dailyRate" hidden rules={[{ required: true }]}>
                  <InputNumber />
                </Form.Item>
                <Form.Item name="currency" hidden initialValue="ETB">
                  <Input />
                </Form.Item>
              </div>
            ) : (
              <div className="erp-form-grid-2">
                <Form.Item
                  name="dailyRate"
                  label={t('hr.form.dailyRate')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.enterDailyRate'),
                    },
                    {
                      type: 'number',
                      min: 0.01,
                      message: t('hr.validation.dailyRatePositive'),
                    },
                  ]}
                  extra={t('hr.perDiem.noCompanyRateHint')}
                >
                  <InputNumber
                    min={0.01}
                    step={1}
                    precision={2}
                    className="w-full"
                    suffix={currency}
                  />
                </Form.Item>
                <Form.Item
                  name="currency"
                  label={t('hr.form.currency')}
                  initialValue="ETB"
                  rules={[
                    {
                      required: true,
                      message: t('hr.validation.selectCurrency'),
                    },
                  ]}
                >
                  <Select
                    options={[
                      { value: 'ETB', label: 'ETB' },
                      { value: 'USD', label: 'USD' },
                      { value: 'CNY', label: 'CNY' },
                    ]}
                  />
                </Form.Item>
              </div>
            )}

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
                label={t('hr.form.tripType')}
                value={
                  tripType === 'SITE_DEPLOYMENT'
                    ? t('hr.form.tripTypeSiteDeployment')
                    : t('hr.form.tripTypeTravel')
                }
              />
              <ReviewItem
                label={t('hr.form.destinationCountry')}
                value={formValues?.destinationCountry?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.form.destinationCity')}
                value={formValues?.destinationCity?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.form.destinationCategory')}
                value={categoryLabel}
              />
              <ReviewItem
                label={t('hr.form.startDate')}
                value={
                  dateRange?.[0]
                    ? formatDisplayDate(dateRange[0].format('YYYY-MM-DD'))
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.endDate')}
                value={
                  dateRange?.[1]
                    ? formatDisplayDate(dateRange[1].format('YYYY-MM-DD'))
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.departureTime')}
                value={formValues?.departureTime?.format('HH:mm') ?? '-'}
              />
              <ReviewItem
                label={t('hr.form.returnTime')}
                value={formValues?.returnTime?.format('HH:mm') ?? '-'}
              />
              <ReviewItem
                label={t('hr.form.perDiemDays')}
                value={days > 0 ? String(days) : '-'}
              />
              <ReviewItem
                label={t('hr.form.dailyRate')}
                value={
                  dailyRate > 0
                    ? hasCompanyRate
                      ? t('hr.perDiem.companyRateDisplay', {
                          amount: formatCurrencyAmount(dailyRate, currency),
                        })
                      : formatCurrencyAmount(dailyRate, currency)
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.currency')}
                value={currency}
              />
              <ReviewItem
                label={t('hr.form.totalAmount')}
                value={
                  totalAmount > 0
                    ? formatCurrencyAmount(totalAmount, currency)
                    : '-'
                }
              />
              <ReviewItem
                label={
                  isSiteDeployment
                    ? t('hr.form.linkedSiteAssignment')
                    : t('hr.form.linkedTravel')
                }
                value={
                  isSiteDeployment
                    ? siteAssignmentOptions.find(
                        (option) => option.value === formValues?.siteAssignmentId,
                      )?.label ?? t('hr.labels.standalonePerDiem')
                    : linkedTravelLabel
                }
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
      initialRecord,
      onBehalf,
      t,
      siteAssignmentsQuery.isLoading,
      categoryOptions,
      travelOptions,
      siteAssignmentOptions,
      estimateBlock,
      categoryLabel,
      formValues,
      dateRange,
      linkedTravelLabel,
      linkedKind,
      isSiteDeployment,
      tripType,
      calendarSpan,
      days,
      dailyRate,
      currency,
      totalAmount,
      hasCompanyRate,
      companyRate,
    ],
  );

  return (
    <Form<PerDiemFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      preserve
      initialValues={initialValues}
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
        onReset={resetForm}
        isSubmitting={submitting}
        contentVariant="sections"
        submitLabel={
          initialRecord
            ? t('pages.approvals.edit.saveChanges')
            : t('hr.buttons.submitRequest')
        }
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
