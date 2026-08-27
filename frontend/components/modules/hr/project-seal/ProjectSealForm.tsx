'use client';

import { useMemo, useState } from 'react';
import { Alert, DatePicker, Form, Input, Select, Typography } from 'antd';
import dayjs from 'dayjs';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import StepperForm from '@/components/ui/StepperForm/StepperForm';
import { useAppMessage } from '@/hooks/use-app-message';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
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
import { formatProjectDate } from '@/lib/utils/project-display';

interface FormValues {
  description?: string;
  urgency: ProjectSealUrgency;
  dateNeeded?: dayjs.Dayjs;
}

interface ProjectSealFormProps {
  onSuccess: (result: ProjectSealDetail) => void;
}

const DETAILS_FIELDS = ['description', 'urgency', 'dateNeeded'] as const;

/**
 * Project seal create form — same StepperForm chrome as Add Employee.
 */
export default function ProjectSealForm({
  onSuccess,
}: ProjectSealFormProps): React.ReactNode {
  const { t } = useEpcTranslation();
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

    if (!values.description?.trim() || !values.dateNeeded) {
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitMutation.mutateAsync({
        description: values.description.trim(),
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

  const reviewValues = detailsSnapshot.description
    ? detailsSnapshot
    : (formValues ?? detailsSnapshot);

  const steps = useMemo(
    () => [
      {
        title: t('hr.section.requestDetails'),
        validate: () => validateDetailsStep(),
        content: (
          <FormLayout
            variant="pro"
            title={t('hr.section.requestDetails')}
            description={t('pages.hr.projectSeal.detailsStepDescription')}
          >
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
                <DatePicker className="w-full" />
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
          </FormLayout>
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
            <FileUploadInput
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
                label={t('hr.form.description')}
                value={reviewValues.description?.trim() || '—'}
              />
              <ReviewItem
                label={t('hr.labels.dateNeeded')}
                value={
                  reviewValues.dateNeeded
                    ? formatProjectDate(reviewValues.dateNeeded.toISOString())
                    : '—'
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
                label={t('hr.section.documentToSeal')}
                value={
                  selectedFiles.length > 0
                    ? selectedFiles.map((file) => file.name).join(', ')
                    : t('hr.empty.noAttachments')
                }
              />
            </div>
          </FormLayout>
        ),
      },
    ],
    [
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
