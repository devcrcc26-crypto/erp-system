'use client';

import { useMemo, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
} from 'antd';
import dayjs from 'dayjs';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import type { FuelType } from '@/lib/api/company-vehicle.types';
import type { VehicleRefuelingDetail } from '@/lib/api/vehicle-refueling.types';
import { useCompanyVehicles } from '@/lib/query/company-vehicle';
import { useFullUsersDirectory } from '@/lib/query/users';
import { useSubmitVehicleRefueling } from '@/lib/query/vehicle-refueling';
import {
  FUEL_TYPE_OPTIONS,
  toDriverSelectOptions,
} from '@/lib/utils/company-vehicle-display';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface FormValues {
  vehicleId: string;
  driverId?: string;
  fuelDate: dayjs.Dayjs;
  fuelType: FuelType;
  fuelStation: string;
  currentMileage?: number;
  requestedLitres?: number;
  estimatedCostEtb?: number;
  notes?: string;
}

interface VehicleRefuelingFormProps {
  onSuccess: (result: VehicleRefuelingDetail) => void;
}

export default function VehicleRefuelingForm({
  onSuccess,
}: VehicleRefuelingFormProps): React.ReactNode {
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  const submitMutation = useSubmitVehicleRefueling();
  const vehiclesQuery = useCompanyVehicles({ page: 1, limit: 100 });
  const usersQuery = useFullUsersDirectory();
  const driverOptions = useMemo(
    () => toDriverSelectOptions(usersQuery.data ?? []),
    [usersQuery.data],
  );

  async function handleSubmit(): Promise<void> {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
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
        result.directApproved || (result.status === 'APPROVED' && !result.approvalRequestId)
          ? 'Refueling request approved'
          : 'Refueling request submitted for approval',
      );
      onSuccess(result);
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to submit refueling request', messageApi);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6 pb-8">
      <SectionCard title="Refueling Details" bodyClassName="px-5 py-4">
        <Form form={form} layout="vertical" initialValues={{ fuelType: 'DIESEL' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              name="vehicleId"
              label="Vehicle"
              rules={[{ required: true, message: 'Select a vehicle' }]}
            >
              <Select
                showSearch
                placeholder="Select vehicle"
                loading={vehiclesQuery.isLoading}
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                options={
                  vehiclesQuery.data?.data?.map((v) => ({
                    value: v.id,
                    label: `${v.plateNumber} — ${v.make} ${v.model}`,
                  })) ?? []
                }
              />
            </Form.Item>
            <Form.Item name="driverId" label="Driver (optional)">
              <Select
                showSearch
                allowClear
                placeholder="Select driver"
                loading={usersQuery.isLoading}
                notFoundContent={
                  usersQuery.isLoading
                    ? 'Loading...'
                    : 'No users with Driver position'
                }
                filterOption={(input, option) =>
                  String(option?.label ?? '')
                    .toLowerCase()
                    .includes(input.toLowerCase())
                }
                options={driverOptions}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              name="fuelDate"
              label="Fuel Date"
              rules={[{ required: true, message: 'Select date' }]}
            >
              <DatePicker
                style={{ width: '100%' }}
                disabledDate={(d) => d.isAfter(dayjs(), 'day')}
              />
            </Form.Item>
            <Form.Item
              name="fuelType"
              label="Fuel Type"
              rules={[{ required: true, message: 'Required' }]}
            >
              <Select options={FUEL_TYPE_OPTIONS} />
            </Form.Item>
          </div>

          <Form.Item
            name="fuelStation"
            label="Fuel Station"
            rules={[{ required: true, message: 'Enter station name' }]}
          >
            <Input maxLength={200} placeholder="e.g. NOC Bole" />
          </Form.Item>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4">
            <Form.Item name="currentMileage" label="Current Mileage (km)">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 45200" />
            </Form.Item>
            <Form.Item name="requestedLitres" label="Requested Litres">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 50" />
            </Form.Item>
            <Form.Item name="estimatedCostEtb" label="Estimated Cost (ETB)">
              <InputNumber min={0} style={{ width: '100%' }} placeholder="e.g. 3500" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="Notes (optional)">
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
        </Form>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          type="primary"
          loading={submitting}
          onClick={() => void handleSubmit()}
        >
          Submit Request
        </Button>
      </div>
    </div>
  );
}
