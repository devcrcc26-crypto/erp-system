import type {
  VehicleApplicationDetail,
  VehicleApplicationListItem,
} from '@/lib/api/vehicle-application.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportDateTime,
  exportEnumLabel,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';
import { exportHrDocumentPdf } from '@/lib/utils/hr-document-pdf';

/**
 * Excel and PDF exports for vehicle applications.
 *
 * The list export carries the table's own columns plus the reporting fields
 * the table hides (purpose, notes, full timestamps), and a second sheet lists
 * the passengers of each application keyed by application number.
 */

/** Splits the stored comma/semicolon/newline-separated passenger list. */
export function splitPassengerNames(
  passengerNames: string | null | undefined,
): string[] {
  if (!passengerNames) {
    return [];
  }
  return passengerNames
    .split(/[,;\n]/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function buildVehicleApplicationExportSheets(
  rows: VehicleApplicationListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Vehicle Applications',
      columns: [
        { header: 'Application Number', key: 'applicationNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Vehicle Plate Number', key: 'plateNumber', width: 20 },
        { header: 'Vehicle', key: 'vehicle', width: 24 },
        { header: 'Drive Type', key: 'driveType', width: 16 },
        { header: 'Driver', key: 'driver', width: 22 },
        { header: 'Destination', key: 'destination', width: 28 },
        { header: 'Departure', key: 'departure', width: 18 },
        { header: 'Return', key: 'return', width: 18 },
        { header: 'Passengers', key: 'passengerCount', width: 12 },
        { header: 'Passenger Names', key: 'passengerNames', width: 36 },
        { header: 'Purpose', key: 'purpose', width: 40 },
        { header: 'Project Code', key: 'projectCode', width: 16 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Current Tier', key: 'currentTier', width: 20 },
        { header: 'Notes', key: 'notes', width: 36 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Released At', key: 'releasedAt', width: 18 },
        { header: 'Completed At', key: 'completedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        applicationNumber: exportCell(row.applicationNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        plateNumber: exportCell(row.vehicle?.plateNumber),
        vehicle: row.vehicle
          ? `${row.vehicle.make} ${row.vehicle.model}`.trim()
          : '',
        driveType: exportEnumLabel(row.driveType),
        driver: exportPersonName(row.driver),
        destination: exportCell(row.destination),
        departure: exportDateTime(row.departureDatetime),
        return: exportDateTime(row.returnDatetime),
        passengerCount: exportNumber(row.passengerCount),
        passengerNames: exportCell(row.passengerNames),
        purpose: exportCell(row.purpose),
        projectCode: exportCell(row.project?.projectCode),
        status: exportEnumLabel(row.status),
        currentTier: row.directApproved
          ? 'Direct Approval'
          : exportCell(row.currentTierLabel),
        notes: exportCell(row.notes),
        submittedAt: exportDateTime(row.submittedAt),
        releasedAt: exportDateTime(row.releasedAt),
        completedAt: exportDateTime(row.completedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Passengers',
      columns: [
        { header: 'Application Number', key: 'applicationNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Departure', key: 'departure', width: 18 },
        { header: 'Passenger No.', key: 'passengerNo', width: 14 },
        { header: 'Passenger Name', key: 'passengerName', width: 28 },
      ],
      rows: rows.flatMap((row) =>
        splitPassengerNames(row.passengerNames).map((name, index) => ({
          applicationNumber: exportCell(row.applicationNumber),
          employee: exportPersonName(row.employee),
          departure: exportDateTime(row.departureDatetime),
          passengerNo: index + 1,
          passengerName: name,
        })),
      ),
    },
  ];
}

/**
 * Renders a single vehicle application as a printable PDF.
 */
export async function exportVehicleApplicationPdf(input: {
  application: VehicleApplicationDetail;
  companyName?: string;
  preparedBy: string;
}): Promise<void> {
  const { application, companyName, preparedBy } = input;
  const passengers = splitPassengerNames(application.passengerNames);

  await exportHrDocumentPdf({
    documentTitle: 'Vehicle Application',
    subtitle: application.destination,
    requestNumber: application.applicationNumber,
    companyName,
    preparedBy,
    fileNamePrefix: 'vehicle-application',
    sections: [
      {
        title: 'Request',
        fields: [
          { label: 'Application Number', value: application.applicationNumber },
          { label: 'Status', value: exportEnumLabel(application.status) },
          { label: 'Employee', value: exportPersonName(application.employee) },
          { label: 'Employee Email', value: application.employee?.email },
          { label: 'Project', value: formatProject(application) },
          {
            label: 'Current Tier',
            value: application.directApproved
              ? 'Direct Approval'
              : application.currentTierLabel,
          },
        ],
      },
      {
        title: 'Trip',
        fields: [
          {
            label: 'Vehicle',
            value: application.vehicle
              ? `${application.vehicle.plateNumber} - ${application.vehicle.make} ${application.vehicle.model}`
              : null,
          },
          { label: 'Drive Type', value: exportEnumLabel(application.driveType) },
          { label: 'Driver', value: exportPersonName(application.driver) },
          {
            label: 'Departure',
            value: exportDateTime(application.departureDatetime),
          },
          { label: 'Return', value: exportDateTime(application.returnDatetime) },
          { label: 'Destination', value: application.destination },
          { label: 'Purpose', value: application.purpose },
          { label: 'Passenger Count', value: application.passengerCount },
          { label: 'Notes', value: application.notes },
        ],
      },
      {
        title: 'Record',
        fields: [
          { label: 'Created', value: exportDateTime(application.createdAt) },
          { label: 'Submitted', value: exportDateTime(application.submittedAt) },
          { label: 'Released', value: exportDateTime(application.releasedAt) },
          {
            label: 'Released By',
            value: exportPersonName(application.releasedByUser),
          },
          { label: 'Completed', value: exportDateTime(application.completedAt) },
        ],
      },
    ],
    itemsTable: {
      title: 'Passengers',
      head: ['No.', 'Passenger Name'],
      rows: passengers.map((name, index) => [index + 1, name]),
      numericColumns: [0],
      emptyText: 'No passengers recorded',
    },
  });
}

function formatProject(
  application: VehicleApplicationDetail,
): string | undefined {
  if (!application.project) {
    return undefined;
  }
  return [application.project.projectCode, application.project.name]
    .filter(Boolean)
    .join(' - ');
}
