'use client';

import { Col, Input, InputNumber, Row, Typography } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';
import { formatEtb } from '@/lib/utils/business-trip-display';
import type { BusinessTripPurposeBudgetValues } from './business-trip-stepper.types';

/**
 * Step 2 — purpose / host fields and budget estimate.
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
    (Number(values.estimatedFlightCost) || 0) +
    (Number(values.estimatedAccommodationCost) || 0) +
    (Number(values.estimatedPerDiem) || 0) +
    (Number(values.estimatedOtherCost) || 0);

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
          {t('hr.labels.purpose')}
        </Typography.Title>

        <div className="mb-4">
          <Typography.Text
            style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
          >
            {t('hr.form.purpose')}{' '}
            <span style={{ color: tokens.colorRed600 }}>*</span>
          </Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.purpose}
            onChange={(e) => patch({ purpose: e.target.value })}
            placeholder={t('hr.placeholder.enterPurpose')}
          />
        </div>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                {t('hr.form.hostOrganization')}
              </Typography.Text>
              <Input
                value={values.hostOrganization}
                onChange={(e) => patch({ hostOrganization: e.target.value })}
                placeholder={t('hr.form.hostOrganization')}
                maxLength={200}
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                {t('hr.form.hostContact')}
              </Typography.Text>
              <Input
                value={values.hostContact}
                onChange={(e) => patch({ hostContact: e.target.value })}
                placeholder={t('hr.form.hostContact')}
                maxLength={200}
              />
            </div>
          </Col>
        </Row>

        <div className="mb-4">
          <Typography.Text
            style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
          >
            {t('hr.form.expectedOutcomes')}
          </Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.expectedOutcomes}
            onChange={(e) => patch({ expectedOutcomes: e.target.value })}
            placeholder={t('hr.form.expectedOutcomes')}
          />
        </div>

        <div>
          <Typography.Text
            style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
          >
            {t('hr.form.itinerary')}
          </Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.itinerary}
            onChange={(e) => patch({ itinerary: e.target.value })}
            placeholder={t('hr.form.itinerary')}
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
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
          {t('hr.section.budgetEstimate')}
        </Typography.Title>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                {t('hr.form.estimatedFlightCost')}
              </Typography.Text>
              <InputNumber
                className="w-full"
                min={0}
                prefix="ETB"
                placeholder="0"
                value={values.estimatedFlightCost ?? undefined}
                onChange={(v) =>
                  patch({ estimatedFlightCost: typeof v === 'number' ? v : null })
                }
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                {t('hr.form.estimatedAccommodationCost')}
              </Typography.Text>
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
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                {t('hr.form.estimatedPerDiem')}
              </Typography.Text>
              <InputNumber
                className="w-full"
                min={0}
                prefix="ETB"
                placeholder="0"
                value={values.estimatedPerDiem ?? undefined}
                onChange={(v) =>
                  patch({ estimatedPerDiem: typeof v === 'number' ? v : null })
                }
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                {t('hr.form.estimatedOtherCost')}
              </Typography.Text>
              <InputNumber
                className="w-full"
                min={0}
                prefix="ETB"
                placeholder="0"
                value={values.estimatedOtherCost ?? undefined}
                onChange={(v) =>
                  patch({ estimatedOtherCost: typeof v === 'number' ? v : null })
                }
              />
            </div>
          </Col>
        </Row>

        <div
          className="rounded-md px-4 py-3"
          style={{
            background: tokens.colorPrimaryLight,
            border: `1px solid ${tokens.colorBorder}`,
          }}
        >
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            {t('hr.form.estimatedTotal')}
          </Typography.Text>
          <Typography.Title level={4} style={{ margin: '4px 0 0' }}>
            {formatEtb(estimatedTotal)}
          </Typography.Title>
        </div>
      </div>
    </div>
  );
}
