'use client';

import { useMemo, useState } from 'react';
import {
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Spin,
  Tooltip,
} from 'antd';
import {
  CarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
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
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { getDisabledDepartureDate } from '@/lib/utils/date-validation';
import type { AvailableVehicle } from '@/lib/api/company-vehicle.types';
import type {
  DriveType,
  UpdateVehicleApplicationPayload,
  VehicleApplicationDetail,
} from '@/lib/api/vehicle-application.types';
import { useAvailableVehicles } from '@/lib/query/company-vehicle';
import {
  useSubmitVehicleApplication,
  useUpdateVehicleApplication,
} from '@/lib/query/vehicle-application';
import { tokens } from '@/lib/theme/tokens';
import { formatDriverName } from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

interface VehicleApplicationFormValues {
  departureDatetime?: dayjs.Dayjs;
  returnDatetime?: dayjs.Dayjs;
  vehicleId?: string;
  driveType: DriveType;
  driverId?: string;
  destination?: string;
  purpose?: string;
  passengerCount?: number;
  passengerNames?: string;
  notes?: string;
}

interface VehicleApplicationFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: VehicleApplicationDetail) => void;
  /** Edit mode: the employee's own DRAFT / RETURNED application, prefilled. */
  initialRecord?: VehicleApplicationDetail;
}

const CREATE_INITIAL_VALUES: Partial<VehicleApplicationFormValues> = {
  driveType: 'COMPANY_DRIVER',
  passengerCount: 1,
};

function vehicleFormValuesFrom(
  record: VehicleApplicationDetail,
): Partial<VehicleApplicationFormValues> {
  return {
    departureDatetime: dayjs(record.departureDatetime),
    returnDatetime: dayjs(record.returnDatetime),
    vehicleId: record.vehicleId,
    driveType: record.driveType,
    driverId: record.driverId ?? undefined,
    destination: record.destination,
    purpose: record.purpose,
    passengerCount: record.passengerCount,
    passengerNames: record.passengerNames ?? undefined,
    notes: record.notes ?? undefined,
  };
}

const DETAILS_FIELDS = [
  'driveType',
  'destination',
  'purpose',
  'passengerCount',
] as const;

function resolveVehicleDriverId(
  vehicle: AvailableVehicle | null,
): string | undefined {
  if (!vehicle) {
    return undefined;
  }
  return vehicle.assignedDriver?.id ?? vehicle.assignedDriverId ?? undefined;
}

/**
 * Stepped vehicle application create form - same chrome as Add Employee.
 */
