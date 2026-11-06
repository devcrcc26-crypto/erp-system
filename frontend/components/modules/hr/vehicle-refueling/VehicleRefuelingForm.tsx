'use client';

import { useMemo, useState } from 'react';
import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
  Spin,
} from 'antd';
import {
  CarOutlined,
  CheckCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
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
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

interface FormValues {
  vehicleId?: string;
  driverId?: string;
  fuelDate?: dayjs.Dayjs;
  fuelType: FuelType;
  fuelStation?: string;
  currentMileage?: number;
  requestedLitres?: number;
  unitPriceEtb?: number;
  notes?: string;
}

interface VehicleRefuelingFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: VehicleRefuelingDetail) => void;
}

const DETAILS_FIELDS = ['fuelDate', 'fuelType', 'fuelStation'] as const;

function computeTotalCostEtb(
  requestedLitres: number | null | undefined,
  unitPriceEtb: number | null | undefined,
): number | undefined {
  if (
    requestedLitres == null ||
    unitPriceEtb == null ||
    Number.isNaN(requestedLitres) ||
    Number.isNaN(unitPriceEtb)
  ) {
    return undefined;
  }
  return requestedLitres * unitPriceEtb;
}

/**
 * Vehicle refueling create form - Users / Add Employee chrome.
 */
