import type {
  FlightApplicationDetail,
  FlightApplicationListItem,
  FlightPassenger,
} from '@/lib/api/flight.types';
import {
  buildExportFileName,
  cell,
  downloadExcelWorkbook,
  formatExportDate,
} from '@/lib/utils/excel-export';
import { formatFlightSubmitterName } from '@/lib/utils/flight-display';
import { formatUserName } from '@/lib/utils/user-display';

/**
 * Downloads flight application list rows as Excel (summary table).
 */
export async function exportFlightApplicationsExcel(input: {
  companyName: string;
  sheetName: string;
  rows: FlightApplicationListItem[];
}): Promise<void> {
  const { rows, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName('flight-applications', companyName),
    columns: [
      { header: 'applicationNumber', key: 'applicationNumber', width: 16 },
      { header: 'submitterEmail', key: 'submitterEmail', width: 28 },
      { header: 'submitterName', key: 'submitterName', width: 22 },
      { header: 'submitterId', key: 'submitterId', width: 36 },
      { header: 'tripType', key: 'tripType', width: 12 },
      { header: 'isInternational', key: 'isInternational', width: 14 },
      { header: 'originCountry', key: 'originCountry', width: 16 },
      { header: 'originCity', key: 'originCity', width: 16 },
      { header: 'destination', key: 'destination', width: 16 },
      { header: 'departureDate', key: 'departureDate', width: 14 },
      { header: 'returnDate', key: 'returnDate', width: 14 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'passengerCount', key: 'passengerCount', width: 12 },
      { header: 'createdAt', key: 'createdAt', width: 14 },
    ],
    rows: rows.map((row) => ({
      applicationNumber: cell(row.applicationNumber),
      submitterEmail: cell(row.submitter?.email),
      submitterName: formatFlightSubmitterName(row.submitter),
      submitterId: cell(row.submittedBy),
      tripType: cell(row.tripType),
      isInternational: row.isInternational ? 'TRUE' : 'FALSE',
      originCountry: cell(row.originCountry),
      originCity: cell(row.originCity),
      destination: cell(row.destination),
      departureDate: formatExportDate(row.departureDate),
      returnDate: formatExportDate(row.returnDate),
      status: cell(row.status),
      passengerCount: cell(row.passengerCount),
      createdAt: formatExportDate(row.createdAt),
    })),
  });
}

/**
 * Downloads passengers flattened from applications (import-compatible).
 */
export async function exportFlightPassengersExcel(input: {
  companyName: string;
  sheetName: string;
  filePrefix?: string;
  applications: FlightApplicationDetail[];
}): Promise<void> {
  const { applications, companyName, sheetName, filePrefix } = input;
  const flatRows: Array<Record<string, string | number>> = [];

  for (const app of applications) {
    for (const passenger of app.passengers ?? []) {
      flatRows.push(mapPassengerExportRow(app, passenger));
    }
  }

  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      filePrefix ?? 'flight-passengers',
      companyName,
    ),
    columns: [
      { header: 'submitterEmail', key: 'submitterEmail', width: 28 },
      { header: 'submitterName', key: 'submitterName', width: 22 },
      { header: 'submitterId', key: 'submitterId', width: 36 },
      { header: 'applicationNumber', key: 'applicationNumber', width: 16 },
      { header: 'status', key: 'status', width: 12 },
      { header: 'tripType', key: 'tripType', width: 12 },
      { header: 'isInternational', key: 'isInternational', width: 14 },
      { header: 'originCountry', key: 'originCountry', width: 16 },
      { header: 'originCity', key: 'originCity', width: 16 },
      { header: 'destination', key: 'destination', width: 16 },
      { header: 'departureDate', key: 'departureDate', width: 14 },
      { header: 'returnDate', key: 'returnDate', width: 14 },
      { header: 'purpose', key: 'purpose', width: 28 },
      { header: 'ticketClass', key: 'ticketClass', width: 12 },
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
 * Downloads passengers for a single flight application (app-scoped import columns).
 */
export async function exportFlightApplicationPassengersExcel(input: {
  companyName: string;
  sheetName: string;
  application: FlightApplicationDetail;
}): Promise<void> {
  const { application, companyName, sheetName } = input;
  await downloadExcelWorkbook({
    sheetName,
    fileName: buildExportFileName(
      `flight-${application.applicationNumber || application.id.slice(0, 8)}`,
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
    rows: (application.passengers ?? []).map((passenger) => ({
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
  app: FlightApplicationDetail,
  passenger: FlightPassenger,
): Record<string, string | number> {
  return {
    submitterEmail: cell(app.submitter?.email),
    submitterName: formatFlightSubmitterName(app.submitter),
    submitterId: cell(app.submittedBy),
    applicationNumber: cell(app.applicationNumber),
    status: cell(app.status),
    tripType: cell(app.tripType),
    isInternational: app.isInternational ? 'TRUE' : 'FALSE',
    originCountry: cell(app.originCountry),
    originCity: cell(app.originCity),
    destination: cell(app.destination),
    departureDate: formatExportDate(app.departureDate),
    returnDate: formatExportDate(app.returnDate),
    purpose: cell(app.purpose),
    ticketClass: cell(app.ticketClass),
    notes: cell(app.notes),
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