export default function VehicleApplicationForm({
  onSuccess,
  initialRecord,
  onCancel,
  cancelLabel,
}: VehicleApplicationFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  // HR / full access may record past trips; everyone else books ahead.
  const canBackdate = useCanViewHr();
  const onBehalf = useOnBehalf('VEHICLE_APPLICATION');
  const messageApi = useAppMessage();
  const [form] = Form.useForm<VehicleApplicationFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pickedVehicle, setSelectedVehicle] = useState<AvailableVehicle | null>(
    null,
  );
  /** Kept in React state so dates survive schedule-step unmount (useWatch goes empty). */
  const [departureAt, setDepartureAt] = useState<dayjs.Dayjs | null>(() =>
    initialRecord ? dayjs(initialRecord.departureDatetime) : null,
  );
  const [returnAt, setReturnAt] = useState<dayjs.Dayjs | null>(() =>
    initialRecord ? dayjs(initialRecord.returnDatetime) : null,
  );
  /** Edit mode: the saved vehicle stays selected until the user changes it. */
  const [pendingVehicleId, setPendingVehicleId] = useState<string | null>(
    initialRecord?.vehicleId ?? null,
  );
  const initialValues = useMemo(
    () =>
      initialRecord
        ? vehicleFormValuesFrom(initialRecord)
        : CREATE_INITIAL_VALUES,
    [initialRecord],
  );

  const submitMutation = useSubmitVehicleApplication();
  const updateMutation = useUpdateVehicleApplication(initialRecord?.id ?? '');

  const driveType = Form.useWatch('driveType', form) ?? 'COMPANY_DRIVER';
  const formValues = Form.useWatch([], form) as
    | VehicleApplicationFormValues
    | undefined;

  const datesReady = Boolean(
    departureAt && returnAt && returnAt.isAfter(departureAt),
  );

  const availableParams = useMemo(() => {
    if (!departureAt || !returnAt || !returnAt.isAfter(departureAt)) {
      return null;
    }
    return {
      departureDatetime: departureAt.toISOString(),
      returnDatetime: returnAt.toISOString(),
    };
  }, [departureAt, returnAt]);

  const availableQuery = useAvailableVehicles(availableParams);
  const vehicles = availableQuery.data ?? [];
  const savedVehicle = pendingVehicleId
    ? vehicles.find((row) => row.id === pendingVehicleId && row.isAvailable) ??
      null
    : null;
  const selectedVehicle = pickedVehicle ?? savedVehicle;

  function clearVehicleSelection(): void {
    setPendingVehicleId(null);
    setSelectedVehicle(null);
    form.setFieldsValue({
      vehicleId: undefined,
      driverId: undefined,
    });
  }

  function handleDepartureChange(value: dayjs.Dayjs | null): void {
    setDepartureAt(value);
    form.setFieldValue('departureDatetime', value ?? undefined);
    clearVehicleSelection();
  }

  function handleReturnChange(value: dayjs.Dayjs | null): void {
    setReturnAt(value);
    form.setFieldValue('returnDatetime', value ?? undefined);
    clearVehicleSelection();
  }

  function handleVehicleSelect(vehicle: AvailableVehicle): void {
    if (!vehicle.isAvailable) return;
    setSelectedVehicle(vehicle);
    const driverId = resolveVehicleDriverId(vehicle);
    form.setFieldsValue({
      vehicleId: vehicle.id,
      driveType: driverId ? 'COMPANY_DRIVER' : 'SELF_DRIVE',
      driverId,
    });
  }

  function handleDriveTypeChange(value: DriveType): void {
    if (value === 'SELF_DRIVE') {
      form.setFieldValue('driverId', undefined);
      return;
    }
    const driverId = resolveVehicleDriverId(selectedVehicle);
    if (!driverId) {
      messageApi.warning(t('hr.validation.companyDriverRequired'));
      form.setFieldValue('driveType', 'SELF_DRIVE');
      return;
    }
    form.setFieldValue('driverId', driverId);
  }

  function resetForm(): void {
    onBehalf.reset();
    form.resetFields();
    form.setFieldsValue(initialValues);
    setDepartureAt(
      initialRecord ? dayjs(initialRecord.departureDatetime) : null,
    );
    setReturnAt(initialRecord ? dayjs(initialRecord.returnDatetime) : null);
    setSelectedVehicle(null);
    setPendingVehicleId(initialRecord?.vehicleId ?? null);
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

  async function validateScheduleStep(): Promise<boolean> {
    if (!departureAt || !returnAt) {
      messageApi.error(
        !departureAt
          ? t('hr.validation.selectDeparture')
          : t('hr.validation.selectReturn'),
      );
      return false;
    }
    if (!returnAt.isAfter(departureAt)) {
      messageApi.error(t('hr.dateRules.returnAfterDeparture'));
      return false;
    }
    form.setFieldsValue({
      departureDatetime: departureAt,
      returnDatetime: returnAt,
    });
    return true;
  }

  async function validateVehicleStep(): Promise<boolean> {
    if (!selectedVehicle) {
      messageApi.error(t('hr.validation.selectVehicle'));
      return false;
    }
    const driverId = resolveVehicleDriverId(selectedVehicle);
    const currentDriveType =
      (form.getFieldValue('driveType') as DriveType | undefined) ??
      (driverId ? 'COMPANY_DRIVER' : 'SELF_DRIVE');
    const driveType =
      currentDriveType === 'COMPANY_DRIVER' && !driverId
        ? 'SELF_DRIVE'
        : currentDriveType;
    form.setFieldsValue({
      vehicleId: selectedVehicle.id,
      driverId: driveType === 'COMPANY_DRIVER' ? driverId : undefined,
      driveType,
    });
    return true;
  }

  async function validateDetailsStep(): Promise<boolean> {
    const ok = await validateFields(DETAILS_FIELDS);
    if (!ok) {
      return false;
    }
    const driveTypeValue =
      (form.getFieldValue('driveType') as DriveType | undefined) ??
      'COMPANY_DRIVER';
    const driverId = resolveVehicleDriverId(selectedVehicle);
    if (driveTypeValue === 'COMPANY_DRIVER') {
      if (!driverId) {
        messageApi.error(t('hr.validation.companyDriverRequired'));
        return false;
      }
      form.setFieldValue('driverId', driverId);
    } else {
      form.setFieldValue('driverId', undefined);
    }
    return true;
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);

    if (!departureAt || !returnAt || !returnAt.isAfter(departureAt)) {
      messageApi.error(
        !departureAt || !returnAt
          ? t('hr.validation.selectDeparture')
          : t('hr.dateRules.returnAfterDeparture'),
      );
      return;
    }

    if (!selectedVehicle) {
      messageApi.error(t('hr.validation.selectVehicle'));
      return;
    }

    const stored = form.getFieldsValue(true) as VehicleApplicationFormValues;
    const destination = stored.destination?.trim();
    const purpose = stored.purpose?.trim();
    const driveTypeValue = stored.driveType ?? 'COMPANY_DRIVER';
    const driverId =
      driveTypeValue === 'COMPANY_DRIVER'
        ? resolveVehicleDriverId(selectedVehicle) ?? stored.driverId
        : undefined;

    if (!destination) {
      messageApi.error(t('hr.validation.enterDestination'));
      return;
    }
    if (!purpose) {
      messageApi.error(t('hr.validation.enterPurpose'));
      return;
    }
    if (driveTypeValue === 'COMPANY_DRIVER' && !driverId) {
      messageApi.error(t('hr.validation.companyDriverRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        vehicleId: selectedVehicle.id,
        driveType: driveTypeValue,
        driverId,
        departureDatetime: departureAt.toISOString(),
        returnDatetime: returnAt.toISOString(),
        destination,
        purpose,
        passengerCount: stored.passengerCount ?? 1,
        passengerNames: stored.passengerNames?.trim() || undefined,
        notes: stored.notes?.trim() || undefined,
      } satisfies UpdateVehicleApplicationPayload;
      if (initialRecord) {
        const saved = await updateMutation.mutateAsync({
          ...payload,
          // Not on the form; keep the saved project link.
          projectId: initialRecord.projectId ?? undefined,
        });
        messageApi.success(t('pages.approvals.edit.saved'));
        onSuccess(saved);
        return;
      }
      const result = await submitMutation.mutateAsync({
        ...onBehalf.payload,
        ...payload,
      });

      messageApi.success(
        result.directApproved ||
          (result.status === 'APPROVED' && !result.approvalRequestId)
          ? t('hr.messages.vehicleApplicationApproved')
          : t('hr.messages.vehicleApplicationSubmitted'),
      );
      onSuccess(result);
    } catch (error: unknown) {
      const fallback = initialRecord
        ? t('pages.approvals.edit.failed')
        : t('hr.messages.vehicleApplicationSubmitFailed');
      const friendly = getFriendlyApiErrorMessage(error, fallback, t);
      notifyApiError(error, fallback, messageApi, t);
      setFormError(friendly);
    } finally {
      setSubmitting(false);
    }
  }

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.tripSchedule'),
        validate: () => validateScheduleStep(),
        content: (
          <div className="flex flex-col gap-4">
            {initialRecord ? null : <OnBehalfSection state={onBehalf} />}
            <FormLayout
              variant="pro"
              title={t('hr.form.tripSchedule')}
              description={
                datesReady && departureAt && returnAt
                  ? `${formatProjectDate(departureAt.toISOString())} → ${formatProjectDate(returnAt.toISOString())}`
                  : t('pages.hr.vehicleApplication.scheduleStepDescription')
              }
            >
              <div className="erp-form-grid-2">
                <Form.Item
                  label={t('hr.form.departureDateTime')}
                  required
                >
                  <DatePicker
                    showTime={{ format: 'HH:mm' }}
                    format="YYYY-MM-DD HH:mm"
                    className="w-full"
                    value={departureAt}
                    disabledDate={getDisabledDepartureDate(canBackdate)}
                    onChange={(value) => handleDepartureChange(value)}
                  />
                </Form.Item>
                <Form.Item
                  label={t('hr.form.returnDateTime')}
                  required
                  validateStatus={
                    departureAt && returnAt && !returnAt.isAfter(departureAt)
                      ? 'error'
                      : undefined
                  }
                  help={
                    departureAt && returnAt && !returnAt.isAfter(departureAt)
                      ? t('hr.dateRules.returnAfterDeparture')
                      : undefined
                  }
                >
                  <DatePicker
                    showTime={{ format: 'HH:mm' }}
                    format="YYYY-MM-DD HH:mm"
                    className="w-full"
                    value={returnAt}
                    disabledDate={(d) =>
                      d.isBefore(departureAt ?? dayjs(), 'day')
                    }
                    onChange={(value) => handleReturnChange(value)}
                  />
                </Form.Item>
              </div>
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.form.selectVehicle'),
        validate: validateVehicleStep,
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.selectVehicle')}
            description={
              selectedVehicle
                ? `${selectedVehicle.plateNumber} - ${selectedVehicle.make} ${selectedVehicle.model}`
                : t('pages.hr.vehicleApplication.vehicleStepDescription')
            }
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

            {!datesReady ? (
              <ErpNotice
                tone="info"
                title={t('hr.messages.selectDatesForVehicles')}
              />
            ) : availableQuery.isLoading || availableQuery.isFetching ? (
              <div className="flex justify-center py-10">
                <Spin />
              </div>
            ) : availableQuery.isError ? (
              <ErpNotice
                tone="error"
                title={getFriendlyApiErrorMessage(
                  availableQuery.error,
                  t('hr.empty.noVehicles'),
                  t,
                )}
              />
            ) : vehicles.length === 0 ? (
              <ErpNotice
                tone="warning"
                title={t('hr.empty.noVehicles')}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {vehicles.map((vehicle) => {
                  const selected = selectedVehicle?.id === vehicle.id;
                  const available = vehicle.isAvailable;
                  return (
                    <Tooltip
                      key={vehicle.id}
                      title={
                        vehicle.conflictPeriod
                          ? t('hr.messages.vehicleConflict', {
                              number: vehicle.conflictPeriod.applicationNumber,
                            })
                          : undefined
                      }
                    >
                      <button
                        type="button"
                        disabled={!available}
                        onClick={() => handleVehicleSelect(vehicle)}
                        className={`erp-vehicle-pick-card w-full p-3.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50${
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
                            {vehicle.assignedDriver ? (
                              <p className="erp-users-cell-sub mb-0 mt-1 truncate">
                                {t('hr.labels.driver')}:{' '}
                                {formatDriverName(vehicle.assignedDriver)}
                              </p>
                            ) : null}
                          </div>
                          {available ? (
                            <CheckCircleOutlined
                              style={{
                                color: selected
                                  ? tokens.colorPrimary
                                  : '#52c41a',
                                fontSize: 16,
                              }}
                            />
                          ) : (
                            <CloseCircleOutlined
                              style={{ color: '#ff4d4f', fontSize: 16 }}
                            />
                          )}
                        </div>
                      </button>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </FormLayout>
        ),
      },
      {
        title: t('hr.section.tripDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.tripDetails')}
            description={t(
              'pages.hr.vehicleApplication.detailsStepDescription',
            )}
          >
            <Form.Item
              name="driveType"
              label={t('hr.form.driveType')}
              rules={[{ required: true }]}
            >
              <Radio.Group
                onChange={(e) =>
                  handleDriveTypeChange(e.target.value as DriveType)
                }
              >
                <Radio
                  value="COMPANY_DRIVER"
                  disabled={!resolveVehicleDriverId(selectedVehicle)}
                >
                  {t('hr.driveType.COMPANY_DRIVER')}
                </Radio>
                <Radio value="SELF_DRIVE">{t('hr.driveType.SELF_DRIVE')}</Radio>
              </Radio.Group>
            </Form.Item>

            {driveType === 'COMPANY_DRIVER' ? (
              <>
                <Form.Item name="driverId" hidden>
                  <Input />
                </Form.Item>
                <Form.Item label={t('hr.labels.driver')}>
                  <Input
                    disabled
                    value={
                      selectedVehicle?.assignedDriver
                        ? formatDriverName(selectedVehicle.assignedDriver)
                        : resolveVehicleDriverId(selectedVehicle) ?? ''
                    }
                    placeholder={t('hr.placeholder.driverAutoFilled')}
                  />
                </Form.Item>
              </>
            ) : null}

            <div className="erp-form-grid-2">
              <Form.Item
                name="destination"
                label={t('hr.form.destination')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.enterDestination'),
                  },
                ]}
              >
                <Input
                  maxLength={200}
                  placeholder={t('hr.placeholder.enterDestination')}
                />
              </Form.Item>
              <Form.Item
                name="passengerCount"
                label={t('hr.form.passengerCount')}
              >
                <InputNumber min={1} max={50} className="w-full" />
              </Form.Item>
            </div>

            <Form.Item
              name="purpose"
              label={t('hr.form.purpose')}
              rules={[
                {
                  required: true,
                  message: t('hr.validation.enterPurpose'),
                },
              ]}
            >
              <Input.TextArea
                rows={3}
                maxLength={4000}
                showCount
                placeholder={t('hr.placeholder.enterPurpose')}
              />
            </Form.Item>

            <Form.Item
              name="passengerNames"
              label={t('hr.form.passengerNames')}
            >
              <Input.TextArea
                rows={2}
                maxLength={2000}
                placeholder={t('hr.placeholder.enterPassengerNames')}
              />
            </Form.Item>

            <Form.Item name="notes" label={t('hr.form.notes')}>
              <Input.TextArea
                rows={2}
                maxLength={2000}
                showCount
                placeholder={t('hr.placeholder.enterNotes')}
              />
            </Form.Item>
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        validate: () => true,
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.labels.reviewApplication')}
            description={t('pages.hr.vehicleApplication.reviewStepDescription')}
          >
            <div className="erp-form-grid-2">
              <ReviewItem
                label={t('hr.labels.departure')}
                value={
                  departureAt
                    ? formatProjectDate(departureAt.toISOString())
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.labels.return')}
                value={
                  returnAt ? formatProjectDate(returnAt.toISOString()) : '-'
                }
              />
              <ReviewItem
                label={t('hr.labels.vehicle')}
                value={
                  selectedVehicle
                    ? `${selectedVehicle.plateNumber} (${selectedVehicle.make} ${selectedVehicle.model})`
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.driveType')}
                value={
                  driveType === 'SELF_DRIVE'
                    ? t('hr.driveType.SELF_DRIVE')
                    : t('hr.driveType.COMPANY_DRIVER')
                }
              />
              <ReviewItem
                label={t('hr.labels.destination')}
                value={formValues?.destination?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.labels.passengers')}
                value={String(formValues?.passengerCount ?? 1)}
              />
              <ReviewItem
                label={t('hr.labels.purpose')}
                value={formValues?.purpose?.trim() || '-'}
              />
              {formValues?.passengerNames?.trim() ? (
                <ReviewItem
                  label={t('hr.form.passengerNames')}
                  value={formValues.passengerNames.trim()}
                />
              ) : null}
              {formValues?.notes?.trim() ? (
                <ReviewItem
                  label={t('hr.labels.notes')}
                  value={formValues.notes.trim()}
                />
              ) : null}
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      initialRecord,
      onBehalf,
      t,
      form,
      departureAt,
      returnAt,
      datesReady,
      availableQuery.isLoading,
      availableQuery.isFetching,
      availableQuery.isError,
      availableQuery.error,
      vehicles,
      selectedVehicle,
      driveType,
      formValues,
    ],
  );

  return (
    <Form<VehicleApplicationFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      preserve
      className="flex min-h-0 flex-1 flex-col"
      initialValues={initialValues}
    >
      {formError ? (
        <ErpNotice
          tone="error"
          className="mb-4"
          title={formError}
          closable
          closeLabel={t('errors.dismiss')}
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
            : t('hr.buttons.submitApplication')
        }
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
      <p className="erp-users-stat-label mb-0.5">{label}</p>
      <p className="erp-users-cell-strong m-0 whitespace-pre-wrap text-sm">
        {value}
      </p>
    </div>
  );
}
