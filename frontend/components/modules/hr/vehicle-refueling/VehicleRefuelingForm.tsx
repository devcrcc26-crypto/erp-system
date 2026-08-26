'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
} from 'antd';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { FuelType } from '@/lib/api/company-vehicle.types';
import type { VehicleRefuelingDetail } from '@/lib/api/vehicle-refueling.types';
import { useCompanyVehicles } from '@/lib/query/company-vehicle';
import { useFullUsersDirectory } from '@/lib/query/users';
import { useSubmitVehicleRefueling } from '@/lib/query/vehicle-refueling';
import { tokens } from '@/lib/theme/tokens';
import {
  FUEL_TYPE_OPTIONS,
  formatFuelType,
  toDriverSelectOptions,
} from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

interface FormValues {
  vehicleId?: string;
  driverId?: string;
  fuelDate?: dayjs.Dayjs;
  fuelType: FuelType;
  fuelStation?: string;
  currentMileage?: number;
  requestedLitres?: number;
  estimatedCostEtb?: number;
  notes?: string;
}

interface VehicleRefuelingFormProps {
  onSuccess: (result: VehicleRefuelingDetail) => void;
}

const VEHICLE_FIELDS = ['vehicleId'] as const;
const DETAILS_FIELDS = ['fuelDate', 'fuelType', 'fuelStation'] as const;

/**
 * Vehicle refueling create form — same StepperForm chrome as Add Employee.
 */
