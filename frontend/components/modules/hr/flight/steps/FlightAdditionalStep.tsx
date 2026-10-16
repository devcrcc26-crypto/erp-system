'use client';

import { Checkbox, Input } from 'antd';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { FlightAdditionalValues } from './flight-stepper.types';

/**
 * Step 3 - accommodation / per diem / notes / attachments.
 */
export default function FlightAdditionalStep({
  values,
  onChange,
  disabled = false,
}: {
  values: FlightAdditionalValues;
  onChange: (next: FlightAdditionalValues) => void;
  disabled?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  function patch(partial: Partial<FlightAdditionalValues>): void {
    onChange({ ...values, ...partial });
  }

  return (
    <div className="flex flex-col gap-4">
      <FormLayout
        variant="pro"
        dense
        title={t('hr.section.additionalOptions')}
        description={t('pages.hr.flight.additionalStepDescription')}
      >
        <div className="mb-3">
          <Checkbox
            checked={values.accommodationRequired}
            onChange={(e) =>
              patch({ accommodationRequired: e.target.checked })
            }
            disabled={disabled}
          >
            {t('hr.form.accommodation')}
          </Checkbox>
        </div>

        {values.accommodationRequired ? (
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.accommodationDetails')}
            </label>
            <Input.TextArea
              rows={3}
              maxLength={1000}
              showCount
              value={values.accommodationDetails}
              onChange={(e) => patch({ accommodationDetails: e.target.value })}
              placeholder={t('hr.form.accommodationDetails')}
              disabled={disabled}
            />
          </div>
        ) : null}

        <div className="mb-4">
          <Checkbox
            checked={values.perDiemRequired}
            onChange={(e) => patch({ perDiemRequired: e.target.checked })}
            disabled={disabled}
          >
            {t('hr.form.perDiemRequired')}
          </Checkbox>
        </div>

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
    </div>
  );
}
