'use client';

import { Checkbox, Input, Typography } from 'antd';
import FileUploadInput from '@/components/ui/FileUploadInput/FileUploadInput';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';
import type { BusinessTripAdditionalValues } from './business-trip-stepper.types';

/**
 * Step 4 — accommodation / notes / attachments.
 */
export default function BusinessTripAdditionalStep({
  values,
  onChange,
  disabled = false,
}: {
  values: BusinessTripAdditionalValues;
  onChange: (next: BusinessTripAdditionalValues) => void;
  disabled?: boolean;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  function patch(partial: Partial<BusinessTripAdditionalValues>): void {
    onChange({ ...values, ...partial });
  }

  return (
    <div className="flex flex-col gap-6">
      <div
        className="rounded-lg p-3 sm:p-4"
        style={{
          border: `1px solid ${tokens.colorBorder}`,
          background: tokens.colorCardBg,
        }}
      >
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
          {t('hr.form.accommodation')}
        </Typography.Title>

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
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              {t('hr.form.accommodationDetails')}
            </Typography.Text>
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

        <div className="mb-3">
          <Checkbox
            checked={values.perDiemRequired}
            onChange={(e) => patch({ perDiemRequired: e.target.checked })}
            disabled={disabled}
          >
            {t('hr.form.perDiemRequired')}
          </Checkbox>
        </div>

        <div>
          <Typography.Text
            style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
          >
            {t('hr.form.notes')}
          </Typography.Text>
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
      </div>

      <div
        className="rounded-lg p-3 sm:p-4"
        style={{
          border: `1px solid ${tokens.colorBorder}`,
          background: tokens.colorCardBg,
        }}
      >
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 8 }}>
          {t('hr.labels.supportingAttachments')}
        </Typography.Title>
        <Typography.Paragraph
          type="secondary"
          style={{ marginBottom: 12, fontSize: 13 }}
        >
          {t('hr.form.supportingDocuments')}
        </Typography.Paragraph>
        <FileUploadInput
          files={values.files}
          onChange={(files) => patch({ files })}
          accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
          multiple
          disabled={disabled}
        />
      </div>
    </div>
  );
}
