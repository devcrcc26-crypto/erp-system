'use client';

import {
  Checkbox,
  Col,
  DatePicker,
  Input,
  Radio,
  Row,
  Select,
  Typography,
} from 'antd';
import { tokens } from '@/lib/theme/tokens';
import { FLIGHT_TICKET_CLASS_OPTIONS } from '@/lib/utils/flight-display';
import type { FlightTripDetailsValues } from './flight-stepper.types';

/**
 * Step 1 — trip routing and travel metadata.
 */
export default function FlightTripDetailsStep({
  values,
  onChange,
}: {
  values: FlightTripDetailsValues;
  onChange: (next: FlightTripDetailsValues) => void;
}): React.ReactNode {
  function patch(partial: Partial<FlightTripDetailsValues>): void {
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

      <Row gutter={16}>
        <Col xs={24} sm={12}>
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
                  returnDate:
                    e.target.value === 'ONE_WAY' ? null : values.returnDate,
                })
              }
            >
              <Radio value="ONE_WAY">One Way</Radio>
              <Radio value="ROUND_TRIP">Round Trip</Radio>
            </Radio.Group>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div className="mb-4 flex items-center pt-7">
            <Checkbox
              checked={values.isInternational}
              onChange={(e) => patch({ isInternational: e.target.checked })}
            >
              International flight
            </Checkbox>
          </div>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
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
        <Col xs={24} sm={12}>
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
      </Row>

      <Row gutter={16}>
        <Col xs={24}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              Destination <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.destination}
              onChange={(e) => patch({ destination: e.target.value })}
              placeholder="e.g. Riyadh (RUH)"
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

      <div>
        <Typography.Text
          style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
        >
          Ticket Class <span style={{ color: tokens.colorRed600 }}>*</span>
        </Typography.Text>
        <Select
          className="w-full"
          options={FLIGHT_TICKET_CLASS_OPTIONS}
          value={values.ticketClass}
          onChange={(ticketClass) => patch({ ticketClass })}
          placeholder="Select class"
        />
      </div>
    </div>
  );
}
