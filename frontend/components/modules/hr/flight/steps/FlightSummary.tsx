'use client';

import { Tag } from 'antd';
import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { tokens } from '@/lib/theme/tokens';
import { formatTicketClass, formatTripType } from '@/lib/utils/flight-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  FlightAdditionalValues,
  FlightPassengerValues,
  FlightTripDetailsValues,
} from './flight-stepper.types';

function ReviewItem({
  label,
  value,
}: {
  label: string;
  value: string;
}): React.ReactNode {
  return (
    <div className="min-w-0">
      <p
        className="mb-0.5 text-xs font-medium uppercase tracking-wide"
        style={{ color: tokens.colorTextTertiary }}
      >
        {label}
      </p>
      <p
        className="m-0 whitespace-pre-wrap break-words text-sm"
        style={{ color: tokens.colorTextPrimary }}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * Read-only review section on the final flight application step.
 * Uses a simple grid (not Ant Descriptions) to avoid span/column warnings.
 */
export default function FlightSummary({
  tripDetails,
  passengers,
  additional,
  linkedBusinessTripLabel,
  linkedSiteAssignmentLabel,
}: {
  tripDetails: FlightTripDetailsValues;
  passengers: FlightPassengerValues[];
  additional: FlightAdditionalValues;
  linkedBusinessTripLabel?: string;
  linkedSiteAssignmentLabel?: string;
}): React.ReactNode {
  const { t } = useEpcTranslation();

  const destinationCity =
    tripDetails.destinationCity?.trim() || tripDetails.destination.trim();
  const routeLabel = tripDetails.isInternational
    ? `${tripDetails.originCity}, ${tripDetails.originCountry} → ${destinationCity}${
        tripDetails.destinationCountry
          ? `, ${tripDetails.destinationCountry}`
          : ''
      }`
    : `${tripDetails.originCity} → ${destinationCity} (Ethiopia)`;

  return (
    <FormLayout
      variant="pro"
      dense
      title={t('hr.labels.reviewApplication')}
      description={t('pages.hr.flight.reviewStepDescription')}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {tripDetails.isInternational ? (
          <Tag color="blue" style={{ margin: 0 }}>
            {t('hr.labels.international')}
          </Tag>
        ) : (
          <Tag style={{ margin: 0 }}>{t('hr.labels.domestic')}</Tag>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReviewItem
          label={t('hr.labels.tripType')}
          value={formatTripType(tripDetails.tripType, t)}
        />
        <ReviewItem
          label={t('hr.labels.international')}
          value={
            tripDetails.isInternational ? t('hr.labels.yes') : t('hr.labels.no')
          }
        />
        <div className="sm:col-span-2">
          <ReviewItem label={t('hr.labels.route')} value={routeLabel || '-'} />
        </div>
        <ReviewItem
          label={t('hr.labels.departure')}
          value={
            tripDetails.departureDate
              ? formatDisplayDateTime(tripDetails.departureDate.toISOString())
              : '-'
          }
        />
        <ReviewItem
          label={t('hr.labels.return')}
          value={
            tripDetails.returnDate
              ? formatDisplayDateTime(tripDetails.returnDate.toISOString())
              : t('hr.tripType.ONE_WAY')
          }
        />
        <ReviewItem
          label={t('hr.labels.ticketClass')}
          value={formatTicketClass(tripDetails.ticketClass, t)}
        />
        <div className="sm:col-span-2">
          <ReviewItem
            label={t('hr.labels.purpose')}
            value={tripDetails.purpose || '-'}
          />
        </div>
        <div className="sm:col-span-2">
          <ReviewItem
            label={t('hr.labels.passengers')}
            value={
              passengers.length > 0
                ? passengers.map((p) => p.name).join(', ')
                : '-'
            }
          />
        </div>
        {additional.linkedBusinessTripId && linkedBusinessTripLabel ? (
          <div className="sm:col-span-2">
            <ReviewItem
              label={t('hr.labels.businessTrip')}
              value={linkedBusinessTripLabel}
            />
          </div>
        ) : null}
        {additional.siteAssignmentId && linkedSiteAssignmentLabel ? (
          <div className="sm:col-span-2">
            <ReviewItem
              label={t('hr.form.linkedSiteAssignment')}
              value={linkedSiteAssignmentLabel}
            />
          </div>
        ) : null}
        {additional.notes.trim() ? (
          <div className="sm:col-span-2">
            <ReviewItem
              label={t('hr.labels.notes')}
              value={additional.notes.trim()}
            />
          </div>
        ) : null}
        {additional.files.length > 0 ? (
          <div className="sm:col-span-2">
            <ReviewItem
              label={t('hr.section.attachments')}
              value={additional.files.map((f) => f.name).join(', ')}
            />
          </div>
        ) : null}
      </div>
    </FormLayout>
  );
}
