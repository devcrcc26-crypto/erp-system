'use client';

import { Col, DatePicker, Input, Radio, Row, Select, Typography } from 'antd';
import { tokens } from '@/lib/theme/tokens';
import { BUSINESS_TRIP_TICKET_CLASS_OPTIONS } from '@/lib/utils/business-trip-display';
import type { BusinessTripDetailsValues } from './business-trip-stepper.types';

/**
 * Step 1 — international trip routing details.
 */
export default function BusinessTripDetailsStep({
  values,
  onChange,
}: {
  values: BusinessTripDetailsValues;
  onChange: (next: BusinessTripDetailsValues) => void;
}): React.ReactNode {
  function patch(partial: Partial<BusinessTripDetailsValues>): void {
    onChange({ ...values, ...partial });
  }

  return (
    <div
      className="rounded-lg p-4"
      style={{
        border: `1px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
        Trip Details
      </Typography.Title>

      <div className="mb-4">
        <Typography.Text
          style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
        >
          Trip Type <span style={{ color: tokens.colorRed600 }}>*</span>
        </Typography.Text>
        <Radio.Group
          value={values.tripType}
          onChange={(e) =>
            patch({
              tripType: e.target.value,
              returnDate: e.target.value === 'ONE_WAY' ? null : values.returnDate,
            })
          }
        >
          <Radio value="ONE_WAY">One Way</Radio>
          <Radio value="ROUND_TRIP">Round Trip</Radio>
        </Radio.Group>
      </div>

      <Row gutter={16}>
        <Col xs={24} sm={6}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              Origin Country{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.originCountry}
              onChange={(e) => patch({ originCountry: e.target.value })}
              placeholder="e.g. Ethiopia"
              maxLength={100}
            />
          </div>
        </Col>
        <Col xs={24} sm={6}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              Origin City <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.originCity}
              onChange={(e) => patch({ originCity: e.target.value })}
              placeholder="e.g. Addis Ababa"
              maxLength={100}
            />
          </div>
        </Col>
        <Col xs={24} sm={6}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              Destination Country{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.destinationCountry}
              onChange={(e) => patch({ destinationCountry: e.target.value })}
              placeholder="e.g. Kenya"
              maxLength={100}
            />
          </div>
        </Col>
        <Col xs={24} sm={6}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              Destination City{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.destinationCity}
              onChange={(e) => patch({ destinationCity: e.target.value })}
              placeholder="e.g. Nairobi"
              maxLength={100}
            />
          </div>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={values.tripType === 'ROUND_TRIP' ? 12 : 24}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              Departure Date{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <DatePicker
              className="w-full"
              value={values.departureDate}
              onChange={(date) => patch({ departureDate: date })}
            />
          </div>
        </Col>
        {values.tripType === 'ROUND_TRIP' ? (
          <Col xs={24} sm={12}>
            <div className="mb-4">
              <Typography.Text
                style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
              >
                Return Date{' '}
                <span style={{ color: tokens.colorRed600 }}>*</span>
              </Typography.Text>
              <DatePicker
                className="w-full"
                value={values.returnDate}
                onChange={(date) => patch({ returnDate: date })}
              />
            </div>
          </Col>
        ) : null}
      </Row>

      <div>
        <Typography.Text
          style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
        >
          Ticket Class <span style={{ color: tokens.colorRed600 }}>*</span>
        </Typography.Text>
        <Select
          className="w-full"
          options={BUSINESS_TRIP_TICKET_CLASS_OPTIONS}
          value={values.ticketClass}
          onChange={(ticketClass) => patch({ ticketClass })}
          placeholder="Select class"
        />
      </div>
    </div>
  );
}
