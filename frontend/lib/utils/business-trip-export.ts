import type {
  BusinessTripDetail,
  BusinessTripListItem,
} from '@/lib/api/business-trip.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportBoolean,
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportEtb,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for business trips, with a second sheet of the passengers keyed
 * by trip number.
 */
export function buildBusinessTripExportSheets(
  rows: BusinessTripListItem[],
  details?: BusinessTripDetail[],
): HrExportSheet[] {
  const detailByTripId = new Map(
    (details ?? []).map((detail) => [detail.id, detail] as const),
  );

  return [
    {
      name: 'Business Trips',
      columns: [
        { header: 'Trip Number', key: 'tripNumber', width: 18 },
        { header: 'Submitted By', key: 'submitter', width: 24 },
        { header: 'Submitter Email', key: 'submitterEmail', width: 28 },
        { header: 'Trip Type', key: 'tripType', width: 14 },
        { header: 'Origin Country', key: 'originCountry', width: 18 },
        { header: 'Origin City', key: 'originCity', width: 18 },
        { header: 'Destination Country', key: 'destinationCountry', width: 20 },
        { header: 'Destination City', key: 'destinationCity', width: 18 },
        { header: 'Departure Date', key: 'departureDate', width: 16 },
        { header: 'Return Date', key: 'returnDate', width: 16 },
        { header: 'Passengers', key: 'passengerCount', width: 12 },
        {
          header: 'Estimated Total Cost (ETB)',
          key: 'estimatedTotalCost',
          width: 26,
        },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Current Tier', key: 'currentTier', width: 20 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        tripNumber: exportCell(row.tripNumber),
        submitter: exportPersonName(row.submitter),
        submitterEmail: exportCell(row.submitter?.email),
        tripType: exportEnumLabel(row.tripType),
        originCountry: exportCell(row.originCountry),
        originCity: exportCell(row.originCity),
        destinationCountry: exportCell(row.destinationCountry),
        destinationCity: exportCell(row.destinationCity),
        departureDate: exportDate(row.departureDate),
        returnDate: exportDate(row.returnDate),
        passengerCount: exportNumber(row.passengerCount),
        estimatedTotalCost: exportEtb(row.estimatedTotalCost),
        status: exportEnumLabel(row.status),
        currentTier: exportCell(row.currentTierLabel ?? row.currentStepLabel),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Passengers',
      columns: [
        { header: 'Trip Number', key: 'tripNumber', width: 18 },
        { header: 'Destination City', key: 'destinationCity', width: 18 },
        { header: 'Departure Date', key: 'departureDate', width: 16 },
        { header: 'Passenger', key: 'passenger', width: 24 },
        { header: 'Passenger Email', key: 'passengerEmail', width: 28 },
        { header: 'Passport Number', key: 'passportNumber', width: 20 },
        { header: 'Visa Required', key: 'visaRequired', width: 14 },
        { header: 'Visa Status', key: 'visaStatus', width: 16 },
      ],
      rows: rows.flatMap((row) => {
        const passengers = detailByTripId.get(row.id)?.passengers ?? [];
        return passengers.map((passenger) => ({
          tripNumber: exportCell(row.tripNumber),
          destinationCity: exportCell(row.destinationCity),
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
