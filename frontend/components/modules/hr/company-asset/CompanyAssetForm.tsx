'use client';

import { useState } from 'react';
import { Button, Form, Input, InputNumber } from 'antd';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { CompanyAssetDetail } from '@/lib/api/company-asset.types';
import {
  useCreateCompanyAsset,
  useUpdateCompanyAsset,
} from '@/lib/query/company-asset';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface FormValues {
  serialNumber: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  type: string;
  description?: string;
}

interface CompanyAssetFormProps {
  mode?: 'create' | 'edit';
  asset?: CompanyAssetDetail;
  onSuccess: (result: CompanyAssetDetail) => void;
}

export default function CompanyAssetForm({
  mode = 'create',
  asset,
  onSuccess,
}: CompanyAssetFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);

  const createMutation = useCreateCompanyAsset();
  const updateMutation = useUpdateCompanyAsset(asset?.id ?? '');

  async function handleSubmit(): Promise<void> {
    let values: FormValues;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        serialNumber: values.serialNumber.trim(),
        brand: values.brand.trim(),
        model: values.model.trim(),
        year: values.year,
        color: values.color.trim(),
        type: values.type.trim(),
        description: values.description?.trim() || undefined,
      };

      const result =
        mode === 'edit'
          ? await updateMutation.mutateAsync(payload)
          : await createMutation.mutateAsync(payload);

      messageApi.success(
        mode === 'edit'
          ? t('hr.assetMessages.updated')
          : t('hr.assetMessages.created'),
      );
      onSuccess(result);
    } catch (error: unknown) {
      notifyApiError(
        error,
        mode === 'edit'
          ? t('hr.assetMessages.failedToUpdate')
          : t('hr.assetMessages.failedToCreate'),
        messageApi,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl flex flex-col gap-6 pb-8">
      <SectionCard
        title={t('hr.assetSection.assetDetails')}
        bodyClassName="px-5 py-4"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={
            asset
              ? {
                  serialNumber: asset.serialNumber,
                  brand: asset.brand,
                  model: asset.model,
                  year: asset.year,
                  color: asset.color,
                  type: asset.type,
                  description: asset.description ?? undefined,
                }
              : undefined
          }
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              name="serialNumber"
              label={t('hr.assetLabels.serialNumber')}
              rules={[{ required: true, message: 'Serial number is required' }]}
            >
              <Input
                maxLength={100}
                placeholder={t('hr.assetPlaceholder.serialNumber')}
              />
            </Form.Item>
            <Form.Item
              name="type"
              label={t('hr.assetLabels.type')}
              rules={[{ required: true, message: 'Type is required' }]}
            >
              <Input
                maxLength={100}
                placeholder={t('hr.assetPlaceholder.type')}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              name="brand"
              label={t('hr.assetLabels.brand')}
              rules={[{ required: true, message: 'Brand is required' }]}
            >
              <Input
                maxLength={100}
                placeholder={t('hr.assetPlaceholder.brand')}
              />
            </Form.Item>
            <Form.Item
              name="model"
              label={t('hr.assetLabels.model')}
              rules={[{ required: true, message: 'Model is required' }]}
            >
              <Input
                maxLength={100}
                placeholder={t('hr.assetPlaceholder.model')}
              />
            </Form.Item>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4">
            <Form.Item
              name="year"
              label={t('hr.assetLabels.year')}
              rules={[{ required: true, message: 'Year is required' }]}
            >
              <InputNumber
                min={1900}
                max={2100}
                style={{ width: '100%' }}
                placeholder={t('hr.assetPlaceholder.year')}
              />
            </Form.Item>
            <Form.Item
              name="color"
              label={t('hr.assetLabels.color')}
              rules={[{ required: true, message: 'Color is required' }]}
            >
              <Input
                maxLength={50}
                placeholder={t('hr.assetPlaceholder.color')}
              />
            </Form.Item>
          </div>

          <Form.Item name="description" label={t('hr.assetLabels.description')}>
            <Input.TextArea
              rows={3}
              maxLength={2000}
              showCount
              placeholder={t('hr.assetPlaceholder.description')}
            />
          </Form.Item>
        </Form>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          type="primary"
          loading={submitting}
          onClick={() => void handleSubmit()}
        >
          {mode === 'edit'
            ? t('hr.assetButtons.save')
            : t('hr.assetButtons.create')}
        </Button>
      </div>
    </div>
  );
}
