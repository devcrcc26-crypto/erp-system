'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
  Tooltip,
  Typography,
} from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import type { AvailableVehicle } from '@/lib/api/company-vehicle.types';
import type {
  DriveType,
  VehicleApplicationDetail,
} from '@/lib/api/vehicle-application.types';
import { useAvailableVehicles } from '@/lib/query/company-vehicle';
import { useSubmitVehicleApplication } from '@/lib/query/vehicle-application';
import { useAllProjects } from '@/lib/query/projects';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { formatDriverName } from '@/lib/utils/company-vehicle-display';

interface TripValues {
  departureDatetime: dayjs.Dayjs;
  returnDatetime: dayjs.Dayjs;
}

interface FormValues {
  vehicleId: string;
  driveType: DriveType;
  driverId?: string;
  destination: string;
  purpose: string;
  passengerCount?: number;
  passengerNames?: string;
  projectId?: string;
  notes?: string;
}

interface VehicleApplicationFormProps {
  onSuccess: (result: VehicleApplicationDetail) => void;
}

export default function VehicleApplicationForm({
  onSuccess,
}: VehicleApplicationFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [tripForm] = Form.useForm<TripValues>();
  const [mainForm] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  const [departureDatetime, setDepartureDatetime] = useState<dayjs.Dayjs | null>(null);
  const [returnDatetime, setReturnDatetime] = useState<dayjs.Dayjs | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<AvailableVehicle | null>(null);
  const [driveType, setDriveType] = useState<DriveType>('COMPANY_DRIVER');

  const submitMutation = useSubmitVehicleApplication();
  const projectsQuery = useAllProjects();

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

  function handleDatesChange(): void {
    const dep = tripForm.getFieldValue('departureDatetime') as dayjs.Dayjs | null;
    const ret = tripForm.getFieldValue('returnDatetime') as dayjs.Dayjs | null;
    setDepartureDatetime(dep);
    setReturnDatetime(ret);
    setSelectedVehicle(null);
    mainForm.setFieldValue('vehicleId', undefined);
  }

  function handleVehicleSelect(vehicle: AvailableVehicle): void {
    if (!vehicle.isAvailable) return;
    setSelectedVehicle(vehicle);
    mainForm.setFieldValue('vehicleId', vehicle.id);
    if (vehicle.assignedDriver) {
      setDriveType('COMPANY_DRIVER');
      mainForm.setFieldsValue({
        driveType: 'COMPANY_DRIVER',
        driverId: vehicle.assignedDriver.id,
      });
    }
  }

  function handleDriveTypeChange(value: DriveType): void {
    setDriveType(value);
    if (value === 'SELF_DRIVE') {
      mainForm.setFieldValue('driverId', undefined);
    } else if (selectedVehicle?.assignedDriver) {
      mainForm.setFieldValue('driverId', selectedVehicle.assignedDriver.id);
    }
  }

  async function handleSubmit(): Promise<void> {
    let tripValues: TripValues;
    let formValues: FormValues;
    try {
      tripValues = await tripForm.validateFields();
      formValues = await mainForm.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        vehicleId: formValues.vehicleId,
        driveType: formValues.driveType,
        driverId: formValues.driveType === 'COMPANY_DRIVER' ? formValues.driverId : undefined,
        departureDatetime: tripValues.departureDatetime.toISOString(),
        returnDatetime: tripValues.returnDatetime.toISOString(),
        destination: formValues.destination.trim(),
        purpose: formValues.purpose.trim(),
        passengerCount: formValues.passengerCount ?? 1,
        passengerNames: formValues.passengerNames?.trim() || undefined,
        projectId: formValues.projectId || undefined,
        notes: formValues.notes?.trim() || undefined,
      });

      messageApi.success(
        result.directApproved || (result.status === 'APPROVED' && !result.approvalRequestId)
          ? 'Vehicle application approved'
          : 'Vehicle application submitted for approval',
      );
      onSuccess(result);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit vehicle application', messageApi);
    } finally {
      setSubmitting(false);
    }
  }

  const datesReady = Boolean(departureDatetime && returnDatetime && returnDatetime.isAfter(departureDatetime));

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6 pb-8">
      <SectionCard title={t('hr.form.tripDetails')} bodyClassName="px-5 py-4">
        <Form form={tripForm} layout="vertical">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              name="departureDatetime"
              label={t('hr.form.departureDateTime')}
              rules={[{ required: true, message: 'Select departure' }]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }}
                disabledDate={(d) => d.isBefore(dayjs(), 'day')}
                onChange={() => handleDatesChange()}
              />
            </Form.Item>
            <Form.Item
              name="returnDatetime"
              label={t('hr.form.returnDateTime')}
              rules={[{ required: true, message: 'Select return' }]}
            >
              <DatePicker
                showTime
                format="YYYY-MM-DD HH:mm"
                style={{ width: '100%' }}
                disabledDate={(d) =>
                  d.isBefore(departureDatetime ?? dayjs(), 'day')
                }
                onChange={() => handleDatesChange()}
              />
            </Form.Item>
          </div>
        </Form>
      </SectionCard>

      <SectionCard title={t('hr.form.vehicle')} bodyClassName="px-5 py-4">
        {!datesReady ? (
          <Alert
            type="info"
            showIcon
            title="Select departure and return dates above to see available vehicles."
          />
        ) : availableQuery.isLoading ? (
          <Typography.Text type="secondary">Loading vehicles...</Typography.Text>
        ) : vehicles.length === 0 ? (
          <Alert type="warning" showIcon title={t('hr.empty.noVehicles')} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {vehicles.map((v) => (
              <Tooltip
                key={v.id}
                title={
                  v.conflictPeriod
                    ? `Conflicts with ${v.conflictPeriod.applicationNumber}`
                    : undefined
                }
              >
                <Card
                  size="small"
                  hoverable={v.isAvailable}
                  onClick={() => handleVehicleSelect(v)}
                  style={{
                    opacity: v.isAvailable ? 1 : 0.5,
                    cursor: v.isAvailable ? 'pointer' : 'not-allowed',
                    border:
                      selectedVehicle?.id === v.id
                        ? `2px solid ${tokens.colorPrimary}`
                        : undefined,
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <Typography.Text strong>
                        {v.plateNumber}
                      </Typography.Text>
                      <Typography.Text
                        type="secondary"
                        className="ml-2"
                      >
                        {v.make} {v.model}
                      </Typography.Text>
                    </div>
                    {v.isAvailable ? (
                      <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    ) : (
                      <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
                    )}
                  </div>
                  {v.assignedDriver ? (
                    <Typography.Text type="secondary" className="text-xs block mt-1">
                      Driver: {formatDriverName(v.assignedDriver)}
                    </Typography.Text>
                  ) : null}
                </Card>
              </Tooltip>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard title={t('hr.section.tripDetails')} bodyClassName="px-5 py-4">
        <Form form={mainForm} layout="vertical" initialValues={{ driveType: 'COMPANY_DRIVER', passengerCount: 1 }}>
          <Form.Item name="vehicleId" hidden rules={[{ required: true, message: 'Select a vehicle above' }]}>
            <Input />
          </Form.Item>

          <Form.Item name="driveType" label={t('hr.form.driveType')} rules={[{ required: true }]}>
            <Radio.Group onChange={(e) => handleDriveTypeChange(e.target.value as DriveType)}>
              <Radio value="COMPANY_DRIVER">{t('hr.driveType.COMPANY_DRIVER')}</Radio>
              <Radio value="SELF_DRIVE">{t('hr.driveType.SELF_DRIVE')}</Radio>
            </Radio.Group>
          </Form.Item>

          {driveType === 'COMPANY_DRIVER' ? (
            <Form.Item name="driverId" label={t('hr.labels.driver')}>
              <Input
                disabled
                value={
                  selectedVehicle?.assignedDriver
                    ? formatDriverName(selectedVehicle.assignedDriver)
                    : ''
                }
                placeholder={
                  selectedVehicle?.assignedDriver
                    ? formatDriverName(selectedVehicle.assignedDriver)
                    : 'Auto-filled from vehicle'
                }
              />
            </Form.Item>
          ) : null}

          <Form.Item
            name="destination"
            label={t('hr.form.destination')}
            rules={[{ required: true, message: 'Enter destination' }]}
          >
            <Input maxLength={200} placeholder={t('hr.placeholder.enterDestination')} />
          </Form.Item>

          <Form.Item
            name="purpose"
            label={t('hr.form.purpose')}
            rules={[{ required: true, message: 'Enter purpose' }]}
          >
            <Input.TextArea rows={3} maxLength={4000} showCount placeholder={t('hr.placeholder.enterPurpose')} />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item name="passengerCount" label={t('hr.form.passengerCount')}>
              <InputNumber min={1} max={50} style={{ width: '100%' }} />
            </Form.Item>
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
                  projectsQuery.data?.data?.map((p) => ({
                    value: p.id,
                    label: `${p.projectCode} - ${p.name}`,
                  })) ?? []
                }
              />
            </Form.Item>
          </div>

          <Form.Item name="passengerNames" label={t('hr.form.passengerNames')}>
            <Input.TextArea rows={2} maxLength={2000} placeholder={t('hr.placeholder.enterPassengerNames')} />
          </Form.Item>

          <Form.Item name="notes" label={t('hr.form.notes')}>
            <Input.TextArea
              rows={2}
              maxLength={2000}
              showCount
              placeholder={t('hr.placeholder.enterNotes')}
            />
          </Form.Item>
        </Form>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          type="primary"
          loading={submitting}
          disabled={!selectedVehicle}
          onClick={() => void handleSubmit()}
        >
          {t('hr.buttons.submitApplication')}
        </Button>
      </div>
    </div>
  );
}
