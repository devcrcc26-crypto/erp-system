'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Spin,
  Tooltip,
} from 'antd';
import {
  CarOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { AvailableVehicle } from '@/lib/api/company-vehicle.types';
import type {
  DriveType,
  VehicleApplicationDetail,
} from '@/lib/api/vehicle-application.types';
import { useAvailableVehicles } from '@/lib/query/company-vehicle';
import { useSubmitVehicleApplication } from '@/lib/query/vehicle-application';
import { useAllProjects } from '@/lib/query/projects';
import { tokens } from '@/lib/theme/tokens';
import { formatDriverName } from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';
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
  projectId?: string;
  notes?: string;
}

interface VehicleApplicationFormProps {
  onSuccess: (result: VehicleApplicationDetail) => void;
}

const SCHEDULE_FIELDS = ['departureDatetime', 'returnDatetime'] as const;
const DETAILS_FIELDS = [
  'driveType',
  'destination',
  'purpose',
  'passengerCount',
] as const;

/**
 * Stepped vehicle application create form — same chrome as Add Employee.
 */
export default function VehicleApplicationForm({
  onSuccess,
}: VehicleApplicationFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<VehicleApplicationFormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<AvailableVehicle | null>(
    null,
  );

  const submitMutation = useSubmitVehicleApplication();
  const projectsQuery = useAllProjects();

  const departureDatetime = Form.useWatch('departureDatetime', form);
  const returnDatetime = Form.useWatch('returnDatetime', form);
  const driveType = Form.useWatch('driveType', form) ?? 'COMPANY_DRIVER';
  const formValues = Form.useWatch([], form) as
    | VehicleApplicationFormValues
    | undefined;

  const availableParams = useMemo(() => {
    if (!departureDatetime || !returnDatetime) return null;
    if (returnDatetime.isBefore(departureDatetime)) return null;
    return {
      departureDatetime: departureDatetime.toISOString(),
      returnDatetime: returnDatetime.toISOString(),
    };
  }, [departureDatetime, returnDatetime]);

  const availableQuery = useAvailableVehicles(availableParams);
  const vehicles = availableQuery.data ?? [];

  const projectLabel = useMemo(() => {
    const projectId = formValues?.projectId;
    if (!projectId) return '—';
    const project = projectsQuery.data?.data?.find((row) => row.id === projectId);
    return project ? `${project.projectCode} — ${project.name}` : '—';
  }, [formValues?.projectId, projectsQuery.data?.data]);

  function clearVehicleSelection(): void {
    setSelectedVehicle(null);
    form.setFieldValue('vehicleId', undefined);
  }

  function handleVehicleSelect(vehicle: AvailableVehicle): void {
    if (!vehicle.isAvailable) return;
    setSelectedVehicle(vehicle);
    form.setFieldValue('vehicleId', vehicle.id);
    if (vehicle.assignedDriver) {
      form.setFieldsValue({
        driveType: 'COMPANY_DRIVER',
        driverId: vehicle.assignedDriver.id,
      });
    }
  }

  function handleDriveTypeChange(value: DriveType): void {
    if (value === 'SELF_DRIVE') {
      form.setFieldValue('driverId', undefined);
    } else if (selectedVehicle?.assignedDriver) {
      form.setFieldValue('driverId', selectedVehicle.assignedDriver.id);
    }
  }

  function resetForm(): void {
    form.resetFields();
    form.setFieldsValue({ driveType: 'COMPANY_DRIVER', passengerCount: 1 });
    setSelectedVehicle(null);
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
    if (!selectedVehicle) {
      messageApi.error(t('hr.validation.selectVehicle'));
      return false;
    }
    return validateFields(['vehicleId']);
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    let values: VehicleApplicationFormValues;
    try {
      values = await form.validateFields();
    } catch {
      messageApi.error(t('hr.validation.required'));
      return;
    }

    if (
      !values.departureDatetime ||
      !values.returnDatetime ||
      !values.vehicleId ||
      !values.destination ||
      !values.purpose
    ) {
      messageApi.error(t('hr.validation.required'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        vehicleId: values.vehicleId,
        driveType: values.driveType,
        driverId:
          values.driveType === 'COMPANY_DRIVER' ? values.driverId : undefined,
        departureDatetime: values.departureDatetime.toISOString(),
        returnDatetime: values.returnDatetime.toISOString(),
        destination: values.destination.trim(),
        purpose: values.purpose.trim(),
        passengerCount: values.passengerCount ?? 1,
        passengerNames: values.passengerNames?.trim() || undefined,
        projectId: values.projectId || undefined,
        notes: values.notes?.trim() || undefined,
      });

      messageApi.success(
        result.directApproved ||
          (result.status === 'APPROVED' && !result.approvalRequestId)
          ? t('hr.messages.vehicleApplicationApproved')
          : t('hr.messages.vehicleApplicationSubmitted'),
      );
      onSuccess(result);
    } catch (error: unknown) {
      const message = t('hr.messages.vehicleApplicationSubmitFailed');
      notifyApiError(error, message, messageApi);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const datesReady = Boolean(
    departureDatetime &&
      returnDatetime &&
      returnDatetime.isAfter(departureDatetime),
  );

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.tripSchedule'),
        validate: () => validateFields(SCHEDULE_FIELDS),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.tripSchedule')}
            description={t('hr.messages.selectDatesForVehicles')}
          >
            <div className="erp-form-grid-2">
              <Form.Item
                name="departureDatetime"
                label={t('hr.form.departureDateTime')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectDeparture'),
                  },
                ]}
              >
                <DatePicker
                  showTime
                  format="YYYY-MM-DD HH:mm"
                  className="w-full"
                  disabledDate={(d) => d.isBefore(dayjs(), 'day')}
                  onChange={() => clearVehicleSelection()}
                />
              </Form.Item>
              <Form.Item
                name="returnDatetime"
                label={t('hr.form.returnDateTime')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectReturn'),
                  },
                ]}
              >
                <DatePicker
                  showTime
                  format="YYYY-MM-DD HH:mm"
                  className="w-full"
                  disabledDate={(d) =>
                    d.isBefore(departureDatetime ?? dayjs(), 'day')
                  }
                  onChange={() => clearVehicleSelection()}
                />
              </Form.Item>
            </div>
          </FormLayout>
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
                ? `${selectedVehicle.plateNumber} — ${selectedVehicle.make} ${selectedVehicle.model}`
                : t('hr.placeholder.selectVehicle')
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
              <Alert
                type="info"
                showIcon
                message={t('hr.messages.selectDatesForVehicles')}
              />
            ) : availableQuery.isLoading ? (
              <div className="flex justify-center py-10">
                <Spin />
              </div>
            ) : vehicles.length === 0 ? (
              <Alert
                type="warning"
                showIcon
                message={t('hr.empty.noVehicles')}
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
                        className="w-full border bg-white p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          borderRadius: 2,
                          borderColor: selected
                            ? tokens.colorPrimary
                            : 'rgba(0,0,0,0.08)',
                          borderWidth: selected ? 2 : 1,
                          background: selected
                            ? tokens.colorPrimaryLight
                            : '#FFFFFF',
                        }}
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
                              <p
                                className="m-0 truncate text-sm font-semibold"
                                style={{ color: tokens.colorTextPrimary }}
                              >
                                {vehicle.plateNumber}
                              </p>
                            </div>
                            <p
                              className="mb-0 mt-1 truncate text-xs"
                              style={{ color: tokens.colorTextSecondary }}
                            >
                              {vehicle.make} {vehicle.model}
                            </p>
                            {vehicle.assignedDriver ? (
                              <p
                                className="mb-0 mt-1 truncate text-xs"
                                style={{ color: tokens.colorTextTertiary }}
                              >
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
        validate: () => validateFields(DETAILS_FIELDS),
        content: (
          <FormLayout variant="pro" title={t('hr.section.tripDetails')}>
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
                <Radio value="COMPANY_DRIVER">
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
                        : ''
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

            <div className="erp-form-grid-2">
              <Form.Item name="projectId" label={t('hr.form.project')}>
                <Select
                  showSearch
                  allowClear
                  placeholder={t('hr.placeholder.selectProject')}
                  loading={projectsQuery.isLoading}
                  filterOption={(input, option) =>
                    String(option?.label ?? '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                  options={
                    projectsQuery.data?.data?.map((project) => ({
                      value: project.id,
                      label: `${project.projectCode} — ${project.name}`,
                    })) ?? []
                  }
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
            </div>

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
            description={t('pages.hr.vehicleApplication.formDescription')}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReviewItem
                label={t('hr.labels.departure')}
                value={
                  departureDatetime
                    ? formatProjectDate(departureDatetime.toISOString())
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.labels.return')}
                value={
                  returnDatetime
                    ? formatProjectDate(returnDatetime.toISOString())
                    : '—'
                }
              />
              <ReviewItem
                label={t('hr.labels.vehicle')}
                value={
                  selectedVehicle
                    ? `${selectedVehicle.plateNumber} (${selectedVehicle.make} ${selectedVehicle.model})`
                    : '—'
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
                value={formValues?.destination?.trim() || '—'}
              />
              <ReviewItem
                label={t('hr.labels.passengers')}
                value={String(formValues?.passengerCount ?? 1)}
              />
              <ReviewItem label={t('hr.labels.project')} value={projectLabel} />
              <ReviewItem
                label={t('hr.labels.purpose')}
                value={formValues?.purpose?.trim() || '—'}
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
      t,
      departureDatetime,
      returnDatetime,
      datesReady,
      availableQuery.isLoading,
      vehicles,
      selectedVehicle,
      driveType,
      formValues,
      projectLabel,
      projectsQuery.isLoading,
      projectsQuery.data?.data,
    ],
  );

  return (
    <Form<VehicleApplicationFormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      className="flex min-h-0 flex-1 flex-col"
      initialValues={{ driveType: 'COMPANY_DRIVER', passengerCount: 1 }}
    >
      {formError ? (
        <Alert
          type="error"
          showIcon
          message={formError}
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
        submitLabel={t('hr.buttons.submitApplication')}
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
