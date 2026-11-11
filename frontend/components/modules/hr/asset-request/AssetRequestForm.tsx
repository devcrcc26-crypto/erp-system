'use client';

import { useMemo, useState } from 'react';
import { DatePicker, Form, Input } from 'antd';
import dayjs from 'dayjs';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { OnBehalfSection, useOnBehalf } from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { AssetRequestDetail } from '@/lib/api/asset-request.types';
import { useCreateAssetRequest } from '@/lib/query/asset-request';
import { getFriendlyApiErrorMessage } from '@/lib/utils/friendly-api-error';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import { formatProjectDate } from '@/lib/utils/project-display';

interface FormValues {
  assetCategory?: string;
  assetType?: string;
  reason?: string;
  requiredByDate?: dayjs.Dayjs | null;
  notes?: string;
}

interface AssetRequestFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  /** Called with the created draft; the caller submits it for approval. */
  onSuccess: (result: AssetRequestDetail) => void;
}

const DETAILS_FIELDS = ['assetCategory', 'reason'] as const;

export default function AssetRequestForm({
  onSuccess,
  onCancel,
  cancelLabel,
}: AssetRequestFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('ASSET_REQUEST');
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useCreateAssetRequest();
  const formValues = Form.useWatch([], form) as FormValues | undefined;

  function resetForm(): void {
    onBehalf.reset();
    form.resetFields();
    setFormError(null);
  }

  async function validateDetailsStep(): Promise<boolean> {
    try {
      await form.validateFields([...DETAILS_FIELDS]);
      return true;
    } catch {
      return false;
    }
  }

  async function handleSubmit(): Promise<void> {
    setFormError(null);
    const stored = form.getFieldsValue(true) as FormValues;

    const assetCategory = stored.assetCategory?.trim();
    const reason = stored.reason?.trim();
    if (!assetCategory) {
      messageApi.error(t('hr.validation.assetCategoryRequired'));
      return;
    }
    if (!reason) {
      messageApi.error(t('hr.validation.assetRequestReasonRequired'));
      return;
    }

    setSubmitting(true);
    try {
      const result = await createMutation.mutateAsync({
        ...onBehalf.payload,
        assetCategory,
        assetType: stored.assetType?.trim() || undefined,
        reason,
        requiredByDate: stored.requiredByDate?.format('YYYY-MM-DD') ?? undefined,
        notes: stored.notes?.trim() || undefined,
      });
      onSuccess(result);
    } catch (error: unknown) {
      const fallback = t('hr.messages.assetRequestCreateFailed');
      const friendly = getFriendlyApiErrorMessage(error, fallback, t);
      notifyApiError(error, fallback, messageApi, t);
      setFormError(friendly);
    } finally {
      setSubmitting(false);
    }
  }

  const steps = useMemo(
    () => [
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <div className="flex flex-col gap-4">
            <OnBehalfSection state={onBehalf} />
            <FormLayout
              variant="pro"
              title={t('pages.hr.assetRequest.detailsTitle')}
              description={t('pages.hr.assetRequest.detailsDescription')}
            >
              <div className="erp-form-grid-2">
                <Form.Item
                  name="assetCategory"
                  label={t('pages.hr.assetRequest.assetCategory')}
                  rules={[
                    { required: true, message: t('hr.validation.assetCategoryRequired') },
                  ]}
                >
                  <Input
                    maxLength={200}
                    placeholder={t('pages.hr.assetRequest.assetCategoryPlaceholder')}
                  />
                </Form.Item>
                <Form.Item
                  name="assetType"
                  label={t('pages.hr.assetRequest.assetTypeModel')}
                >
                  <Input
                    maxLength={200}
                    placeholder={t('pages.hr.assetRequest.assetTypePlaceholder')}
                  />
                </Form.Item>
              </div>

              <Form.Item
                name="reason"
                label={t('hr.labels.reason')}
                rules={[
                  { required: true, message: t('hr.validation.assetRequestReasonRequired') },
                ]}
              >
                <Input.TextArea
                  rows={3}
                  maxLength={2000}
                  showCount
                  placeholder={t('pages.hr.assetRequest.reasonPlaceholder')}
                />
              </Form.Item>

              <div className="erp-form-grid-2">
                <Form.Item name="requiredByDate" label={t('hr.form.requiredByDate')}>
                  <DatePicker
                    className="w-full"
                    format="YYYY-MM-DD"
                    disabledDate={(d) => d.isBefore(dayjs(), 'day')}
                  />
                </Form.Item>
              </div>

              <Form.Item name="notes" label={t('hr.labels.notes')}>
                <Input.TextArea
                  rows={2}
                  maxLength={2000}
                  showCount
                  placeholder={t('hr.placeholder.enterNotes')}
                />
              </Form.Item>
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        validate: () => true,
        content: (
          <FormLayout
            variant="pro"
            title={t('pages.hr.assetRequest.reviewTitle')}
            description={t('pages.hr.assetRequest.reviewDescription')}
          >
            <div className="erp-form-grid-2">
              <ReviewItem
                label={t('pages.hr.assetRequest.assetCategory')}
                value={formValues?.assetCategory?.trim() || '-'}
              />
              <ReviewItem
                label={t('pages.hr.assetRequest.assetType')}
                value={formValues?.assetType?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.form.requiredByDate')}
                value={
                  formValues?.requiredByDate
                    ? formatProjectDate(formValues.requiredByDate.toISOString())
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.labels.reason')}
                value={formValues?.reason?.trim() || '-'}
              />
              {formValues?.notes?.trim() ? (
                <ReviewItem label={t('hr.labels.notes')} value={formValues.notes.trim()} />
              ) : null}
            </div>
          </FormLayout>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [onBehalf, formValues, t],
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
          closeLabel={t('errors.dismiss')}
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

function ReviewItem({ label, value }: { label: string; value: string }): React.ReactNode {
  return (
    <div className="min-w-0">
      <p className="erp-users-stat-label mb-0.5">{label}</p>
      <p className="erp-users-cell-strong m-0 whitespace-pre-wrap text-sm">{value}</p>
    </div>
  );
}