export default function VehicleRefuelingForm({
  onSuccess,
  onCancel,
  cancelLabel,
}: VehicleRefuelingFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('VEHICLE_REFUELING');
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const submitMutation = useSubmitVehicleRefueling();
  const vehiclesQuery = useCompanyVehicles({ page: 1, limit: 100 });
  const usersQuery = useFullUsersDirectory();
  const formValues = Form.useWatch([], form) as FormValues | undefined;
  const selectedVehicleId = Form.useWatch('vehicleId', form) as
    | string
    | undefined;

  const totalCostEtb = computeTotalCostEtb(
    formValues?.requestedLitres,
    formValues?.unitPriceEtb,
  );

  const vehicles = vehiclesQuery.data?.data ?? [];

  const driverOptions = useMemo(
    () => toDriverSelectOptions(usersQuery.data ?? []),
    [usersQuery.data],
  );

  const selectedVehicle = useMemo(() => {
    if (!selectedVehicleId) {
      return null;
    }
    return vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  }, [selectedVehicleId, vehicles]);

  const selectedDriverLabel = useMemo(() => {
    const driverId = formValues?.driverId;
    if (!driverId) {
      return '-';
    }
    return (
      driverOptions.find((option) => option.value === driverId)?.label ?? '-'
    );
  }, [driverOptions, formValues?.driverId]);

  function handleVehicleSelect(vehicleId: string): void {
    form.setFieldsValue({ vehicleId });
    setFormError(null);
  }

  function resetForm(): void {
    onBehalf.reset();
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

  async function validateVehicleStep(): Promise<boolean> {
    const ok = await validateFields(['vehicleId']);
    if (!ok) {
      setFormError(t('hr.validation.selectVehicle'));
    }
    return ok;
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
        ...onBehalf.payload,
        vehicleId: values.vehicleId,
        driverId: values.driverId || undefined,
        fuelDate: values.fuelDate.format('YYYY-MM-DD'),
        fuelType: values.fuelType,
        fuelStation: values.fuelStation.trim(),
        currentMileage: values.currentMileage ?? undefined,
        requestedLitres: values.requestedLitres ?? undefined,
        unitPriceEtb: values.unitPriceEtb ?? undefined,
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
      notifyApiError(error, message, messageApi, t);
      setFormError(getFriendlyApiErrorMessage(error, message, t));
    } finally {
      setSubmitting(false);
    }
  }

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.selectVehicle'),
        validate: () => validateVehicleStep(),
        content: (
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
            <FormLayout
              variant="pro"
              title={t('hr.form.selectVehicle')}
              description={t('pages.hr.vehicleRefueling.vehicleStepDescription')}
            >
              <Form.Item
                name="vehicleId"
                hidden
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectVehicle'),
                  },
                ]}
              >
                <Input />
              </Form.Item>

              {vehiclesQuery.isLoading ? (
                <div className="flex justify-center py-10">
                  <Spin />
                </div>
              ) : vehiclesQuery.isError ? (
                <ErpNotice
                  tone="error"
                  title={getFriendlyApiErrorMessage(
                    vehiclesQuery.error,
                    t('hr.empty.noVehicles'),
                    t,
                  )}
                />
              ) : vehicles.length === 0 ? (
                <ErpNotice tone="warning" title={t('hr.empty.noVehicles')} />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {vehicles.map((vehicle) => {
                    const selected = selectedVehicleId === vehicle.id;
                    return (
                      <button
                        key={vehicle.id}
                        type="button"
                        onClick={() => handleVehicleSelect(vehicle.id)}
                        className={`erp-vehicle-pick-card w-full p-3.5 text-left transition-colors${
                          selected ? ' erp-vehicle-pick-card--selected' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <CarOutlined
                                style={{
                                  color: selected
                                    ? tokens.colorPrimary
                                    : tokens.colorTextTertiary,
                                }}
                              />
                              <p className="erp-users-cell-strong m-0 truncate">
                                {vehicle.plateNumber}
                              </p>
                            </div>
                            <p className="erp-users-cell-sub mb-0 mt-1 truncate">
                              {vehicle.make} {vehicle.model}
                            </p>
                          </div>
                          {selected ? (
                            <CheckCircleOutlined
                              style={{
                                color: tokens.colorPrimary,
                                fontSize: 16,
                              }}
                            />
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 max-w-md">
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
                ]}
              >
                <DatePicker className="w-full" />
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

            <div className="erp-form-grid-2">
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
                name="unitPriceEtb"
                label={t('hr.form.unitPriceEtb')}
              >
                <InputNumber
                  min={0}
                  className="w-full"
                  placeholder="e.g. 72"
                />
              </Form.Item>
              <TotalCostPreview form={form} />
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
                    ? `${selectedVehicle.plateNumber} - ${selectedVehicle.make} ${selectedVehicle.model}`
                    : '-'
                }
              />
              <ReviewItem label={t('hr.form.driver')} value={selectedDriverLabel} />
              <ReviewItem
                label={t('hr.form.fuelDate')}
                value={
                  formValues?.fuelDate
                    ? formatProjectDate(formValues.fuelDate.toISOString())
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.fuelType')}
                value={formatFuelType(formValues?.fuelType ?? 'DIESEL', t)}
              />
              <ReviewItem
                label={t('hr.form.fuelStation')}
                value={formValues?.fuelStation?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.form.currentMileage')}
                value={
                  formValues?.currentMileage != null
                    ? String(formValues.currentMileage)
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.requestedLitres')}
                value={
                  formValues?.requestedLitres != null
                    ? String(formValues.requestedLitres)
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.unitPriceEtb')}
                value={
                  formValues?.unitPriceEtb != null
                    ? formatEtbAmount(formValues.unitPriceEtb)
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.totalCostEtb')}
                value={
                  totalCostEtb != null ? formatEtbAmount(totalCostEtb) : '-'
                }
              />
              {formValues?.notes?.trim() ? (
                <ReviewItem
                  label={t('hr.form.notes')}
                  value={formValues.notes.trim()}
                />
              ) : null}
            </div>
            <ErpNotice
              tone="info"
              className="mt-4"
              title={t('pages.hr.vehicleRefueling.reviewStepDescription')}
            />
          </FormLayout>
        ),
      },
    ],
    [
      onBehalf,
      t,
      form,
      vehiclesQuery.isLoading,
      vehiclesQuery.isError,
      vehiclesQuery.error,
      vehicles,
      usersQuery.isLoading,
      driverOptions,
      selectedVehicle,
      selectedVehicleId,
      selectedDriverLabel,
      formValues,
      totalCostEtb,
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
        <ErpNotice
          tone="error"
          className="mb-4"
          title={formError}
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

function TotalCostPreview({
  form,
}: {
  form: ReturnType<typeof Form.useForm<FormValues>>[0];
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const requestedLitres = Form.useWatch('requestedLitres', form);
  const unitPriceEtb = Form.useWatch('unitPriceEtb', form);
  const totalCostEtb = computeTotalCostEtb(
    requestedLitres != null ? Number(requestedLitres) : undefined,
    unitPriceEtb != null ? Number(unitPriceEtb) : undefined,
  );

  return (
    <Form.Item label={t('hr.form.totalCostEtb')}>
      <div
        className="erp-refueling-total-preview flex h-8 items-center rounded-lg px-3 text-sm font-semibold tabular-nums"
        style={{
          background: totalCostEtb != null ? '#EAF3DE' : tokens.colorPageBg,
          color: totalCostEtb != null ? '#639922' : tokens.colorTextSecondary,
          border: `1px solid ${totalCostEtb != null ? '#C0DD97' : tokens.colorBorder}`,
        }}
      >
        {totalCostEtb != null ? formatEtbAmount(totalCostEtb) : '-'}
      </div>
    </Form.Item>
  );
}
