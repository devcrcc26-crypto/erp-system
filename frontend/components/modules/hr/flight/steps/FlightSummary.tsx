'use client';

import { Card, Descriptions } from 'antd';
import { tokens } from '@/lib/theme/tokens';
import { formatTicketClass, formatTripType } from '@/lib/utils/flight-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import type {
  FlightAdditionalValues,
  FlightPassengerValues,
  FlightTripDetailsValues,
} from './flight-stepper.types';
import { useEpcTranslation } from '@/hooks/use-epc-translation';

/**
 * Read-only review card shown on the final flight application step.
 */
export default function FlightSummary({
  tripDetails,
  passengers,
  additional,
}: {
  tripDetails: FlightTripDetailsValues;
  passengers: FlightPassengerValues[];
  additional: FlightAdditionalValues;
}): React.ReactNode {
  const { t } = useEpcTranslation();
  return (
    <Card
      title={t('hr.labels.reviewApplication')}
      size="small"
      styles={{
        body: { background: tokens.colorGray50 },
      }}
    >
      <Descriptions column={{ xs: 1, sm: 2 }} bordered size="small">
        <Descriptions.Item label={t('hr.labels.tripType')}>
          {formatTripType(tripDetails.tripType, t)}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.international')}>
          {tripDetails.isInternational ? t('hr.labels.yes') : t('hr.labels.no')}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.origin')}>
          {[tripDetails.originCity, tripDetails.originCountry]
            .filter(Boolean)
            .join(', ') || '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.destination')}>
          {tripDetails.destination || '—'}
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
        <Descriptions.Item label={t('hr.labels.purpose')} span={2}>
          {tripDetails.purpose || '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.ticketClass')}>
          {formatTicketClass(tripDetails.ticketClass, t)}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.passengers')}>
          {passengers.length > 0
            ? passengers.map((p) => p.name).join(', ')
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label={t('hr.labels.accommodation')}>
          {additional.accommodationRequired ? t('hr.labels.required') : t('hr.labels.notRequired')}
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
