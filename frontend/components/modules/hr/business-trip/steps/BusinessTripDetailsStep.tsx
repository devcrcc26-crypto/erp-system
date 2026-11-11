'use client';

import { Col, DatePicker, Radio, Row } from 'antd';
import CitySelector from '@/components/modules/hr/shared/CitySelector';
import CountrySelector from '@/components/modules/hr/shared/CountrySelector';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type { BusinessTripDetailsValues } from './business-trip-stepper.types';
import {
  getDisabledDepartureDate,
  getDisabledReturnDate,
} from '@/lib/utils/date-validation';
import { roundTripReturnIssue } from '@/lib/utils/travel-trip-dates';

/**
 * Step 1 - international trip routing details.
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

  function patch(partial: Partial<BusinessTripDetailsValues>): void {
    onChange({ ...values, ...partial });
  }

  function handleDestinationCountryChange(country: string): void {
    patch({ destinationCountry: country, destinationCity: '' });
  }

  const returnIssue = roundTripReturnIssue(
    values.departureDate,
    values.returnDate,
  );

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
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.originCountry')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <CountrySelector
              value={values.originCountry}
              onChange={(country) => patch({ originCountry: country })}
              defaultCountry="Ethiopia"
              placeholder={t('hr.placeholder.selectOriginCountry')}
            />
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.originCity')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <CitySelector
              countryName={values.originCountry}
              value={values.originCity}
              onChange={(val) => patch({ originCity: val })}
              placeholder="Select or type origin city"
            />
          </div>
        </Col>
      </Row>

      <Row gutter={[16, 0]}>
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.destinationCountry')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <CountrySelector
              value={values.destinationCountry}
              onChange={(country) => handleDestinationCountryChange(country)}
              excludeCountries={['Ethiopia']}
              placeholder={t('hr.placeholder.selectDestinationCountry')}
            />
          </div>
        </Col>
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.destinationCity')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <CitySelector
              countryName={values.destinationCountry}
              value={values.destinationCity}
              onChange={(val) => patch({ destinationCity: val })}
              placeholder="Select or type city"
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
                status={returnIssue ? 'error' : undefined}
                onChange={(date) => patch({ returnDate: date })}
              />
              {returnIssue === 'beforeDeparture' ? (
                <p className="m-0 mt-1 text-xs text-[#DC2626]">
                  {t('hr.validation.returnAfterDeparture')}
                </p>
              ) : returnIssue === 'minDuration' ? (
                <p className="m-0 mt-1 text-xs text-[#DC2626]">
                  {t('hr.validation.roundTripMinDuration')}
                </p>
              ) : null}
            </div>
          </Col>
        ) : null}
      </Row>
    </FormLayout>
  );
}
