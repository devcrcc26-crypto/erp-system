'use client';

import FormLayout from '@/components/ui/FormLayout/FormLayout';
import { tokens } from '@/lib/theme/tokens';
import {
  formatEtb,
  formatTripType,
} from '@/lib/utils/business-trip-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import { useEpcTranslation } from '@/hooks/use-epc-translation';
import type {
  BusinessTripAdditionalValues,
  BusinessTripDetailsValues,
  BusinessTripPassengerValues,
  BusinessTripPurposeBudgetValues,
} from './business-trip-stepper.types';

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
 * Read-only review section on the final business trip step.
 * Uses a simple grid (not Ant Descriptions) to avoid span/column warnings.
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
    (Number(purposeBudget.estimatedAccommodationCost) || 0) +
    (Number(purposeBudget.estimatedPerDiem) || 0) +
    (Number(purposeBudget.estimatedOtherCost) || 0);

  const origin =
    [tripDetails.originCity, tripDetails.originCountry]
      .filter(Boolean)
      .join(', ') || '-';
  const destination =
    [tripDetails.destinationCity, tripDetails.destinationCountry]
      .filter(Boolean)
      .join(', ') || '-';

  return (
    <FormLayout
      variant="pro"
      dense
      title={t('hr.labels.reviewBusinessTrip')}
      description={t('pages.hr.businessTrip.reviewStepDescription')}
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <ReviewItem
          label={t('hr.labels.tripType')}
          value={formatTripType(tripDetails.tripType, t)}
        />
        <ReviewItem label={t('hr.labels.origin')} value={origin} />
        <ReviewItem label={t('hr.labels.destination')} value={destination} />
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
        <div className="sm:col-span-2">
          <ReviewItem
            label={t('hr.labels.purpose')}
            value={purposeBudget.purpose || '-'}
          />
        </div>
        {purposeBudget.hostOrganization.trim() ? (
          <ReviewItem
            label={t('hr.form.hostOrganizationName')}
            value={purposeBudget.hostOrganization}
          />
        ) : null}
        {purposeBudget.hostContactName.trim() ? (
          <ReviewItem
            label={t('hr.form.hostContactName')}
            value={purposeBudget.hostContactName}
          />
        ) : null}
        {purposeBudget.hostContactPhone.trim() ? (
          <ReviewItem
            label={t('hr.form.hostContactPhone')}
            value={purposeBudget.hostContactPhone}
          />
        ) : null}
        {purposeBudget.hostContactEmail.trim() ? (
          <ReviewItem
            label={t('hr.form.hostContactEmail')}
            value={purposeBudget.hostContactEmail}
          />
        ) : null}
        <ReviewItem
          label={t('hr.labels.estimatedAccommodation')}
          value={formatEtb(purposeBudget.estimatedAccommodationCost ?? 0)}
        />
        <ReviewItem
          label={t('hr.labels.estimatedPerDiem')}
          value={formatEtb(purposeBudget.estimatedPerDiem ?? 0)}
        />
        <ReviewItem
          label={t('hr.labels.estimatedOther')}
          value={formatEtb(purposeBudget.estimatedOtherCost ?? 0)}
        />
        <div className="sm:col-span-2">
          <ReviewItem
            label={t('hr.labels.estimatedTotal')}
            value={formatEtb(totalCost)}
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
