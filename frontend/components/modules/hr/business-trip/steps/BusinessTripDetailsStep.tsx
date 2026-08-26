'use client';

import { useMemo } from 'react';
import { Col, DatePicker, Input, Radio, Row, Select, Typography } from 'antd';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { tokens } from '@/lib/theme/tokens';
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
  const { t } = useEpcTranslation();

  const ticketClassOptions = useMemo(
    () => [
      { value: 'ECONOMY' as const, label: t('hr.ticketClass.ECONOMY') },
      { value: 'BUSINESS' as const, label: t('hr.ticketClass.BUSINESS') },
    ],
    [t],
  );

  function patch(partial: Partial<BusinessTripDetailsValues>): void {
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
              returnDate: e.target.value === 'ONE_WAY' ? null : values.returnDate,
            })
          }
        >
          <Radio value="ONE_WAY">{t('hr.tripType.ONE_WAY')}</Radio>
          <Radio value="ROUND_TRIP">{t('hr.tripType.ROUND_TRIP')}</Radio>
        </Radio.Group>
      </div>

      <Row gutter={16}>
        <Col xs={24} sm={6}>
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
        <Col xs={24} sm={6}>
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
        <Col xs={24} sm={6}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              {t('hr.form.destinationCountry')}{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.destinationCountry}
              onChange={(e) => patch({ destinationCountry: e.target.value })}
              placeholder={t('hr.placeholder.enterDestination')}
              maxLength={100}
            />
          </div>
        </Col>
        <Col xs={24} sm={6}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              {t('hr.form.destinationCity')}{' '}
              <span style={{ color: tokens.colorRed600 }}>*</span>
            </Typography.Text>
            <Input
              value={values.destinationCity}
              onChange={(e) => patch({ destinationCity: e.target.value })}
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
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
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
                showTime={{ format: 'HH:mm' }}
                format="YYYY-MM-DD HH:mm"
                value={values.returnDate}
                onChange={(date) => patch({ returnDate: date })}
              />
            </div>
          </Col>
        ) : null}
      </Row>

      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              {t('hr.form.kmAtDeparture')}
            </Typography.Text>
            <Input
              type="number"
              min={0}
              value={values.kmAtDeparture ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                patch({
                  kmAtDeparture: raw === '' ? null : Number(raw),
                });
              }}
              placeholder={t('hr.placeholder.enterKmReading')}
            />
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <Typography.Text
              style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
            >
              {t('hr.form.kmAtReturn')}
            </Typography.Text>
            <Input
              type="number"
              min={0}
              value={values.kmAtReturn ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                patch({
                  kmAtReturn: raw === '' ? null : Number(raw),
                });
              }}
              placeholder={t('hr.placeholder.enterKmReading')}
            />
          </div>
        </Col>
      </Row>

      {values.kmAtDeparture != null &&
      values.kmAtReturn != null &&
      Number.isFinite(values.kmAtDeparture) &&
      Number.isFinite(values.kmAtReturn) ? (
        <div className="mb-4">
          <Typography.Text
            style={{ display: 'block', marginBottom: 8, fontSize: 13 }}
          >
            {t('hr.form.kmDifference')}
          </Typography.Text>
          <Input
            disabled
            value={String(values.kmAtReturn - values.kmAtDeparture)}
          />
        </div>
      ) : null}

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
