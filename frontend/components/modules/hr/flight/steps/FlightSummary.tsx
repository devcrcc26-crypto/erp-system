'use client';

import { Card, Descriptions } from 'antd';
import { tokens } from '@/lib/theme/tokens';
import {
  formatTicketClass,
  formatTripType,
} from '@/lib/utils/flight-display';
import { formatProjectDate } from '@/lib/utils/project-display';
import type {
  FlightAdditionalValues,
  FlightPassengerValues,
  FlightTripDetailsValues,
} from './flight-stepper.types';

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
  return (
    <Card
      title="Review Your Application"
      size="small"
      styles={{
        body: { background: tokens.colorGray50 },
      }}
    >
      <Descriptions column={2} bordered size="small">
        <Descriptions.Item label="Trip Type">
          {formatTripType(tripDetails.tripType)}
        </Descriptions.Item>
        <Descriptions.Item label="International">
          {tripDetails.isInternational ? 'Yes' : 'No'}
        </Descriptions.Item>
        <Descriptions.Item label="Origin">
          {tripDetails.origin || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Destination">
          {tripDetails.destination || '—'}
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
        <Descriptions.Item label="Purpose" span={2}>
          {tripDetails.purpose || '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Ticket Class">
          {formatTicketClass(tripDetails.ticketClass)}
        </Descriptions.Item>
        <Descriptions.Item label="Passengers">
          {passengers.length > 0
            ? passengers.map((p) => p.name).join(', ')
            : '—'}
        </Descriptions.Item>
        <Descriptions.Item label="Accommodation">
          {additional.accommodationRequired ? 'Required' : 'Not Required'}
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
