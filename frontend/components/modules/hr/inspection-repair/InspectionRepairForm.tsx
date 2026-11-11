'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Form,
  Input,
  InputNumber,
  Radio,
  Select,
} from 'antd';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
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
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface FormValues {
  source: 'assigned' | 'manual';
  assetId?: string;
  deviceName?: string;
  location?: string;
  make?: string;
  model?: string;
  year?: number;
  description?: string;
  solution?: string;
  urgency: InspectionRepairUrgency;
  inspectionType: InspectionRepairType;
}

interface InspectionRepairFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: InspectionRepairDetail) => void;
}

const DETAILS_FIELDS = [
  'location',
  'inspectionType',
  'urgency',
  'description',
] as const;

/**
 * Inspection & repair create form - StepperForm chrome like Add Employee.
 */
export default function InspectionRepairForm({
  onSuccess,
  onCancel,
  cancelLabel,
}: InspectionRepairFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('INSPECTION_REPAIR');
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [detailsSnapshot, setDetailsSnapshot] = useState<FormValues | null>(
    null,
  );

  const assetsQuery = useMyInspectionRepairAssets();
  const submitMutation = useSubmitInspectionRepair();
  const formValues = Form.useWatch([], form) as FormValues | undefined;
  const source = formValues?.source ?? 'assigned';

  // Assigned assets are the signed-in user's; on-behalf filings describe the device manually.
  const noAssignedAssets =
    Boolean(onBehalf.employeeId) || (assetsQuery.data?.length ?? 0) === 0;

  useEffect(() => {
    if (!assetsQuery.isLoading && noAssignedAssets) {
      form.setFieldsValue({ source: 'manual' });
    }
  }, [assetsQuery.isLoading, noAssignedAssets, form]);

  const assetOptions = useMemo(
    () =>
      (assetsQuery.data ?? []).map((asset) => ({
        value: asset.id,
        label: `${asset.serialNumber} - ${asset.brand} ${asset.model}`,
      })),
    [assetsQuery.data],
  );

  const selectedAssetLabel = useMemo(() => {
    const assetId = detailsSnapshot?.assetId ?? formValues?.assetId;
    if (!assetId) {
      return '-';
    }
    return (
      assetOptions.find((option) => option.value === assetId)?.label ?? '-'
    );
  }, [assetOptions, detailsSnapshot?.assetId, formValues?.assetId]);

  function captureSnapshot(): FormValues {
    const values = form.getFieldsValue(true) as FormValues;
    setDetailsSnapshot(values);
    return values;
  }

  function resetForm(): void {
    onBehalf.reset();
    form.resetFields();
    form.setFieldsValue({
      source: noAssignedAssets ? 'manual' : 'assigned',
      urgency: 'MEDIUM',
      inspectionType: 'REPAIR',
    });
    setDetailsSnapshot(null);
    setFormError(null);
  }

  async function validateDeviceStep(): Promise<boolean> {
    const currentSource = form.getFieldValue('source') as FormValues['source'];
    const fields =
      currentSource === 'manual' ? (['deviceName'] as const) : (['assetId'] as const);
    try {
      await form.validateFields([...fields]);
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields([...DETAILS_FIELDS]);
      captureSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const sourceMode =
      (form.getFieldValue('source') as FormValues['source']) ?? 'assigned';

    try {
      const deviceOk = await validateDeviceStep();
      if (!deviceOk) {
        return;
      }
      await form.validateFields([
        ...(sourceMode === 'manual'
          ? (['deviceName'] as const)
          : (['assetId'] as const)),
        ...DETAILS_FIELDS,
      ]);
    } catch {
      return;
    }

    const values = form.getFieldsValue(true) as FormValues;
    const source = values.source ?? sourceMode;

    if (
      !values.location?.trim() ||
      !values.description?.trim() ||
      !values.urgency ||
      !values.inspectionType
    ) {
      return;
    }

    if (source === 'assigned' && !values.assetId) {
      return;
    }

    if (source === 'manual' && !values.deviceName?.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        ...onBehalf.payload,
        assetId: source === 'assigned' ? values.assetId : undefined,
        deviceName:
          source === 'manual' ? values.deviceName?.trim() : undefined,
        location: values.location.trim(),
        make:
          source === 'manual' ? values.make?.trim() || undefined : undefined,
        model:
          source === 'manual' ? values.model?.trim() || undefined : undefined,
        year: source === 'manual' ? values.year : undefined,
        description: values.description.trim(),
        solution: values.solution?.trim() || undefined,
        urgency: values.urgency,
        inspectionType: values.inspectionType,
      });
      messageApi.success(t('hr.messages.inspectionRepairSubmitted'));
      onSuccess(result);
    } catch (error: unknown) {
      const message = t('hr.messages.inspectionRepairSubmitFailed');
      notifyApiError(error, message, messageApi);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const reviewValues = detailsSnapshot ?? formValues;

  const steps = useMemo(
    () => [
      {
        title: t('hr.form.asset'),
        validate: () => validateDeviceStep(),
        content: (
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
            <FormLayout
              variant="pro"
              title={t('hr.form.asset')}
              description={t('pages.hr.inspectionRepair.deviceStepDescription')}
            >
              {noAssignedAssets ? (
                <ErpNotice
                  tone="info"
                  className="mb-4"
                  title={t('hr.messages.noAssignedInspectionAssets')}
                />
              ) : null}

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
                  rules={[
                    { required: true, message: t('hr.validation.required') },
                  ]}
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
                <div className="erp-form-grid-2">
                  <Form.Item
                    name="deviceName"
                    label={t('hr.form.deviceName')}
                    rules={[
                      { required: true, message: t('hr.validation.required') },
                    ]}
                  >
                    <Input
                      maxLength={200}
                      placeholder={t('hr.placeholder.enterDeviceName')}
                    />
                  </Form.Item>
                  <Form.Item name="make" label={t('hr.form.make')}>
                    <Input
                      maxLength={120}
                      placeholder={t('hr.placeholder.enterMake')}
                    />
                  </Form.Item>
                  <Form.Item name="model" label={t('hr.form.model')}>
                    <Input
                      maxLength={120}
                      placeholder={t('hr.placeholder.enterModel')}
                    />
                  </Form.Item>
                  <Form.Item name="year" label={t('hr.form.year')}>
                    <InputNumber min={1900} max={2100} className="w-full" />
                  </Form.Item>
                </div>
              )}
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.requestDetails')}
            description={t(
              'pages.hr.inspectionRepair.detailsStepDescription',
            )}
          >
            <div className="erp-form-grid-2">
              <Form.Item
                name="location"
                label={t('hr.form.location')}
                rules={[
                  { required: true, message: t('hr.validation.required') },
                ]}
              >
                <Input
                  maxLength={200}
                  placeholder={t('hr.placeholder.enterLocation')}
                />
              </Form.Item>
              <Form.Item
                name="inspectionType"
                label={t('hr.form.inspectionType')}
                rules={[
                  { required: true, message: t('hr.validation.required') },
                ]}
              >
                <Select
                  options={[
                    {
                      value: 'INSPECTION',
                      label: t('hr.inspectionType.INSPECTION'),
                    },
                    {
                      value: 'MAINTENANCE',
                      label: t('hr.inspectionType.MAINTENANCE'),
                    },
                    {
                      value: 'REPAIR',
                      label: t('hr.inspectionType.REPAIR'),
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="urgency"
                label={t('hr.form.urgency')}
                rules={[
                  {
                    required: true,
                    message: t('hr.validation.selectUrgency'),
                  },
                ]}
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
            </div>

            <Form.Item
              name="description"
              label={t('hr.form.description')}
              rules={[
                { required: true, message: t('hr.validation.required') },
              ]}
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
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.reviewSubmit')}
            description={t('pages.hr.inspectionRepair.reviewStepDescription')}
          >
            <div className="erp-form-grid-2">
              <ReviewItem
                label={t('hr.form.assetSource')}
                value={
                  reviewValues?.source === 'manual'
                    ? t('hr.form.enterDeviceManually')
                    : t('hr.form.useAssignedAsset')
                }
              />
              {reviewValues?.source === 'assigned' ? (
                <ReviewItem
                  label={t('hr.form.asset')}
                  value={selectedAssetLabel}
                />
              ) : (
                <>
                  <ReviewItem
                    label={t('hr.form.deviceName')}
                    value={reviewValues?.deviceName?.trim() || '-'}
                  />
                  <ReviewItem
                    label={t('hr.form.make')}
                    value={reviewValues?.make?.trim() || '-'}
                  />
                  <ReviewItem
                    label={t('hr.form.model')}
                    value={reviewValues?.model?.trim() || '-'}
                  />
                  <ReviewItem
                    label={t('hr.form.year')}
                    value={
                      reviewValues?.year != null
                        ? String(reviewValues.year)
                        : '-'
                    }
                  />
                </>
              )}
              <ReviewItem
                label={t('hr.form.location')}
                value={reviewValues?.location?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.form.inspectionType')}
                value={
                  reviewValues?.inspectionType
                    ? t(`hr.inspectionType.${reviewValues.inspectionType}`)
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.urgency')}
                value={
                  reviewValues?.urgency
                    ? t(`hr.urgency.${reviewValues.urgency}`)
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.form.description')}
                value={reviewValues?.description?.trim() || '-'}
              />
              {reviewValues?.solution?.trim() ? (
                <ReviewItem
                  label={t('hr.form.solution')}
                  value={reviewValues.solution.trim()}
                />
              ) : null}
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      onBehalf,
      t,
      noAssignedAssets,
      source,
      assetsQuery.isLoading,
      assetOptions,
      selectedAssetLabel,
      reviewValues,
    ],
  );

  return (
    <Form<FormValues>
      form={form}
      layout="vertical"
      requiredMark={false}
      preserve
      className="flex min-h-0 flex-1 flex-col"
      initialValues={{
        source: noAssignedAssets ? 'manual' : 'assigned',
        urgency: 'MEDIUM',
        inspectionType: 'REPAIR',
      }}
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
