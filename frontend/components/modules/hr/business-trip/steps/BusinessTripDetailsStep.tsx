'use client';

import { useMemo } from 'react';
import { Col, DatePicker, Input, Radio, Row, Select } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BusinessTripDetailsValues } from './business-trip-stepper.types';
import {
  getDisabledDepartureDate,
  getDisabledReturnDate,
} from '@/lib/utils/date-validation';

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
  // HR / full access may record trips already taken; everyone else books ahead.
  const canBackdate = useCanViewHr();

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
              disabledDate={getDisabledDepartureDate(canBackdate)}
              onChange={(date) =>
                patch({
                  departureDate: date,
                  // A return that is now before the new departure is no longer valid.
                  ...(date &&
                  values.returnDate &&
                  values.returnDate.isBefore(date)
                    ? { returnDate: null }
                    : {}),
                })
              }
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
                disabledDate={getDisabledReturnDate(values.departureDate)}
                status={
                  values.departureDate &&
                  values.returnDate &&
                  values.returnDate.isBefore(values.departureDate)
                    ? 'error'
                    : undefined
                }
                onChange={(date) => patch({ returnDate: date })}
              />
            </div>
          </Col>
        ) : null}
      </Row>


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
