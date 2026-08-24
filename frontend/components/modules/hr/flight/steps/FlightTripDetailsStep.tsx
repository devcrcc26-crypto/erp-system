'use client';

import { useMemo } from 'react';
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
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';
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
  const { t } = useEpcTranslation();

  const ticketClassOptions = useMemo(
    () => [
      { value: 'ECONOMY' as const, label: t('hr.ticketClass.ECONOMY') },
      { value: 'BUSINESS' as const, label: t('hr.ticketClass.BUSINESS') },
    ],
    [t],
  );

  function patch(partial: Partial<FlightTripDetailsValues>): void {
    onChange({ ...values, ...partial });
  }

  return (
    <div
      className="rounded-lg p-3 sm:p-4"
      style={{
        border: `1px solid ${tokens.colorBorder}`,
        background: tokens.colorCardBg,
      }}
    >
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
        {t('hr.form.tripDetails')}
      </Typography.Title>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              {t('hr.form.tripType')}{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
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
              <Radio value="ONE_WAY">{t('hr.tripType.ONE_WAY')}</Radio>
              <Radio value="ROUND_TRIP">{t('hr.tripType.ROUND_TRIP')}</Radio>
            </Radio.Group>
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div className="mb-4 flex items-center pt-7">
            <Checkbox
              checked={values.isInternational}
              onChange={(e) => patch({ isInternational: e.target.checked })}
            >
              {t('hr.form.isInternational')}
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
              {t('hr.form.originCountry')}{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.originCountry}
              onChange={(e) => patch({ originCountry: e.target.value })}
              placeholder={t('hr.placeholder.enterDestination')}
              maxLength={100}
            />
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              {t('hr.form.originCity')}{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.originCity}
              onChange={(e) => patch({ originCity: e.target.value })}
              placeholder={t('hr.placeholder.enterDestination')}
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
              {t('hr.form.destination')}{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.destination}
              onChange={(e) => patch({ destination: e.target.value })}
              placeholder={t('hr.placeholder.enterDestination')}
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
              {t('hr.form.departureDate')}{' '}
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
                {t('hr.form.returnDate')}{' '}
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

      <div>
        <Typography.Text
          style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
        >
          {t('hr.form.ticketClass')}{' '}
          <span style={{ color: tokens.colorRed600 }}>*</span>
        </Typography.Text>
        <Select
          className="w-full"
          options={ticketClassOptions}
          value={values.ticketClass}
          onChange={(ticketClass) => patch({ ticketClass })}
          placeholder={t('hr.form.ticketClass')}
        />
      </div>
    </div>
  );
}
