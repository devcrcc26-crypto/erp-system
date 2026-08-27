'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, Input, InputNumber, Typography } from 'antd';
import { Image as ImageIcon, Paperclip, X } from 'lucide-react';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { CompanyAssetDetail } from '@/lib/api/company-asset.types';
import {
  useCreateCompanyAsset,
  useUpdateCompanyAsset,
  useUploadCompanyAssetPhoto,
} from '@/lib/query/company-asset';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';

interface FormValues {
  serialNumber?: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: string;
  description?: string;
}

interface CompanyAssetFormProps {
  mode?: 'create' | 'edit';
  asset?: CompanyAssetDetail;
  onSuccess: (result: CompanyAssetDetail) => void;
}

const DETAILS_FIELDS = [
  'serialNumber',
  'type',
  'brand',
  'model',
  'year',
  'color',
] as const;

/**
 * Company asset create/edit form — StepperForm chrome like Add Employee.
 */
export default function CompanyAssetForm({
  mode = 'create',
  asset,
  onSuccess,
}: CompanyAssetFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [detailsSnapshot, setDetailsSnapshot] = useState<FormValues>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const createMutation = useCreateCompanyAsset();
  const updateMutation = useUpdateCompanyAsset(asset?.id ?? '');
  const uploadPhotoMutation = useUploadCompanyAssetPhoto();
  const formValues = Form.useWatch([], form) as FormValues | undefined;

  useEffect(() => {
    if (!asset) {
      return;
    }
    const values: FormValues = {
      serialNumber: asset.serialNumber,
      brand: asset.brand,
      model: asset.model,
      year: asset.year,
      color: asset.color,
      type: asset.type,
      description: asset.description ?? undefined,
    };
    form.setFieldsValue(values);
    setDetailsSnapshot(values);
  }, [asset, form]);

  function captureDetailsSnapshot(): FormValues {
    const values = form.getFieldsValue(true) as FormValues;
    setDetailsSnapshot(values);
    return values;
  }

  function resetForm(): void {
    if (asset) {
      form.setFieldsValue({
        serialNumber: asset.serialNumber,
        brand: asset.brand,
        model: asset.model,
        year: asset.year,
        color: asset.color,
        type: asset.type,
        description: asset.description ?? undefined,
      });
      setDetailsSnapshot({
        serialNumber: asset.serialNumber,
        brand: asset.brand,
        model: asset.model,
        year: asset.year,
        color: asset.color,
        type: asset.type,
        description: asset.description ?? undefined,
      });
    } else {
      form.resetFields();
      form.setFieldsValue({ year: new Date().getFullYear() });
      setDetailsSnapshot({});
    }
    setPhotoFile(null);
    setFormError(null);
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields([...DETAILS_FIELDS]);
      captureDetailsSnapshot();
      return true;
    } catch {
      return false;
    }
  }

  async function validatePhotoStep(): Promise<boolean> {
    captureDetailsSnapshot();
    return true;
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    let values: FormValues;
    try {
      values = await form.validateFields([...DETAILS_FIELDS]);
    } catch {
      return;
    }

    if (
      !values.serialNumber?.trim() ||
      !values.brand?.trim() ||
      !values.model?.trim() ||
      !values.color?.trim() ||
      !values.type?.trim() ||
      values.year == null
    ) {
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

      const baseResult =
        mode === 'edit'
          ? await updateMutation.mutateAsync(payload)
          : await createMutation.mutateAsync(payload);

      const result =
        photoFile && 'id' in baseResult
          ? await uploadPhotoMutation.mutateAsync({
              assetId: baseResult.id,
              file: photoFile,
            })
          : baseResult;

      messageApi.success(
        mode === 'edit'
          ? t('hr.assetMessages.updated')
          : t('hr.assetMessages.created'),
      );
      setPhotoFile(null);
      onSuccess(result);
    } catch (error: unknown) {
      const message =
        mode === 'edit'
          ? t('hr.assetMessages.failedToUpdate')
          : t('hr.assetMessages.failedToCreate');
      notifyApiError(error, message, messageApi);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const reviewValues = detailsSnapshot.serialNumber
    ? detailsSnapshot
    : (formValues ?? detailsSnapshot);

  const steps = useMemo(
    () => [
      {
        title: t('hr.assetSection.assetDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.assetSection.assetDetails')}
            description={t('pages.hr.companyAsset.detailsStepDescription')}
          >
            <div className="erp-form-grid-2">
              <Form.Item
                name="serialNumber"
                label={t('hr.assetLabels.serialNumber')}
                rules={[
                  {
                    required: true,
                    message: t('hr.assetValidation.serialNumberRequired'),
                  },
                ]}
              >
                <Input
                  maxLength={100}
                  placeholder={t('hr.assetPlaceholder.serialNumber')}
                />
              </Form.Item>
              <Form.Item
                name="type"
                label={t('hr.assetLabels.type')}
                rules={[
                  {
                    required: true,
                    message: t('hr.assetValidation.typeRequired'),
                  },
                ]}
              >
                <Input
                  maxLength={100}
                  placeholder={t('hr.assetPlaceholder.type')}
                />
              </Form.Item>
              <Form.Item
                name="brand"
                label={t('hr.assetLabels.brand')}
                rules={[
                  {
                    required: true,
                    message: t('hr.assetValidation.brandRequired'),
                  },
                ]}
              >
                <Input
                  maxLength={100}
                  placeholder={t('hr.assetPlaceholder.brand')}
                />
              </Form.Item>
              <Form.Item
                name="model"
                label={t('hr.assetLabels.model')}
                rules={[
                  {
                    required: true,
                    message: t('hr.assetValidation.modelRequired'),
                  },
                ]}
              >
                <Input
                  maxLength={100}
                  placeholder={t('hr.assetPlaceholder.model')}
                />
              </Form.Item>
              <Form.Item
                name="year"
                label={t('hr.assetLabels.year')}
                rules={[
                  {
                    required: true,
                    message: t('hr.assetValidation.yearRequired'),
                  },
                ]}
              >
                <InputNumber
                  min={1900}
                  max={2100}
                  className="w-full"
                  placeholder={t('hr.assetPlaceholder.year')}
                />
              </Form.Item>
              <Form.Item
                name="color"
                label={t('hr.assetLabels.color')}
                rules={[
                  {
                    required: true,
                    message: t('hr.assetValidation.colorRequired'),
                  },
                ]}
              >
                <Input
                  maxLength={50}
                  placeholder={t('hr.assetPlaceholder.color')}
                />
              </Form.Item>
            </div>

            <Form.Item
              name="description"
              label={t('hr.assetLabels.description')}
            >
              <Input.TextArea
                rows={3}
                maxLength={2000}
                showCount
                placeholder={t('hr.assetPlaceholder.description')}
              />
            </Form.Item>
          </FormLayout>
        ),
      },
      {
        title: t('hr.assetLabels.photo'),
        validate: () => validatePhotoStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.assetLabels.photo')}
            description={t('pages.hr.companyAsset.photoStepDescription')}
          >
            <Typography.Paragraph
              type="secondary"
              style={{ marginBottom: 12, fontSize: 13 }}
            >
              {t('hr.assetMessages.photoOptionalHint')}
            </Typography.Paragraph>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              disabled={submitting || uploadPhotoMutation.isPending}
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setPhotoFile(file);
                event.target.value = '';
              }}
            />

            <Button
              type="default"
              icon={<Paperclip size={14} />}
              disabled={submitting || uploadPhotoMutation.isPending}
              onClick={() => fileInputRef.current?.click()}
              style={{ borderRadius: 0, marginBottom: 12 }}
            >
              {t('hr.assetButtons.uploadPhoto')}
            </Button>

            {photoFile ? (
              <div
                className="flex items-center gap-3 rounded-none border px-3 py-3"
                style={{
                  borderColor: tokens.colorBorder,
                  background: tokens.colorCardBg,
                }}
              >
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center"
                  style={{
                    background: '#F5F3FF',
                    color: '#7C3AED',
                    border: '1px solid #7C3AED33',
                  }}
                >
                  <ImageIcon size={22} strokeWidth={1.75} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="m-0 truncate text-sm font-medium"
                    style={{ color: tokens.colorTextPrimary }}
                    title={photoFile.name}
                  >
                    {photoFile.name}
                  </p>
                  <p
                    className="m-0 mt-0.5 text-xs"
                    style={{ color: tokens.colorTextTertiary }}
                  >
                    IMAGE · {(photoFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
                <Button
                  type="text"
                  danger
                  icon={<X size={14} />}
                  aria-label={t('hr.labels.remove')}
                  disabled={submitting}
                  onClick={() => setPhotoFile(null)}
                  style={{ borderRadius: 0 }}
                />
              </div>
            ) : (
              <Typography.Text type="secondary" style={{ fontSize: 13 }}>
                {t('hr.empty.noAttachments')}
              </Typography.Text>
            )}
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.reviewSubmit')}
            description={t('pages.hr.companyAsset.reviewStepDescription')}
          >
            <div className="erp-form-grid-2">
              <ReviewItem
                label={t('hr.assetLabels.serialNumber')}
                value={reviewValues.serialNumber?.trim() || '—'}
              />
              <ReviewItem
                label={t('hr.assetLabels.type')}
                value={reviewValues.type?.trim() || '—'}
              />
              <ReviewItem
                label={t('hr.assetLabels.brand')}
                value={reviewValues.brand?.trim() || '—'}
              />
              <ReviewItem
                label={t('hr.assetLabels.model')}
                value={reviewValues.model?.trim() || '—'}
              />
              <ReviewItem
                label={t('hr.assetLabels.year')}
                value={
                  reviewValues.year != null ? String(reviewValues.year) : '—'
                }
              />
              <ReviewItem
                label={t('hr.assetLabels.color')}
                value={reviewValues.color?.trim() || '—'}
              />
              {reviewValues.description?.trim() ? (
                <ReviewItem
                  label={t('hr.assetLabels.description')}
                  value={reviewValues.description.trim()}
                />
              ) : null}
              <ReviewItem
                label={t('hr.assetLabels.photo')}
                value={photoFile?.name ?? t('hr.empty.noAttachments')}
              />
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      t,
      photoFile,
      submitting,
      uploadPhotoMutation.isPending,
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
      initialValues={
        asset
          ? undefined
          : { year: new Date().getFullYear() }
      }
    >
      {formError ? (
        <Alert
          type="error"
          showIcon
          title={formError}
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
        submitLabel={
          mode === 'edit'
            ? t('hr.assetButtons.save')
            : t('hr.assetButtons.create')
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
