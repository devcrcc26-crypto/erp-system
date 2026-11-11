import type {
  BusinessTripDetail,
  BusinessTripListItem,
  BusinessTripPassenger,
} from '@/lib/api/business-trip.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatBusinessTripSubmitterName } from '@/lib/utils/business-trip-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Downloads business trip list rows as Excel (summary table).
 */
export async function exportBusinessTripsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: BusinessTripListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('business-trips', companyName),
    columns: [
      { header: 'tripNumber', key: 'tripNumber', width: 16 },
      { header: 'submitterEmail', key: 'submitterEmail', width: 28 },
      { header: 'submitterName', key: 'submitterName', width: 22 },
      { header: 'submitterId', key: 'submitterId', width: 36 },
      { header: 'tripType', key: 'tripType', width: 12 },
      { header: 'originCountry', key: 'originCountry', width: 16 },
      { header: 'originCity', key: 'originCity', width: 16 },
      { header: 'destinationCountry', key: 'destinationCountry', width: 18 },
      { header: 'destinationCity', key: 'destinationCity', width: 16 },
      { header: 'departureDate', key: 'departureDate', width: 14 },
      { header: 'returnDate', key: 'returnDate', width: 14 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'passengerCount', key: 'passengerCount', width: 12 },
      { header: 'estimatedTotalCost', key: 'estimatedTotalCost', width: 14 },
      { header: 'createdAt', key: 'createdAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      tripNumber: cell(row.tripNumber),
      submitterEmail: cell(row.submitter?.email),
      submitterName: formatBusinessTripSubmitterName(row.submitter),
      submitterId: cell(row.submittedBy),
      tripType: cell(row.tripType),
      originCountry: cell(row.originCountry),
      originCity: cell(row.originCity),
      destinationCountry: cell(row.destinationCountry),
      destinationCity: cell(row.destinationCity),
      departureDate: formatExportDate(row.departureDate),
      returnDate: formatExportDate(row.returnDate),
      status: cell(row.status),
      passengerCount: cell(row.passengerCount),
      estimatedTotalCost: cell(row.estimatedTotalCost),
      createdAt: formatExportDate(row.createdAt),
    })),
  });
}

/**
 * Downloads passengers flattened from trips (import-compatible).
 */
export async function exportBusinessTripPassengersExcel(input: {
  companyName: string;
  sheetName: string;
  filePrefix?: string;
  trips: BusinessTripDetail[];
}): Promise<void> {
  const { trips, companyName, sheetName, filePrefix } = input;
  const flatRows: Array<Record<string, string | number>> = [];

  for (const trip of trips) {
    for (const passenger of trip.passengers ?? []) {
      flatRows.push(mapPassengerExportRow(trip, passenger));
    }
  }

  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      filePrefix ?? 'business-trip-passengers',
      companyName,
    ),
    columns: [
      { header: 'submitterEmail', key: 'submitterEmail', width: 28 },
      { header: 'submitterName', key: 'submitterName', width: 22 },
      { header: 'submitterId', key: 'submitterId', width: 36 },
      { header: 'tripNumber', key: 'tripNumber', width: 16 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'tripType', key: 'tripType', width: 12 },
      { header: 'originCountry', key: 'originCountry', width: 16 },
      { header: 'originCity', key: 'originCity', width: 16 },
      { header: 'destinationCountry', key: 'destinationCountry', width: 18 },
      { header: 'destinationCity', key: 'destinationCity', width: 16 },
      { header: 'departureDate', key: 'departureDate', width: 14 },
      { header: 'returnDate', key: 'returnDate', width: 14 },
      { header: 'purpose', key: 'purpose', width: 28 },
      { header: 'hostOrganization', key: 'hostOrganization', width: 22 },
      { header: 'hostContactName', key: 'hostContactName', width: 18 },
      { header: 'hostContactPhone', key: 'hostContactPhone', width: 16 },
      { header: 'hostContactEmail', key: 'hostContactEmail', width: 22 },
      { header: 'notes', key: 'notes', width: 24 },
      { header: 'passengerEmail', key: 'passengerEmail', width: 28 },
      { header: 'passengerName', key: 'passengerName', width: 22 },
      { header: 'passengerId', key: 'passengerId', width: 36 },
      { header: 'passportNumber', key: 'passportNumber', width: 16 },
      { header: 'visaRequired', key: 'visaRequired', width: 12 },
      { header: 'visaStatus', key: 'visaStatus', width: 14 },
    ],
    rows: flatRows,
  });
}

/**
 * Downloads passengers for a single business trip (trip-scoped import columns).
 */
export async function exportBusinessTripDetailPassengersExcel(input: {
  companyName: string;
  sheetName: string;
  trip: BusinessTripDetail;
}): Promise<void> {
  const { trip, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      `business-trip-${trip.tripNumber || trip.id.slice(0, 8)}`,
      companyName,
    ),
    columns: [
      { header: 'passengerEmail', key: 'passengerEmail', width: 28 },
      { header: 'passengerName', key: 'passengerName', width: 22 },
      { header: 'passengerId', key: 'passengerId', width: 36 },
      { header: 'passportNumber', key: 'passportNumber', width: 16 },
      { header: 'visaRequired', key: 'visaRequired', width: 12 },
      { header: 'visaStatus', key: 'visaStatus', width: 14 },
    ],
    rows: (trip.passengers ?? []).map((passenger) => ({
      passengerEmail: cell(passenger.employee?.email),
      passengerName: passenger.employee
        ? formatUserName(passenger.employee)
        : '',
      passengerId: cell(passenger.employeeId),
      passportNumber: cell(passenger.passportNumber),
      visaRequired: passenger.visaRequired ? 'TRUE' : 'FALSE',
      visaStatus: cell(passenger.visaStatus),
    })),
  });
}

function mapPassengerExportRow(
  trip: BusinessTripDetail,
  passenger: BusinessTripPassenger,
): Record<string, string | number> {
  return {
    submitterEmail: cell(trip.submitter?.email),
    submitterName: formatBusinessTripSubmitterName(trip.submitter),
    submitterId: cell(trip.submittedBy),
    tripNumber: cell(trip.tripNumber),
    status: cell(trip.status),
    tripType: cell(trip.tripType),
    originCountry: cell(trip.originCountry),
    originCity: cell(trip.originCity),
    destinationCountry: cell(trip.destinationCountry),
    destinationCity: cell(trip.destinationCity),
    departureDate: formatExportDate(trip.departureDate),
    returnDate: formatExportDate(trip.returnDate),
    purpose: cell(trip.purpose),
    hostOrganization: cell(trip.hostOrganization),
    hostContactName: cell(trip.hostContactName),
    hostContactPhone: cell(trip.hostContactPhone),
    hostContactEmail: cell(trip.hostContactEmail),
    notes: cell(trip.notes),
    passengerEmail: cell(passenger.employee?.email),
    passengerName: passenger.employee
      ? formatUserName(passenger.employee)
      : '',
    passengerId: cell(passenger.employeeId),
    passportNumber: cell(passenger.passportNumber),
    visaRequired: passenger.visaRequired ? 'TRUE' : 'FALSE',
    visaStatus: cell(passenger.visaStatus),
  };
}
