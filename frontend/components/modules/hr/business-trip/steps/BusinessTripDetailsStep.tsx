'use client';

import { useMemo, useState } from 'react';
import { Col, DatePicker, Input, Radio, Row, Select } from 'antd';
import CountrySelector from '@/components/modules/hr/shared/CountrySelector';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { useCanViewHr } from '@/hooks/use-auth-capabilities';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import { PER_DIEM_DESTINATION_CATEGORIES } from '@/lib/constants/per-diem-destination-categories';
import { getPerDiemCategoryForCountry } from '@/lib/constants/world-countries';
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

  const [detectedCategory, setDetectedCategory] = useState<string | null>(
    values.destinationCountry
      ? getPerDiemCategoryForCountry(values.destinationCountry)
      : null,
  );
  const [categoryManual, setCategoryManual] = useState(false);

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

  function handleCountryChange(country: string): void {
    const category = getPerDiemCategoryForCountry(country);
    if (category) {
      setDetectedCategory(category);
      setCategoryManual(false);
      patch({
        destinationCountry: country,
        destinationCity: '',
        perDiemCategory: category,
      });
      return;
    }
    setDetectedCategory(null);
    setCategoryManual(true);
    patch({
      destinationCountry: country,
      destinationCity: '',
      perDiemCategory: undefined,
    });
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
        <Col xs={24} sm={12}>
          <div className="mb-4">
            <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
              {t('hr.form.originCountry')}{' '}
              <span className="text-[#DC2626]">*</span>
            </label>
            <CountrySelector
              value={values.originCountry}
              onChange={(val) => patch({ originCountry: val })}
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
            <Input
              value={values.originCity}
              onChange={(e) => patch({ originCity: e.target.value })}
              placeholder="e.g. Addis Ababa"
              maxLength={100}
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
              onChange={handleCountryChange}
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
            <Input
              value={values.destinationCity}
              onChange={(e) => patch({ destinationCity: e.target.value })}
              placeholder="e.g. Kampala, Dubai, Berlin"
              maxLength={100}
            />
          </div>
        </Col>
      </Row>

      {detectedCategory && !categoryManual ? (
        <div
          className="erp-notice erp-notice--success mb-4"
          style={{ padding: '8px 12px' }}
        >
          <span className="text-xs">
            {t('hr.messages.perDiemCategoryAutoDetected', {
              category: detectedCategory,
            })}{' '}
            <button
              type="button"
              onClick={() => setCategoryManual(true)}
              className="ml-2 cursor-pointer border-0 bg-transparent p-0 text-[11px] text-[var(--color-teal-600,#0D9488)] underline"
            >
              {t('hr.buttons.changeManually')}
            </button>
          </span>
        </div>
      ) : (
        <div className="mb-4">
          <label className="mb-2 block text-[13px] text-[var(--color-text-primary)]">
            {t('hr.form.perDiemCategory')}
            {categoryManual ? (
              <span className="ml-1.5 text-[11px] text-[var(--color-amber-500,#F59E0B)]">
                {t('hr.labels.manualSelection')}
              </span>
            ) : null}
          </label>
          <Select
            value={values.perDiemCategory}
            onChange={(val) => patch({ perDiemCategory: val })}
            placeholder={t('hr.placeholder.selectDestinationCategory')}
            className="w-full"
            options={PER_DIEM_DESTINATION_CATEGORIES.map((category) => ({
              value: category,
              label: category,
            }))}
          />
          {detectedCategory && categoryManual ? (
            <button
              type="button"
              onClick={() => {
                setCategoryManual(false);
                patch({ perDiemCategory: detectedCategory });
              }}
              className="mt-1 cursor-pointer border-0 bg-transparent p-0 text-[11px] text-[var(--color-teal-600,#0D9488)] underline"
            >
              {t('hr.buttons.resetToAutoDetected', {
                category: detectedCategory,
              })}
            </button>
          ) : null}
        </div>
      )}

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
