'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Select,
} from 'antd';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
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

/**
 * Vehicle refueling create form — pro FormLayout chrome.
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
  const driverOptions = useMemo(
    () => toDriverSelectOptions(usersQuery.data ?? []),
    [usersQuery.data],
  );

  async function handleSubmit(values: FormValues): Promise<void> {
    setFormError(null);
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

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {formError ? (
        <Alert
          type="error"
          showIcon
          title={formError}
          closable
          onClose={() => setFormError(null)}
        />
      ) : null}

      <Form<FormValues>
        form={form}
        layout="vertical"
        requiredMark={false}
        initialValues={{ fuelType: 'DIESEL' }}
        onFinish={(values) => void handleSubmit(values)}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
        <FormLayout
          variant="pro"
          title={t('hr.section.requestDetails')}
          description={t('pages.hr.vehicleRefueling.formDescription')}
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
              <DatePicker
                className="w-full"
                disabledDate={(date) => date.isAfter(dayjs(), 'day')}
              />
            </Form.Item>
            <Form.Item
              name="fuelType"
              label={t('hr.form.fuelType')}
              rules={[{ required: true, message: t('hr.validation.required') }]}
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
              <InputNumber min={0} className="w-full" placeholder="e.g. 45200" />
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
              <InputNumber min={0} className="w-full" placeholder="e.g. 3500" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label={t('hr.form.notes')}>
            <Input.TextArea rows={3} maxLength={2000} showCount />
          </Form.Item>
        </FormLayout>

        <div className="flex justify-end">
          <Button
            type="primary"
            htmlType="submit"
            loading={submitting}
            style={{ borderRadius: 0 }}
          >
            {t('hr.buttons.submitRequest')}
          </Button>
        </div>
      </Form>
    </div>
  );
}
