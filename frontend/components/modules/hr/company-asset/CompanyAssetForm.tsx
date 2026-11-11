'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Space, Typography } from 'antd';
import type { InputNumberProps } from 'antd';
import { Paperclip, X } from 'lucide-react';
import dayjs from 'dayjs';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import ProfileFileTypeIcon, {
  profileFileMetaLine,
} from '@/components/modules/users/ProfileFileTypeIcon';
import CompanyAssetPhoto from '@/components/modules/hr/company-asset/CompanyAssetPhoto';
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
import { formatEtbAmount } from '@/lib/utils/expense-claim-display';
import { formatProjectDate } from '@/lib/utils/project-display';

interface FormValues {
  serialNumber?: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: string;
  description?: string;
  assetCode?: string;
  cardNumber?: string;
  assetName?: string;
  specifications?: string;
  assetCategory?: string;
  startUseDate?: dayjs.Dayjs | null;
  usefulLifeMonths?: number;
  originalValue?: number;
  managingDepartment?: string;
  storageLocation?: string;
  requiresGmApproval?: boolean;
}

interface CompanyAssetFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
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
] as const;

function buildLedgerPayload(values: FormValues) {
  return {
    assetCode: values.assetCode?.trim() || undefined,
    cardNumber: values.cardNumber?.trim() || undefined,
    assetName: values.assetName?.trim() || undefined,
    specifications: values.specifications?.trim() || undefined,
    assetCategory: values.assetCategory?.trim() || undefined,
    startUseDate: values.startUseDate
      ? values.startUseDate.format('YYYY-MM-DD')
      : undefined,
    usefulLifeMonths: values.usefulLifeMonths ?? undefined,
    originalValue: values.originalValue ?? undefined,
    managingDepartment: values.managingDepartment?.trim() || undefined,
    storageLocation: values.storageLocation?.trim() || undefined,
    requiresGmApproval: values.requiresGmApproval ?? false,
  };
}

function mapAssetToFormValues(asset: CompanyAssetDetail): FormValues {
  return {
    serialNumber: asset.serialNumber,
    brand: asset.brand,
    model: asset.model,
    year: asset.year,
    color: asset.color,
    type: asset.type,
    description: asset.description ?? undefined,
    assetCode: asset.assetCode ?? undefined,
    cardNumber: asset.cardNumber ?? undefined,
    assetName: asset.assetName ?? undefined,
    specifications: asset.specifications ?? undefined,
    assetCategory: asset.assetCategory ?? undefined,
    startUseDate: asset.startUseDate ? dayjs(asset.startUseDate) : undefined,
    usefulLifeMonths: asset.usefulLifeMonths ?? undefined,
    originalValue:
      asset.originalValue != null ? Number(asset.originalValue) : undefined,
    managingDepartment: asset.managingDepartment ?? undefined,
    storageLocation: asset.storageLocation ?? undefined,
    requiresGmApproval: asset.requiresGmApproval ?? false,
  };
}

/**
 * Company asset create/edit form - StepperForm chrome like Add Employee.
 */
