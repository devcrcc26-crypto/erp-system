'use client';

import { useMemo, useState } from 'react';
import { DatePicker, Form, Input, Select, Typography } from 'antd';
import ErpNotice from '@/components/ui/ErpNotice/ErpNotice';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import SealFilePicker, {
  SealLocalFileTiles,
} from '@/components/modules/hr/shared/SealFilePicker';
import SealRequestExtraFields from '@/components/modules/hr/shared/SealRequestExtraFields';
import {
  OnBehalfSection,
  useOnBehalf,
} from '@/components/shared/OnBehalfSelector';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { disablePastDates } from '@/lib/utils/date-validation';
import type {
  ProjectSealDetail,
  ProjectSealUrgency,
} from '@/lib/api/project-seal.types';
import { PROJECT_SEAL_FILE_ACCEPT } from '@/lib/constants/project-seal-upload';
import { useSubmitProjectSeal } from '@/lib/query/project-seal';
import { tokens } from '@/lib/theme/tokens';
import { notifyApiError } from '@/lib/utils/notify-api-error';
import {
  formatProjectSealUrgency,
  PROJECT_SEAL_URGENCY_OPTIONS,
} from '@/lib/utils/project-seal';
import { formatSealCategory, resolveSealCategory } from '@/lib/utils/seal-category';
import { formatProjectDate } from '@/lib/utils/project-display';

interface FormValues {
  fileName?: string;
  description?: string;
  urgency: ProjectSealUrgency;
  dateNeeded?: dayjs.Dayjs;
  sealCategoryPreset?: string;
  sealCategoryOther?: string;
  copyCount?: number;
}

interface ProjectSealFormProps {
  /** Leave form — shown in stepper footer beside Back. */
  onCancel?: () => void;
  cancelLabel?: string;
  onSuccess: (result: ProjectSealDetail) => void;
}

const DETAILS_FIELDS = ['fileName', 'description', 'urgency', 'dateNeeded'] as const;

/**
 * Project seal create form - same StepperForm chrome as Add Employee.
 */
