import type { CompanyVehicleListItem } from '@/lib/api/company-vehicle.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportBoolean,
  exportCell,
  exportDateTime,
  exportEnumLabel,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

/**
 * Excel export for the company vehicle register.
 *
 * Vehicles have no line items, so the workbook is a single sheet carrying the
 * list table's columns plus the reporting fields it hides (notes, whether a
 * photo is on file, the full created timestamp).
 */
export function buildCompanyVehicleExportSheets(
  rows: CompanyVehicleListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Company Vehicles',
      columns: [
        { header: 'Plate Number', key: 'plateNumber', width: 18 },
        { header: 'Vehicle Type', key: 'vehicleType', width: 16 },
        { header: 'Make', key: 'make', width: 18 },
        { header: 'Model', key: 'model', width: 20 },
        { header: 'Year', key: 'year', width: 10 },
        { header: 'Fuel Type', key: 'fuelType', width: 14 },
        { header: 'Color', key: 'color', width: 14 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Assigned Driver', key: 'assignedDriver', width: 24 },
        { header: 'Active', key: 'isActive', width: 12 },
        { header: 'Photo Attached', key: 'photo', width: 16 },
        { header: 'Notes', key: 'notes', width: 36 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        plateNumber: exportCell(row.plateNumber),
        vehicleType: exportEnumLabel(row.vehicleType),
        make: exportCell(row.make),
        model: exportCell(row.model),
        year: exportNumber(row.year),
        fuelType: exportEnumLabel(row.fuelType),
        color: exportCell(row.color),
        status: exportEnumLabel(row.status),
        assignedDriver: exportPersonName(row.assignedDriver),
        isActive: exportBoolean(row.isActive),
        photo: row.photoDocumentId ? 'Yes' : 'No',
        notes: exportCell(row.notes),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
  ];
}
