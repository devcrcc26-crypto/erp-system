import type {
  FlightApplicationDetail,
  FlightApplicationListItem,
} from '@/lib/api/flight.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportBoolean,
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for flight applications, with a second sheet of the passengers
 * keyed by application number.
 */
export function buildFlightApplicationExportSheets(
  rows: FlightApplicationListItem[],
  details?: FlightApplicationDetail[],
): HrExportSheet[] {
  const detailByApplicationId = new Map(
    (details ?? []).map((detail) => [detail.id, detail] as const),
  );

  return [
    {
      name: 'Flight Applications',
      columns: [
        { header: 'Application Number', key: 'applicationNumber', width: 20 },
        { header: 'Submitted By', key: 'submitter', width: 24 },
        { header: 'Submitter Email', key: 'submitterEmail', width: 28 },
        { header: 'Trip Type', key: 'tripType', width: 14 },
        { header: 'International', key: 'isInternational', width: 14 },
        { header: 'Origin Country', key: 'originCountry', width: 18 },
        { header: 'Origin City', key: 'originCity', width: 18 },
        { header: 'Destination', key: 'destination', width: 20 },
        { header: 'Departure Date', key: 'departureDate', width: 16 },
        { header: 'Return Date', key: 'returnDate', width: 16 },
        { header: 'Passengers', key: 'passengerCount', width: 12 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        applicationNumber: exportCell(row.applicationNumber),
        submitter: exportPersonName(row.submitter),
        submitterEmail: exportCell(row.submitter?.email),
        tripType: exportEnumLabel(row.tripType),
        isInternational: exportBoolean(row.isInternational),
        originCountry: exportCell(row.originCountry),
        originCity: exportCell(row.originCity),
        destination: exportCell(row.destination),
        departureDate: exportDate(row.departureDate),
        returnDate: exportDate(row.returnDate),
        passengerCount: exportNumber(row.passengerCount),
        status: exportEnumLabel(row.status),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Passengers',
      columns: [
        { header: 'Application Number', key: 'applicationNumber', width: 20 },
        { header: 'Destination', key: 'destination', width: 20 },
        { header: 'Departure Date', key: 'departureDate', width: 16 },
        { header: 'Passenger', key: 'passenger', width: 24 },
        { header: 'Passenger Email', key: 'passengerEmail', width: 28 },
        { header: 'Passport Number', key: 'passportNumber', width: 20 },
        { header: 'Visa Required', key: 'visaRequired', width: 14 },
        { header: 'Visa Status', key: 'visaStatus', width: 16 },
      ],
      rows: rows.flatMap((row) => {
        const passengers = detailByApplicationId.get(row.id)?.passengers ?? [];
        return passengers.map((passenger) => ({
          applicationNumber: exportCell(row.applicationNumber),
          destination: exportCell(row.destination),
          departureDate: exportDate(row.departureDate),
          passenger: exportPersonName(passenger.employee),
          passengerEmail: exportCell(passenger.employee?.email),
          passportNumber: exportCell(passenger.passportNumber),
          visaRequired: exportBoolean(passenger.visaRequired),
          visaStatus: exportEnumLabel(passenger.visaStatus),
        }));
      }),
    },
  ];
}
