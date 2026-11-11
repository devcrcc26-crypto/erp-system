import type {
  VehicleRefuelingDetail,
  VehicleRefuelingListItem,
} from '@/lib/api/vehicle-refueling.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportEtb,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';
import { exportHrDocumentPdf } from '@/lib/utils/hr-document-pdf';

/**
 * Excel and PDF exports for vehicle refueling requests.
 *
 * A second `Fuel Details` sheet breaks the per-request fuel figures out
 * line-by-line, keyed by request number, so they can be pivoted on their own.
 */

export function buildVehicleRefuelingExportSheets(
  rows: VehicleRefuelingListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Vehicle Refueling',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Vehicle Plate Number', key: 'plateNumber', width: 20 },
        { header: 'Vehicle', key: 'vehicle', width: 24 },
        { header: 'Driver', key: 'driver', width: 22 },
        { header: 'Fuel Date', key: 'fuelDate', width: 14 },
        { header: 'Fuel Type', key: 'fuelType', width: 14 },
        { header: 'Fuel Station', key: 'fuelStation', width: 26 },
        { header: 'Current Mileage (km)', key: 'currentMileage', width: 20 },
        { header: 'Requested Litres', key: 'requestedLitres', width: 18 },
        { header: 'Unit Price (ETB)', key: 'unitPriceEtb', width: 18 },
        { header: 'Total Cost (ETB)', key: 'totalCostEtb', width: 18 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Current Tier', key: 'currentTier', width: 20 },
        { header: 'Receipt Attached', key: 'receipt', width: 16 },
        { header: 'Notes', key: 'notes', width: 36 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Completed At', key: 'completedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        plateNumber: exportCell(row.vehicle?.plateNumber),
        vehicle: row.vehicle
          ? `${row.vehicle.make} ${row.vehicle.model}`.trim()
          : '',
        driver: exportPersonName(row.driver),
        fuelDate: exportDate(row.fuelDate),
        fuelType: exportEnumLabel(row.fuelType),
        fuelStation: exportCell(row.fuelStation),
        currentMileage: exportNumber(row.currentMileage),
        requestedLitres: exportNumber(row.requestedLitres),
        unitPriceEtb: exportEtb(row.unitPriceEtb),
        totalCostEtb: exportEtb(row.totalCostEtb),
        status: exportEnumLabel(row.status),
        currentTier: row.directApproved
          ? 'Direct Approval'
          : exportCell(row.currentTierLabel),
        receipt: row.receiptDocumentId ? 'Yes' : 'No',
        notes: exportCell(row.notes),
        submittedAt: exportDateTime(row.submittedAt),
        completedAt: exportDateTime(row.completedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Fuel Details',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Fuel Date', key: 'fuelDate', width: 14 },
        { header: 'Vehicle Plate Number', key: 'plateNumber', width: 20 },
        { header: 'Detail', key: 'detail', width: 24 },
        { header: 'Value', key: 'value', width: 18 },
        { header: 'Unit', key: 'unit', width: 12 },
      ],
      rows: rows.flatMap((row) =>
        [
          {
            detail: 'Fuel Type',
            value: exportEnumLabel(row.fuelType),
            unit: '',
          },
          { detail: 'Fuel Station', value: exportCell(row.fuelStation), unit: '' },
          {
            detail: 'Current Mileage',
            value: exportNumber(row.currentMileage),
            unit: 'km',
          },
          {
            detail: 'Requested Litres',
            value: exportNumber(row.requestedLitres),
            unit: 'L',
          },
          {
            detail: 'Unit Price',
            value: exportEtb(row.unitPriceEtb),
            unit: 'ETB/L',
          },
          {
            detail: 'Total Cost',
            value: exportEtb(row.totalCostEtb),
            unit: 'ETB',
          },
        ].map((detail) => ({
          requestNumber: exportCell(row.requestNumber),
          fuelDate: exportDate(row.fuelDate),
          plateNumber: exportCell(row.vehicle?.plateNumber),
          ...detail,
        })),
      ),
    },
  ];
}

/**
 * Renders a single refueling request as a printable PDF.
 */
export async function exportVehicleRefuelingPdf(input: {
  refueling: VehicleRefuelingDetail;
  companyName?: string;
  preparedBy: string;
}): Promise<void> {
  const { refueling, companyName, preparedBy } = input;

  await exportHrDocumentPdf({
    documentTitle: 'Vehicle Refueling Request',
    subtitle: refueling.vehicle
      ? `${refueling.vehicle.plateNumber} - ${refueling.fuelStation}`
      : refueling.fuelStation,
    requestNumber: refueling.requestNumber,
    companyName,
    preparedBy,
    fileNamePrefix: 'vehicle-refueling',
    sections: [
      {
        title: 'Request',
        fields: [
          { label: 'Request Number', value: refueling.requestNumber },
          { label: 'Status', value: exportEnumLabel(refueling.status) },
          { label: 'Employee', value: exportPersonName(refueling.employee) },
          { label: 'Employee Email', value: refueling.employee?.email },
          { label: 'Driver', value: exportPersonName(refueling.driver) },
          {
            label: 'Current Tier',
            value: refueling.directApproved
              ? 'Direct Approval'
              : refueling.currentTierLabel,
          },
        ],
      },
      {
        title: 'Vehicle',
        fields: [
          {
            label: 'Vehicle',
            value: refueling.vehicle
              ? `${refueling.vehicle.plateNumber} - ${refueling.vehicle.make} ${refueling.vehicle.model}`
              : null,
          },
          { label: 'Fuel Date', value: exportDate(refueling.fuelDate) },
          { label: 'Fuel Station', value: refueling.fuelStation },
          { label: 'Notes', value: refueling.notes },
        ],
      },
      {
        title: 'Record',
        fields: [
          { label: 'Created', value: exportDateTime(refueling.createdAt) },
          { label: 'Submitted', value: exportDateTime(refueling.submittedAt) },
          { label: 'Completed', value: exportDateTime(refueling.completedAt) },
          {
            label: 'Receipt',
            value: refueling.receiptDocument?.name ?? 'Not attached',
          },
        ],
      },
    ],
    itemsTable: {
      title: 'Fuel Details',
      head: ['Detail', 'Value', 'Unit'],
      rows: [
        ['Fuel Type', exportEnumLabel(refueling.fuelType), ''],
        ['Current Mileage', exportNumber(refueling.currentMileage), 'km'],
        ['Requested Litres', exportNumber(refueling.requestedLitres), 'L'],
        ['Unit Price', exportEtb(refueling.unitPriceEtb), 'ETB/L'],
        ['Total Cost', exportEtb(refueling.totalCostEtb), 'ETB'],
      ],
      numericColumns: [1],
    },
  });
}