export default function VehicleRefuelingForm({
  onSuccess,
}: VehicleRefuelingFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submitMutation = useSubmitVehicleRefueling();
  const vehiclesQuery = useCompanyVehicles({ page: 1, limit: 100 });
  const usersQuery = useFullUsersDirectory();
  const formValues = Form.useWatch([], form) as FormValues | undefined;

  const driverOptions = useMemo(
    () => toDriverSelectOptions(usersQuery.data ?? []),
    [usersQuery.data],
  );

  const selectedVehicle = useMemo(() => {
    const vehicleId = formValues?.vehicleId;
    if (!vehicleId) {
      return null;
    }
    return (
      vehiclesQuery.data?.data?.find((vehicle) => vehicle.id === vehicleId) ??
      null
    );
  }, [formValues?.vehicleId, vehiclesQuery.data?.data]);

  const selectedDriverLabel = useMemo(() => {
    const driverId = formValues?.driverId;
    if (!driverId) {
      return '—';
    }
    return (
      driverOptions.find((option) => option.value === driverId)?.label ?? '—'
    );
  }, [driverOptions, formValues?.driverId]);

  function resetForm(): void {
    form.resetFields();
    form.setFieldsValue({ fuelType: 'DIESEL' });
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
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    if (!values.vehicleId || !values.fuelDate || !values.fuelStation?.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        vehicleId: values.vehicleId,
        driverId: values.driverId || undefined,
        fuelDate: values.fuelDate.format('YYYY-MM-DD'),
        fuelType: values.fuelType,
        fuelStation: values.fuelStation.trim(),
        currentMileage: values.currentMileage ?? undefined,
        requestedLitres: values.requestedLitres ?? undefined,
        estimatedCostEtb: values.estimatedCostEtb ?? undefined,
        notes: values.notes?.trim() || undefined,
      });

      messageApi.success(
        result.directApproved ||
          (result.status === 'APPROVED' && !result.approvalRequestId)
          ? t('hr.messages.vehicleRefuelingApproved')
          : t('hr.messages.vehicleRefuelingSubmitted'),
      );
      onSuccess(result);
    } catch (error: unknown) {
      const message = t('hr.messages.vehicleRefuelingSubmitFailed');
      notifyApiError(error, message, messageApi);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.selectVehicle'),
        validate: () => validateFields(VEHICLE_FIELDS),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.selectVehicle')}
            description={t('pages.hr.vehicleRefueling.vehicleStepDescription')}
          >
            <div className="erp-form-grid-2">
              <Form.Item
                name="vehicleId"
                label={t('hr.form.vehicle')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectVehicle'),
                  },
                ]}
              >
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder={t('hr.placeholder.selectVehicle')}
                  loading={vehiclesQuery.isLoading}
                  options={
                    vehiclesQuery.data?.data?.map((vehicle) => ({
                      value: vehicle.id,
                      label: `${vehicle.plateNumber} — ${vehicle.make} ${vehicle.model}`,
                    })) ?? []
                  }
                />
              </Form.Item>
              <Form.Item name="driverId" label={t('hr.form.driver')}>
                <Select
                  showSearch
                  allowClear
                  optionFilterProp="label"
                  placeholder={t('hr.placeholder.selectDriver')}
                  loading={usersQuery.isLoading}
                  notFoundContent={
                    usersQuery.isLoading
                      ? t('common.loading')
                      : t('hr.empty.noDrivers')
                  }
                  options={driverOptions}
                />
              </Form.Item>
            </div>
          </FormLayout>
        ),
      },
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateFields(DETAILS_FIELDS),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.requestDetails')}
            description={t('pages.hr.vehicleRefueling.detailsStepDescription')}
          >
            <div className="erp-form-grid-2">
              <Form.Item
                name="fuelDate"
                label={t('hr.form.fuelDate')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectDate'),
                  },
                  {
                    validator: async (_rule, value: dayjs.Dayjs | null) => {
                      if (value && value.isAfter(dayjs(), 'day')) {
                        throw new Error(t('hr.validation.fuelDateNotFuture'));
                      }
                    },
                  },
                ]}
              >
                <DatePicker
                  className="w-full"
                  disabledDate={(date) => date.isAfter(dayjs(), 'day')}
                />
              </Form.Item>
              <Form.Item
                name="fuelType"
                label={t('hr.form.fuelType')}
                rules={[
                  { required: true, message: t('hr.validation.required') },
                ]}
              >
                <Select options={FUEL_TYPE_OPTIONS} />
              </Form.Item>
            </div>

            <Form.Item
              name="fuelStation"
              label={t('hr.form.fuelStation')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.enterFuelStation'),
                },
              ]}
            >
              <Input
                maxLength={200}
                placeholder={t('hr.placeholder.enterFuelStation')}
              />
            </Form.Item>

            <div className="erp-form-grid-3">
              <Form.Item
                name="currentMileage"
                label={t('hr.form.currentMileage')}
              >
                <InputNumber
                  min={0}
                  className="w-full"
                  placeholder="e.g. 45200"
                />
              </Form.Item>
              <Form.Item
                name="requestedLitres"
                label={t('hr.form.requestedLitres')}
              >
                <InputNumber min={0} className="w-full" placeholder="e.g. 50" />
              </Form.Item>
              <Form.Item
                name="estimatedCostEtb"
                label={t('hr.form.estimatedCost')}
              >
                <InputNumber
                  min={0}
                  className="w-full"
                  placeholder="e.g. 3500"
                />
              </Form.Item>
            </div>

            <Form.Item name="notes" label={t('hr.form.notes')}>
              <Input.TextArea rows={3} maxLength={2000} showCount />
            </Form.Item>
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.reviewSubmit')}
            description={t('pages.hr.vehicleRefueling.reviewStepDescription')}
          >
            <div className="erp-form-grid-2">
              <ReviewItem
                label={t('hr.form.vehicle')}
                value={
                  selectedVehicle
                    ? `${selectedVehicle.plateNumber} — ${selectedVehicle.make} ${selectedVehicle.model}`
                    : '—'
                }
              />
              <ReviewItem label={t('hr.form.driver')} value={selectedDriverLabel} />
              <ReviewItem
                label={t('hr.form.fuelDate')}
                value={
                  formValues?.fuelDate
                    ? formatProjectDate(formValues.fuelDate.toISOString())
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.form.fuelType')}
                value={formatFuelType(formValues?.fuelType ?? 'DIESEL', t)}
              />
              <ReviewItem
                label={t('hr.form.fuelStation')}
                value={formValues?.fuelStation?.trim() || '—'}
              />
              <ReviewItem
                label={t('hr.form.currentMileage')}
                value={
                  formValues?.currentMileage != null
                    ? String(formValues.currentMileage)
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.form.requestedLitres')}
                value={
                  formValues?.requestedLitres != null
                    ? String(formValues.requestedLitres)
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.form.estimatedCost')}
                value={
                  formValues?.estimatedCostEtb != null
                    ? String(formValues.estimatedCostEtb)
                    : '—'
                }
              />
              {formValues?.notes?.trim() ? (
                <ReviewItem
                  label={t('hr.form.notes')}
                  value={formValues.notes.trim()}
                />
              ) : null}
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      t,
      vehiclesQuery.isLoading,
      vehiclesQuery.data?.data,
      usersQuery.isLoading,
      driverOptions,
      selectedVehicle,
      selectedDriverLabel,
      formValues,
    ],
  );

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      preserve
      className="flex min-h-0 flex-1 flex-col"
      initialValues={{ fuelType: 'DIESEL' }}
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