export default function CompanyAssetForm({
  mode = 'create',
  asset,
  onSuccess,
  onCancel,
  cancelLabel,
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
      assetCode: asset.assetCode ?? undefined,
      cardNumber: asset.cardNumber ?? undefined,
      assetName: asset.assetName ?? undefined,
      specifications: asset.specifications ?? undefined,
      assetCategory: asset.assetCategory ?? undefined,
      startUseDate: asset.startUseDate ? dayjs(asset.startUseDate) : undefined,
      usefulLifeMonths: asset.usefulLifeMonths ?? undefined,
      originalValue:
        asset.originalValue != null ? Number(asset.originalValue) : undefined,
      managingDepartment: asset.managingDepartment ?? undefined,
      storageLocation: asset.storageLocation ?? undefined,
      requiresGmApproval: asset.requiresGmApproval ?? false,
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
      const values = mapAssetToFormValues(asset);
      form.setFieldsValue(values);
      setDetailsSnapshot(values);
    } else {
      form.resetFields();
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

  async function validateLedgerStep(): Promise<boolean> {
    captureDetailsSnapshot();
    return true;
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
        color: values.color?.trim() || undefined,
        type: values.type.trim(),
        description: values.description?.trim() || undefined,
        ...buildLedgerPayload(values),
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
        title: t('hr.assetSection.ledgerDetails'),
        validate: () => validateLedgerStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.assetSection.ledgerDetails')}
            description={t('pages.hr.companyAsset.ledgerStepDescription')}
          >
            <div className="erp-form-grid-2">
              <Form.Item name="assetCode" label={t('hr.assetLabels.assetCode')}>
                <Input
                  maxLength={100}
                  placeholder={t('hr.assetPlaceholder.assetCode')}
                />
              </Form.Item>
              <Form.Item
                name="specifications"
                label={t('hr.assetLabels.specifications')}
              >
                <Input
                  maxLength={500}
                  placeholder={t('hr.assetPlaceholder.specifications')}
                />
              </Form.Item>
              <Form.Item
                name="assetCategory"
                label={t('hr.assetLabels.assetCategory')}
                className="sm:col-span-2"
              >
                <Input
                  maxLength={200}
                  placeholder={t('hr.assetPlaceholder.assetCategory')}
                />
              </Form.Item>
              <Form.Item
                name="startUseDate"
                label={t('hr.assetLabels.startUseDate')}
              >
                <DatePicker className="w-full" />
              </Form.Item>
              <Form.Item
                name="usefulLifeMonths"
                label={t('hr.assetLabels.usefulLifeMonths')}
              >
                <InputNumberWithSuffix
                  min={1}
                  suffix={t('hr.assetLabels.monthsSuffix')}
                />
              </Form.Item>
              <Form.Item
                name="originalValue"
                label={t('hr.assetLabels.originalValue')}
              >
                <CurrencyInputNumber min={0} />
              </Form.Item>
              <Form.Item
                name="managingDepartment"
                label={t('hr.assetLabels.managingDepartment')}
              >
                <Input
                  maxLength={200}
                  placeholder={t('hr.assetPlaceholder.managingDepartment')}
                />
              </Form.Item>
              <Form.Item
                name="storageLocation"
                label={t('hr.assetLabels.storageLocation')}
              >
                <Input
                  maxLength={200}
                  placeholder={t('hr.assetPlaceholder.storageLocation')}
                />
              </Form.Item>
            </div>
            <Form.Item
              name="requiresGmApproval"
              valuePropName="checked"
            >
              <Checkbox>Requires GM approval when assigning this asset</Checkbox>
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
              style={{ marginBottom: 12 }}
            >
              {t('hr.assetButtons.uploadPhoto')}
            </Button>

            {photoFile ? (
              <div
                className="flex items-center gap-3 rounded-xl border px-3 py-3"
                style={{
                  borderColor: tokens.colorBorder,
                  background: tokens.colorCardBg,
                }}
              >
                <ProfileFileTypeIcon
                  name={photoFile.name}
                  fileType={photoFile.type}
                  size="md"
                />
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
                    {profileFileMetaLine(
                      photoFile.name,
                      photoFile.type,
                      photoFile.size,
                    )}
                  </p>
                </div>
                <Button
                  type="text"
                  danger
                  icon={<X size={14} />}
                  aria-label={t('hr.labels.remove')}
                  disabled={submitting}
                  onClick={() => setPhotoFile(null)}
                />
              </div>
            ) : mode === 'edit' && asset?.id && asset.photoDocumentId ? (
              <CompanyAssetPhoto
                assetId={asset.id}
                photoDocumentId={asset.photoDocumentId}
                label={asset.serialNumber}
                canEdit={false}
                variant="panel"
                size={96}
              />
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
                value={reviewValues.serialNumber?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.assetLabels.type')}
                value={reviewValues.type?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.assetLabels.brand')}
                value={reviewValues.brand?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.assetLabels.model')}
                value={reviewValues.model?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.assetLabels.year')}
                value={
                  reviewValues.year != null ? String(reviewValues.year) : '-'
                }
              />
              <ReviewItem
                label={t('hr.assetLabels.color')}
                value={reviewValues.color?.trim() || '-'}
              />
              {reviewValues.description?.trim() ? (
                <ReviewItem
                  label={t('hr.assetLabels.description')}
                  value={reviewValues.description.trim()}
                />
              ) : null}
              {reviewValues.assetCode?.trim() ? (
                <ReviewItem
                  label={t('hr.assetLabels.assetCode')}
                  value={reviewValues.assetCode.trim()}
                />
              ) : null}
              {reviewValues.assetName?.trim() ? (
                <ReviewItem
                  label={t('hr.assetLabels.assetName')}
                  value={reviewValues.assetName.trim()}
                />
              ) : null}
              {reviewValues.assetCategory?.trim() ? (
                <ReviewItem
                  label={t('hr.assetLabels.assetCategory')}
                  value={reviewValues.assetCategory.trim()}
                />
              ) : null}
              {reviewValues.startUseDate ? (
                <ReviewItem
                  label={t('hr.assetLabels.startUseDate')}
                  value={formatProjectDate(reviewValues.startUseDate.toISOString())}
                />
              ) : null}
              {reviewValues.usefulLifeMonths != null ? (
                <ReviewItem
                  label={t('hr.assetLabels.usefulLifeMonths')}
                  value={String(reviewValues.usefulLifeMonths)}
                />
              ) : null}
              {reviewValues.originalValue != null ? (
                <ReviewItem
                  label={t('hr.assetLabels.originalValue')}
                  value={formatEtbAmount(reviewValues.originalValue)}
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
        submitLabel={
          mode === 'edit'
            ? t('hr.assetButtons.save')
            : t('hr.assetButtons.create')
        }
      />
    </Form>
  );
}

function InputNumberWithSuffix({
  suffix,
  ...rest
}: InputNumberProps & { suffix: string }): React.ReactNode {
  return (
    <Space.Compact className="w-full">
      <InputNumber {...rest} className="w-full" style={{ width: '100%' }} />
      <Input
        disabled
        value={suffix}
        style={{ width: 72, textAlign: 'center' }}
      />
    </Space.Compact>
  );
}

function CurrencyInputNumber(props: InputNumberProps): React.ReactNode {
  return (
    <Space.Compact className="w-full">
      <Input
        disabled
        value="ETB"
        style={{ width: 64, textAlign: 'center' }}
      />
      <InputNumber {...props} className="w-full" style={{ width: '100%' }} />
    </Space.Compact>
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
