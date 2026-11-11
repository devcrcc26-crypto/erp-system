'use client';

import { Input } from 'antd';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BusinessTripAdditionalValues } from './business-trip-stepper.types';

/**
 * Step 4 - accommodation / notes / attachments.
 */
export default function BusinessTripAdditionalStep({
  values,
  onChange,
  disabled = false,
  hideAttachments = false,
}: {
  values: BusinessTripAdditionalValues;
  onChange: (next: BusinessTripAdditionalValues) => void;
  disabled?: boolean;
  /** Edit mode: attachments are added from the request page, not the form. */
  hideAttachments?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  function patch(partial: Partial<BusinessTripAdditionalValues>): void {
    onChange({ ...values, ...partial });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormLayout
        variant="pro"
        dense
        title={t('hr.section.additionalOptions')}
        description={t('pages.hr.businessTrip.additionalStepDescription')}
      >
        <div className="mb-0">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.notes')}
          </label>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder={t('hr.placeholder.enterNotes')}
            disabled={disabled}
          />
        </div>
      </FormLayout>

      {hideAttachments ? null : (
        <FormLayout
          variant="pro"
          dense
          title={t('hr.labels.supportingAttachments')}
          description={t('hr.form.supportingDocuments')}
        >
          <FileUploadInput
            files={values.files}
            onChange={(files) => patch({ files })}
            accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
            multiple
            disabled={disabled}
          />
        </FormLayout>
      )}
    </div>
  );
}
