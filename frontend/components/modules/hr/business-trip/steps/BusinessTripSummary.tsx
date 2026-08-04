'use client';

import { Card, Descriptions } from 'antd';
import { tokens } from '@/lib/theme/tokens';
import {
  formatEtb,
  formatTicketClass,
  formatTripType,
} from '@/lib/utils/business-trip-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import type {
  BusinessTripAdditionalValues,
  BusinessTripDetailsValues,
  BusinessTripPassengerValues,
  BusinessTripPurposeBudgetValues,
} from './business-trip-stepper.types';

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
  const totalCost =
    (Number(purposeBudget.estimatedFlightCost) || 0) +
    (Number(purposeBudget.estimatedAccommodationCost) || 0) +
    (Number(purposeBudget.estimatedPerDiem) || 0) +
    (Number(purposeBudget.estimatedOtherCost) || 0);

  return (
    <Card
      title="Review Your Business Trip Application"
      size="small"
      styles={{
        body: { background: tokens.colorGray50 },
      }}
    >
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="Trip Type">
          {formatTripType(tripDetails.tripType)}
        </Descriptions.Item>
        <Descriptions.Item label="Origin">
          {tripDetails.origin || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Destination">
          {[tripDetails.destinationCity, tripDetails.destinationCountry]
            .filter(Boolean)
            .join(', ') || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Departure">
          {tripDetails.departureDate
            ? formatProjectDate(tripDetails.departureDate.format('YYYY-MM-DD'))
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Return">
          {tripDetails.returnDate
            ? formatProjectDate(tripDetails.returnDate.format('YYYY-MM-DD'))
            : 'One Way'}
        </Descriptions.Item>
        <Descriptions.Item label="Ticket Class">
          {formatTicketClass(tripDetails.ticketClass)}
        </Descriptions.Item>
        <Descriptions.Item label="Purpose" span={2}>
          {purposeBudget.purpose || '—'}
        </Descriptions.Item>
        {purposeBudget.hostOrganization.trim() ? (
          <Descriptions.Item label="Host Organization">
            {purposeBudget.hostOrganization}
          </Descriptions.Item>
        ) : null}
        <Descriptions.Item label="Est. Flight Cost">
          {formatEtb(purposeBudget.estimatedFlightCost ?? 0)}
        </Descriptions.Item>
        <Descriptions.Item label="Est. Accommodation">
          {formatEtb(purposeBudget.estimatedAccommodationCost ?? 0)}
        </Descriptions.Item>
        <Descriptions.Item label="Est. Per Diem">
          {formatEtb(purposeBudget.estimatedPerDiem ?? 0)}
        </Descriptions.Item>
        <Descriptions.Item label="Est. Other">
          {formatEtb(purposeBudget.estimatedOtherCost ?? 0)}
        </Descriptions.Item>
        <Descriptions.Item label="Estimated Total" span={2}>
          <span className="text-lg font-bold">{formatEtb(totalCost)}</span>
        </Descriptions.Item>
        <Descriptions.Item label="Passengers" span={2}>
          {passengers.length > 0
            ? passengers.map((p) => p.name).join(', ')
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Accommodation">
          {additional.accommodationRequired
            ? additional.accommodationDetails.trim() || 'Required'
            : 'Not Required'}
        </Descriptions.Item>
        <Descriptions.Item label="Per Diem">
          {additional.perDiemRequired ? 'Required' : 'Not Required'}
        </Descriptions.Item>
        {additional.files.length > 0 ? (
          <Descriptions.Item label="Attachments" span={2}>
            {additional.files.map((f) => f.name).join(', ')}
          </Descriptions.Item>
        ) : null}
      </Descriptions>
    </Card>
  );
}
