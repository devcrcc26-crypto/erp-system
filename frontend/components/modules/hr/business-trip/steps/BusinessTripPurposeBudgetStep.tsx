'use client';

import { Col, Input, InputNumber, Row, Typography } from 'antd';
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
        className="rounded-lg p-4"
        style={{
          border: `1px solid ${tokens.colorBorder}`,
          background: tokens.colorCardBg,
        }}
      >
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
          Trip Purpose
        </Typography.Title>

        <div className="mb-4">
          <Typography.Text
            style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
          >
            Purpose of Travel{' '}
            <span style={{ color: tokens.colorRed600 }}>*</span>
          </Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.purpose}
            onChange={(e) => patch({ purpose: e.target.value })}
            placeholder="Describe the business reason for travel"
          />
        </div>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                Host Organization
              </Typography.Text>
              <Input
                value={values.hostOrganization}
                onChange={(e) => patch({ hostOrganization: e.target.value })}
                placeholder="Organization hosting the visit"
                maxLength={200}
              />
            </div>
          </Col>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                Host Contact
              </Typography.Text>
              <Input
                value={values.hostContact}
                onChange={(e) => patch({ hostContact: e.target.value })}
                placeholder="Contact name / phone / email"
                maxLength={200}
              />
            </div>
          </Col>
        </Row>

        <div className="mb-4">
          <Typography.Text
            style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
          >
            Expected Outcomes
          </Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.expectedOutcomes}
            onChange={(e) => patch({ expectedOutcomes: e.target.value })}
            placeholder="What outcomes are expected from this trip?"
          />
        </div>

        <div>
          <Typography.Text
            style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
          >
            Itinerary
          </Typography.Text>
          <Input.TextArea
            rows={3}
            maxLength={2000}
            showCount
            value={values.itinerary}
            onChange={(e) => patch({ itinerary: e.target.value })}
            placeholder="Outline the planned itinerary"
          />
        </div>
      </div>

      <div
        className="rounded-lg p-4"
        style={{
          border: `1px solid ${tokens.colorBorder}`,
          background: tokens.colorCardBg,
        }}
      >
        <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
          Budget Estimate
        </Typography.Title>

        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                Estimated Flight Cost
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
                Estimated Accommodation Cost
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
                Estimated Per Diem
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
                Estimated Other Cost
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
            Estimated Total
          </Typography.Text>
          <Typography.Title level={4} style={{ margin: '4px 0 0' }}>
            {formatEtb(estimatedTotal)}
          </Typography.Title>
        </div>
      </div>
    </div>
  );
}
