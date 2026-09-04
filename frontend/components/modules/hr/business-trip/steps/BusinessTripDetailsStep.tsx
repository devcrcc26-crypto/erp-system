'use client';

import { useMemo } from 'react';
import { Col, DatePicker, Input, Radio, Row, Select } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
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
    <FormLayout
      variant="pro"
      dense
      title={t('hr.form.tripDetails')}
      description={t('pages.hr.businessTrip.tripStepDescription')}
    >
      <div className="mb-4">
        <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
          {t('hr.form.tripType')} <span className="text-[#DC2626]">*</span>
        </label>
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

      <Row gutter={[16, 0]}>
        <Col xs={24} sm={12} md={6}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.originCountry')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <Input
              value={values.originCountry}
              onChange={(e) => patch({ originCountry: e.target.value })}
              placeholder={t('hr.placeholder.enterDestination')}
              maxLength={100}
            />
          </div>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.originCity')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <Input
              value={values.originCity}
              onChange={(e) => patch({ originCity: e.target.value })}
              placeholder={t('hr.placeholder.enterDestination')}
              maxLength={100}
            />
          </div>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.destinationCountry')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <Input
              value={values.destinationCountry}
              onChange={(e) => patch({ destinationCountry: e.target.value })}
              placeholder={t('hr.placeholder.enterDestination')}
              maxLength={100}
            />
          </div>
        </Col>
        <Col xs={24} sm={12} md={6}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.destinationCity')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <Input
              value={values.destinationCity}
              onChange={(e) => patch({ destinationCity: e.target.value })}
              placeholder={t('hr.placeholder.enterDestination')}
              maxLength={100}
            />
          </div>
        </Col>
      </Row>

      <Row gutter={[16, 0]}>
        <Col xs={24} sm={values.tripType === 'ROUND_TRIP' ? 12 : 24}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.departureDate')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
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
              <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
                {t('hr.form.returnDate')}{' '}
                <span className="text-[#DC2626]">*</span>
              </label>
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

      <Row gutter={[16, 0]}>
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.kmAtDeparture')}
            </label>
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
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.kmAtReturn')}
            </label>
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
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.kmDifference')}
          </label>
          <Input
            disabled
            value={String(values.kmAtReturn - values.kmAtDeparture)}
          />
        </div>
      ) : null}

      <div className="mb-0">
        <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
          {t('hr.form.ticketClass')}{' '}
          <span className="text-[#DC2626]">*</span>
        </label>
        <Select
          className="w-full"
          options={ticketClassOptions}
          value={values.ticketClass}
          onChange={(ticketClass) => patch({ ticketClass })}
          placeholder={t('hr.form.ticketClass')}
        />
      </div>
    </FormLayout>
  );
}