export default function ProjectSealForm({
  onSuccess,
  onCancel,
  cancelLabel,
}: ProjectSealFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
  const onBehalf = useOnBehalf('PROJECT_SEAL_USAGE');
  const messageApi = useAppMessage();
  const [form] = Form.useForm<FormValues>();
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [detailsSnapshot, setDetailsSnapshot] = useState<FormValues>({
    urgency: 'MINOR',
  });

  const submitMutation = useSubmitProjectSeal();
  const formValues = Form.useWatch([], form) as FormValues | undefined;

  const urgencyOptions = useMemo(
    () =>
      PROJECT_SEAL_URGENCY_OPTIONS.map((option) => ({
        value: option.value,
        label: t(`hr.urgency.${option.value}`),
      })),
    [t],
  );

  function captureDetailsSnapshot(): FormValues {
    const values = form.getFieldsValue(true) as FormValues;
    setDetailsSnapshot(values);
    return values;
  }

  function resetForm(): void {
    onBehalf.reset();
    form.resetFields();
    form.setFieldsValue({ urgency: 'MINOR' });
    setSelectedFiles([]);
    setDetailsSnapshot({ urgency: 'MINOR' });
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

  async function validateDocumentsStep(): Promise<boolean> {
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

    if (!values.fileName?.trim() || !values.description?.trim() || !values.dateNeeded) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        ...onBehalf.payload,
        fileName: values.fileName.trim(),
        description: values.description.trim(),
        sealCategory: resolveSealCategory(
          values.sealCategoryPreset,
          values.sealCategoryOther,
        ),
        copyCount: values.copyCount,
        urgency: values.urgency,
        dateNeeded: values.dateNeeded.format('YYYY-MM-DD'),
        files: selectedFiles.length > 0 ? selectedFiles : undefined,
      });

      messageApi.success(
        result.directApproved ||
          (result.status === 'APPROVED' && !result.approvalRequestId)
          ? t('hr.messages.requestApproved')
          : t('hr.messages.requestSubmitted'),
      );
      onSuccess(result);
    } catch (error: unknown) {
      const message = t('hr.messages.failedToSubmitProjectSeal');
      notifyApiError(error, message, messageApi);
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const reviewValues = detailsSnapshot.fileName || detailsSnapshot.description
    ? detailsSnapshot
    : (formValues ?? detailsSnapshot);

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
              title={t('hr.section.requestDetails')}
              description={t('pages.hr.projectSeal.detailsStepDescription')}
            >
              <Form.Item
                name="fileName"
                label={t('hr.form.fileName')}
                rules={[
                  {
                    required: true,
                    message: t('hr.placeholder.enterProjectSealFileName'),
                  },
                ]}
              >
                <Input
                  maxLength={255}
                  showCount
                  placeholder={t('hr.placeholder.enterProjectSealFileName')}
                />
              </Form.Item>

              <Form.Item
                name="description"
                label={t('hr.form.description')}
                rules={[
                  {
                    required: true,
                    message: t('hr.placeholder.enterProjectSealDescription'),
                  },
                ]}
              >
                <Input.TextArea
                  rows={4}
                  maxLength={1000}
                  showCount
                  placeholder={t('hr.placeholder.enterProjectSealDescription')}
                />
              </Form.Item>

              <div className="erp-form-grid-2">
                <Form.Item
                  name="dateNeeded"
                  label={t('hr.labels.dateNeeded')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.placeholder.selectProjectSealDateNeeded'),
                    },
                  ]}
                >
                  <DatePicker
                    className="w-full"
                    disabledDate={disablePastDates}
                  />
                </Form.Item>
                <Form.Item
                  name="urgency"
                  label={t('hr.labels.urgency')}
                  rules={[
                    {
                      required: true,
                      message: t('hr.placeholder.selectProjectSealUrgency'),
                    },
                  ]}
                >
                  <Select options={urgencyOptions} />
                </Form.Item>
              </div>

              <SealRequestExtraFields form={form} />
            </FormLayout>
          </div>
        ),
      },
      {
        title: t('hr.section.documentToSeal'),
        validate: () => validateDocumentsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.documentToSeal')}
            description={t('pages.hr.projectSeal.documentsStepDescription')}
          >
            <Typography.Paragraph
              type="secondary"
              style={{ marginBottom: 12, fontSize: 13 }}
            >
              {t('hr.messages.documentToSealHint')}
            </Typography.Paragraph>
            <SealFilePicker
              files={selectedFiles}
              onChange={setSelectedFiles}
              accept={PROJECT_SEAL_FILE_ACCEPT}
              multiple
              disabled={submitting || submitMutation.isPending}
              placeholder={t('hr.buttons.chooseDocumentOptional')}
            />
          </FormLayout>
        ),
      },
      {
        title: t('hr.form.reviewSubmit'),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.form.reviewSubmit')}
            description={t('pages.hr.projectSeal.reviewStepDescription')}
          >
            <div className="erp-form-grid-2">
              <ReviewItem
                label={t('hr.form.fileName')}
                value={reviewValues.fileName?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.form.description')}
                value={reviewValues.description?.trim() || '-'}
              />
              <ReviewItem
                label={t('hr.labels.dateNeeded')}
                value={
                  reviewValues.dateNeeded
                    ? formatProjectDate(reviewValues.dateNeeded.toISOString())
                    : '-'
                }
              />
              <ReviewItem
                label={t('hr.labels.urgency')}
                value={formatProjectSealUrgency(
                  reviewValues.urgency ?? 'MINOR',
                  t,
                )}
              />
              <ReviewItem
                label={t('hr.form.sealCategory')}
                value={formatSealCategory(
                  resolveSealCategory(
                    reviewValues.sealCategoryPreset,
                    reviewValues.sealCategoryOther,
                  ),
                  t,
                )}
              />
              <ReviewItem
                label={t('hr.form.copyCount')}
                value={
                  reviewValues.copyCount != null
                    ? String(reviewValues.copyCount)
                    : '-'
                }
              />
            </div>
            <div className="mt-4">
              <p
                className="mb-2 text-xs font-medium uppercase tracking-wide"
                style={{ color: tokens.colorTextTertiary }}
              >
                {t('hr.section.documentToSeal')}
              </p>
              <SealLocalFileTiles
                files={selectedFiles}
                readOnly
                emptyLabel={t('hr.empty.noAttachments')}
              />
            </div>
          </FormLayout>
        ),
      },
    ],
    [
      onBehalf,
      t,
      urgencyOptions,
      selectedFiles,
      submitting,
      submitMutation.isPending,
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
      initialValues={{ urgency: 'MINOR' }}
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
