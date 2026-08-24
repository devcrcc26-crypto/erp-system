'use client';

import { useMemo, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Radio, Select } from 'antd';
import HrFormPageShell from '@/components/modules/hr/shared/HrFormPageShell';
import { SectionCard } from '@/components/modules/hr/shared/hr-page-chrome';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  InspectionRepairDetail,
  InspectionRepairType,
  InspectionRepairUrgency,
} from '@/lib/api/inspection-repair.types';
import {
  useMyInspectionRepairAssets,
  useSubmitInspectionRepair,
} from '@/lib/query/inspection-repair';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface FormValues {
  source: 'assigned' | 'manual';
  assetId?: string;
  deviceName?: string;
  location: string;
  make?: string;
  model?: string;
  year?: number;
  description: string;
  solution?: string;
  urgency: InspectionRepairUrgency;
  inspectionType: InspectionRepairType;
}

export default function InspectionRepairForm({
  onSuccess,
}: {
  onSuccess: (result: InspectionRepairDetail) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const assetsQuery = useMyInspectionRepairAssets();
  const submitMutation = useSubmitInspectionRepair();

  const source = Form.useWatch('source', form) ?? 'assigned';
  const assetOptions = useMemo(
    () =>
      (assetsQuery.data ?? []).map((asset) => ({
        value: asset.id,
        label: `${asset.serialNumber} — ${asset.brand} ${asset.model}`,
      })),
    [assetsQuery.data],
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
        assetId: values.source === 'assigned' ? values.assetId : undefined,
        deviceName: values.source === 'manual' ? values.deviceName?.trim() : undefined,
        location: values.location.trim(),
        make: values.source === 'manual' ? values.make?.trim() || undefined : undefined,
        model: values.source === 'manual' ? values.model?.trim() || undefined : undefined,
        year: values.source === 'manual' ? values.year : undefined,
        description: values.description.trim(),
        solution: values.solution?.trim() || undefined,
        urgency: values.urgency,
        inspectionType: values.inspectionType,
      });
      messageApi.success(t('hr.messages.inspectionRepairSubmitted'));
      onSuccess(result);
    } catch (error: unknown) {
      notifyApiError(error, t('hr.messages.inspectionRepairSubmitFailed'), messageApi);
    } finally {
      setSubmitting(false);
    }
  }

  const noAssignedAssets = (assetsQuery.data?.length ?? 0) === 0;

  return (
    <HrFormPageShell
      title={t('pages.hr.inspectionRepair.new')}
      description={t('pages.hr.inspectionRepair.formDescription')}
      cancelLabel={t('hr.buttons.cancel')}
      cancelHref="/approvals/new"
    >
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-8">
        {noAssignedAssets ? (
          <Alert
            type="info"
            showIcon
            title={t('hr.messages.noAssignedInspectionAssets')}
          />
        ) : null}

        <SectionCard title={t('hr.section.requestDetails')} bodyClassName="px-5 py-4">
          <Form
            form={form}
            layout="vertical"
            initialValues={{
              source: noAssignedAssets ? 'manual' : 'assigned',
              urgency: 'MEDIUM',
              inspectionType: 'REPAIR',
            }}
          >
            <Form.Item name="source" label={t('hr.form.assetSource')}>
              <Radio.Group
                options={[
                  {
                    label: t('hr.form.useAssignedAsset'),
                    value: 'assigned',
                    disabled: noAssignedAssets,
                  },
                  {
                    label: t('hr.form.enterDeviceManually'),
                    value: 'manual',
                  },
                ]}
              />
            </Form.Item>

            {source === 'assigned' ? (
              <Form.Item
                name="assetId"
                label={t('hr.form.asset')}
                rules={[{ required: true, message: t('hr.validation.required') }]}
              >
                <Select
                  showSearch
                  placeholder={t('hr.placeholder.selectAsset')}
                  loading={assetsQuery.isLoading}
                  options={assetOptions}
                  filterOption={(input, option) =>
                    String(option?.label ?? '')
                      .toLowerCase()
                      .includes(input.toLowerCase())
                  }
                />
              </Form.Item>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Form.Item
                  name="deviceName"
                  label={t('hr.form.deviceName')}
                  rules={[{ required: true, message: t('hr.validation.required') }]}
                >
                  <Input maxLength={200} placeholder={t('hr.placeholder.enterDeviceName')} />
                </Form.Item>
                <Form.Item name="make" label={t('hr.form.make')}>
                  <Input maxLength={120} placeholder={t('hr.placeholder.enterMake')} />
                </Form.Item>
                <Form.Item name="model" label={t('hr.form.model')}>
                  <Input maxLength={120} placeholder={t('hr.placeholder.enterModel')} />
                </Form.Item>
                <Form.Item name="year" label={t('hr.form.year')}>
                  <InputNumber min={1900} max={2100} className="w-full" />
                </Form.Item>
              </div>
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Item
                name="location"
                label={t('hr.form.location')}
                rules={[{ required: true, message: t('hr.validation.required') }]}
              >
                <Input maxLength={200} placeholder={t('hr.placeholder.enterLocation')} />
              </Form.Item>
              <Form.Item
                name="inspectionType"
                label={t('hr.form.inspectionType')}
                rules={[{ required: true, message: t('hr.validation.required') }]}
              >
                <Select
                  options={[
                    { value: 'INSPECTION', label: t('hr.inspectionType.INSPECTION') },
                    { value: 'MAINTENANCE', label: t('hr.inspectionType.MAINTENANCE') },
                    { value: 'REPAIR', label: t('hr.inspectionType.REPAIR') },
                  ]}
                />
              </Form.Item>
            </div>

            <Form.Item
              name="urgency"
              label={t('hr.form.urgency')}
              rules={[{ required: true, message: t('hr.validation.selectUrgency') }]}
            >
              <Select
                options={[
                  { value: 'CRITICAL', label: t('hr.urgency.CRITICAL') },
                  { value: 'URGENT', label: t('hr.urgency.URGENT') },
                  { value: 'MEDIUM', label: t('hr.urgency.MEDIUM') },
                  { value: 'MINOR', label: t('hr.urgency.MINOR') },
                ]}
              />
            </Form.Item>

            <Form.Item
              name="description"
              label={t('hr.form.description')}
              rules={[{ required: true, message: t('hr.validation.required') }]}
            >
              <Input.TextArea
                rows={4}
                maxLength={4000}
                showCount
                placeholder={t('hr.placeholder.enterInspectionDescription')}
              />
            </Form.Item>

            <Form.Item name="solution" label={t('hr.form.solution')}>
              <Input.TextArea
                rows={3}
                maxLength={4000}
                showCount
                placeholder={t('hr.placeholder.enterSuggestedSolution')}
              />
            </Form.Item>
          </Form>
        </SectionCard>

        <div className="flex justify-end">
          <Button type="primary" loading={submitting} onClick={() => void handleSubmit()}>
            {t('hr.buttons.submitRequest')}
          </Button>
        </div>
      </div>
    </HrFormPageShell>
  );
}
