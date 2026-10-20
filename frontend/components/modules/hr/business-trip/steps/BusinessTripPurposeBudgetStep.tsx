'use client';

import { Col, Input, InputNumber, Row } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';
import { formatEtb } from '@/lib/utils/business-trip-display';
import type { BusinessTripPurposeBudgetValues } from './business-trip-stepper.types';

/**
 * Step 2 - purpose / host fields and budget estimate.
 */
export default function BusinessTripPurposeBudgetStep({
  values,
  onChange,
}: {
  values: BusinessTripPurposeBudgetValues;
  onChange: (next: BusinessTripPurposeBudgetValues) => void;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  function patch(partial: Partial<BusinessTripPurposeBudgetValues>): void {
    onChange({ ...values, ...partial });
  }

  const estimatedTotal =
    (Number(values.estimatedAccommodationCost) || 0) +
    (Number(values.estimatedPerDiem) || 0) +
    (Number(values.estimatedOtherCost) || 0);

  return (
    <div className="flex flex-col gap-4">
      <FormLayout
        variant="pro"
        dense
        title={t('hr.labels.purpose')}
        description={t('pages.hr.businessTrip.purposeStepDescription')}
      >
        <div className="mb-4">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.purpose')} <span className="text-[#DC2626]">*</span>
          </label>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.purpose}
            onChange={(e) => patch({ purpose: e.target.value })}
            placeholder={t('hr.placeholder.enterPurpose')}
          />
        </div>

        <p className="mb-3 mt-2 text-[13px] font-semibold text-[var(--color-text-primary)]">
          {t('hr.section.hostOrganization')}
        </p>
        <div className="mb-4">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.hostOrganizationName')}
          </label>
          <Input
            value={values.hostOrganization}
            onChange={(e) => patch({ hostOrganization: e.target.value })}
            placeholder={t('hr.placeholder.hostOrganizationName')}
            maxLength={500}
          />
        </div>

        <p className="mb-3 mt-2 text-[13px] font-semibold text-[var(--color-text-primary)]">
          {t('hr.section.hostContactPerson')}
        </p>
        <Row gutter={[16, 0]}>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
                {t('hr.form.hostContactName')}
              </label>
              <Input
                value={values.hostContactName}
                onChange={(e) => patch({ hostContactName: e.target.value })}
                placeholder={t('hr.placeholder.hostContactName')}
                maxLength={200}
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
                {t('hr.form.hostContactPhone')}
              </label>
              <Input
                value={values.hostContactPhone}
                onChange={(e) => patch({ hostContactPhone: e.target.value })}
                placeholder={t('hr.placeholder.hostContactPhone')}
                maxLength={50}
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
                {t('hr.form.hostContactEmail')}
              </label>
              <Input
                type="email"
                value={values.hostContactEmail}
                onChange={(e) => patch({ hostContactEmail: e.target.value })}
                placeholder={t('hr.placeholder.hostContactEmail')}
                maxLength={320}
              />
            </div>
          </Col>
        </Row>

        <div className="mb-4">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.expectedOutcomes')}
          </label>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.expectedOutcomes}
            onChange={(e) => patch({ expectedOutcomes: e.target.value })}
            placeholder={t('hr.form.expectedOutcomes')}
          />
        </div>

        <div className="mb-0">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.itinerary')}
          </label>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.itinerary}
            onChange={(e) => patch({ itinerary: e.target.value })}
            placeholder={t('hr.form.itinerary')}
          />
        </div>
      </FormLayout>

      <FormLayout
        variant="pro"
        dense
        title={t('hr.section.budgetEstimate')}
        description={t('pages.hr.businessTrip.budgetStepDescription')}
      >
        <Row gutter={[16, 0]}>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
                {t('hr.form.estimatedAccommodationCost')}
              </label>
              <InputNumber
                className="w-full"
                min={0}
                prefix="ETB"
                placeholder="0"
                value={values.estimatedAccommodationCost ?? undefined}
                onChange={(v) =>
                  patch({
                    estimatedAccommodationCost:
                      typeof v === 'number' ? v : null,
                  })
                }
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
                {t('hr.form.estimatedPerDiem')}
              </label>
              <InputNumber
                className="w-full"
                min={0}
                prefix="ETB"
                placeholder="0"
                value={values.estimatedPerDiem ?? undefined}
                onChange={(v) =>
                  patch({
                    estimatedPerDiem: typeof v === 'number' ? v : null,
                  })
                }
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
                {t('hr.form.estimatedOtherCost')}
              </label>
              <InputNumber
                className="w-full"
                min={0}
                prefix="ETB"
                placeholder="0"
                value={values.estimatedOtherCost ?? undefined}
                onChange={(v) =>
                  patch({
                    estimatedOtherCost: typeof v === 'number' ? v : null,
                  })
                }
              />
            </div>
          </Col>
        </Row>

        <div
          className="rounded-[10px] px-4 py-3"
          style={{
            background: tokens.colorPrimaryLight,
            border: `1px solid ${tokens.colorBorder}`,
          }}
        >
          <p className="m-0 text-[13px] text-[var(--color-text-secondary)]">
            {t('hr.form.estimatedTotal')}
          </p>
          <p
            className="m-0 mt-1 text-xl font-semibold tabular-nums"
            style={{ color: tokens.colorTextPrimary }}
          >
            {formatEtb(estimatedTotal)}
          </p>
        </div>
      </FormLayout>
    </div>
  );
}
