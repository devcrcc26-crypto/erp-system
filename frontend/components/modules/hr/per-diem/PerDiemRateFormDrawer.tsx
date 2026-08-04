'use client';

import { useEffect } from 'react';
import { Button, Drawer, Form, Input, InputNumber, Select, Switch } from 'antd';
import { useAppMessage } from '@/hooks/use-app-message';
import type { PerDiemRate, SupportedCurrency } from '@/lib/api/per-diem.types';
import { useCreatePerDiemRate, useUpdatePerDiemRate } from '@/lib/query/per-diem';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface RateFormValues {
  destinationCategory: string;
  dailyRate: number;
  currency: SupportedCurrency;
  description?: string;
  isActive: boolean;
}

const CURRENCY_OPTIONS = [
  { value: 'ETB', label: 'ETB - Ethiopian Birr' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'CNY', label: 'CNY - Chinese Yuan' },
];

/**
 * Drawer to create or edit a per diem destination rate.
 */
export default function PerDiemRateFormDrawer({
  open,
  editingRate,
  onClose,
}: {
  open: boolean;
  editingRate: PerDiemRate | null;
  onClose: () => void;
}): React.ReactNode {
  const messageApi = useAppMessage();
  const [form] = Form.useForm<RateFormValues>();
  const createMutation = useCreatePerDiemRate();
  const updateMutation = useUpdatePerDiemRate();

  useEffect(() => {
    if (!open) return;
    if (editingRate) {
      form.setFieldsValue({
        destinationCategory: editingRate.destinationCategory,
        dailyRate: Number(editingRate.dailyRate),
        currency: editingRate.currency,
        description: editingRate.description ?? undefined,
        isActive: editingRate.isActive,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ currency: 'ETB', isActive: true });
    }
  }, [open, editingRate, form]);

  async function handleSubmit(values: RateFormValues): Promise<void> {
    try {
      if (editingRate) {
        await updateMutation.mutateAsync({
          id: editingRate.id,
          payload: {
            destinationCategory: values.destinationCategory.trim(),
            dailyRate: values.dailyRate,
            currency: values.currency,
            description: values.description?.trim() || undefined,
            isActive: values.isActive,
          },
        });
        messageApi.success('Rate updated');
      } else {
        await createMutation.mutateAsync({
          destinationCategory: values.destinationCategory.trim(),
          dailyRate: values.dailyRate,
          currency: values.currency,
          description: values.description?.trim() || undefined,
        });
        messageApi.success('Rate created');
      }
      onClose();
    } catch (error: unknown) {
      notifyApiError(error, 'Failed to save rate', messageApi);
    }
  }

  const saving = createMutation.isPending || updateMutation.isPending;

  return (
    <Drawer
      open={open}
      title={editingRate ? 'Edit Per Diem Rate' : 'Add Per Diem Rate'}
      size={480}
      className="erp-responsive-drawer"
      onClose={onClose}
      destroyOnHidden
      extra={
        <Button type="primary" loading={saving} onClick={() => form.submit()}>
          {editingRate ? 'Save' : 'Create'}
        </Button>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={(values) => void handleSubmit(values)}
      >
        <Form.Item
          name="destinationCategory"
          label="Destination Category"
          rules={[{ required: true, message: 'Enter a destination category' }]}
        >
          <Input placeholder="e.g. Domestic, East Africa, Middle East" maxLength={100} />
        </Form.Item>

        <div className="grid grid-cols-2 gap-3">
          <Form.Item
            name="dailyRate"
            label="Daily Rate"
            rules={[{ required: true, message: 'Enter the daily rate' }]}
          >
            <InputNumber className="w-full" min={0.01} precision={2} />
          </Form.Item>
          <Form.Item
            name="currency"
            label="Currency"
            rules={[{ required: true, message: 'Select a currency' }]}
          >
            <Select options={CURRENCY_OPTIONS} />
          </Form.Item>
        </div>

        <Form.Item name="description" label="Description">
          <Input.TextArea rows={3} maxLength={1000} showCount />
        </Form.Item>

        {editingRate ? (
          <Form.Item name="isActive" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        ) : null}
      </Form>
    </Drawer>
  );
}
