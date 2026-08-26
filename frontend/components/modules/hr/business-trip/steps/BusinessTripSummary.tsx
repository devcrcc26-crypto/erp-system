'use client';

import { Card, Descriptions } from 'antd';
import { tokens } from '@/lib/theme/tokens';
import {
  formatEtb,
  formatTicketClass,
  formatTripType,
} from '@/lib/utils/business-trip-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import type {
  BusinessTripAdditionalValues,
  BusinessTripDetailsValues,
  BusinessTripPassengerValues,
  BusinessTripPurposeBudgetValues,
} from './business-trip-stepper.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Read-only review card for the final business trip step.
 */
export default function BusinessTripSummary({
  tripDetails,
  purposeBudget,
  passengers,
  additional,
}: {
  tripDetails: BusinessTripDetailsValues;
  purposeBudget: BusinessTripPurposeBudgetValues;
  passengers: BusinessTripPassengerValues[];
  additional: BusinessTripAdditionalValues;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  const totalCost =
    (Number(purposeBudget.estimatedFlightCost) || 0) +
    (Number(purposeBudget.estimatedAccommodationCost) || 0) +
    (Number(purposeBudget.estimatedPerDiem) || 0) +
    (Number(purposeBudget.estimatedOtherCost) || 0);

  return (
    <Card
      title={t('hr.labels.reviewBusinessTrip')}
      size="small"
      styles={{
        body: { background: tokens.colorGray50 },
      }}
    >
      <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
        <Descriptions.Item label={t('hr.labels.tripType')}>
          {formatTripType(tripDetails.tripType, t)}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.origin')}>
          {[tripDetails.originCity, tripDetails.originCountry]
            .filter(Boolean)
            .join(', ') || '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.destination')}>
          {[tripDetails.destinationCity, tripDetails.destinationCountry]
            .filter(Boolean)
            .join(', ') || '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.departure')}>
          {tripDetails.departureDate
            ? formatDisplayDateTime(tripDetails.departureDate.toISOString())
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.return')}>
          {tripDetails.returnDate
            ? formatDisplayDateTime(tripDetails.returnDate.toISOString())
            : t('hr.tripType.ONE_WAY')}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.form.kmAtDeparture')}>
          {tripDetails.kmAtDeparture != null
            ? String(tripDetails.kmAtDeparture)
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.form.kmAtReturn')}>
          {tripDetails.kmAtReturn != null
            ? String(tripDetails.kmAtReturn)
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.form.kmDifference')}>
          {tripDetails.kmAtDeparture != null &&
          tripDetails.kmAtReturn != null
            ? String(tripDetails.kmAtReturn - tripDetails.kmAtDeparture)
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.ticketClass')}>
          {formatTicketClass(tripDetails.ticketClass, t)}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.purpose')} span={2}>
          {purposeBudget.purpose || '—'}
        </Descriptions.Item>
        {purposeBudget.hostOrganization.trim() ? (
          <Descriptions.Item label={t('hr.labels.host')} span={2}>
            {purposeBudget.hostOrganization}
          </Descriptions.Item>
        ) : null}
        <Descriptions.Item label={t('hr.labels.estimatedFlight')}>
          {formatEtb(purposeBudget.estimatedFlightCost ?? 0)}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.estimatedAccommodation')}>
          {formatEtb(purposeBudget.estimatedAccommodationCost ?? 0)}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.estimatedPerDiem')}>
          {formatEtb(purposeBudget.estimatedPerDiem ?? 0)}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.estimatedOther')}>
          {formatEtb(purposeBudget.estimatedOtherCost ?? 0)}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.estimatedTotal')} span={2}>
          <span className="text-lg font-bold">{formatEtb(totalCost)}</span>
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.passengers')} span={2}>
          {passengers.length > 0
            ? passengers.map((p) => p.name).join(', ')
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.accommodation')}>
          {additional.accommodationRequired
            ? additional.accommodationDetails.trim() || t('hr.labels.required')
            : t('hr.labels.notRequired')}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.perDiem')}>
          {additional.perDiemRequired ? t('hr.labels.required') : t('hr.labels.notRequired')}
        </Descriptions.Item>
        {additional.files.length > 0 ? (
          <Descriptions.Item label={t('hr.section.attachments')} span={2}>
            {additional.files.map((f) => f.name).join(', ')}
          </Descriptions.Item>
        ) : null}
      </Descriptions>
    </Card>
  );
}
