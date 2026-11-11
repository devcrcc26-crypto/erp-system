import type {
  InspectionRepairDetail,
  InspectionRepairListItem,
} from '@/lib/api/inspection-repair.types';
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
 * Excel and PDF exports for inspection & repair requests.
 *
 * There are no line items, so the workbook is a single sheet; the PDF carries
 * the reported fault and the proposed solution as its detail block.
 */

export function buildInspectionRepairExportSheets(
  rows: InspectionRepairListItem[],
): HrExportSheet[] {
  return [
    {
      name: 'Inspection & Repair',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Device Name', key: 'deviceName', width: 26 },
        { header: 'Asset Serial Number', key: 'assetSerialNumber', width: 22 },
        { header: 'Make', key: 'make', width: 16 },
        { header: 'Model', key: 'model', width: 18 },
        { header: 'Year', key: 'year', width: 10 },
        { header: 'Location', key: 'location', width: 26 },
        { header: 'Inspection Type', key: 'inspectionType', width: 18 },
        { header: 'Urgency', key: 'urgency', width: 14 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Description', key: 'description', width: 44 },
        { header: 'Proposed Solution', key: 'solution', width: 40 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Completed At', key: 'completedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        deviceName: exportCell(row.deviceName),
        assetSerialNumber: exportCell(row.asset?.serialNumber),
        make: exportCell(row.make),
        model: exportCell(row.model),
        year: exportNumber(row.year),
        location: exportCell(row.location),
        inspectionType: exportEnumLabel(row.inspectionType),
        urgency: exportEnumLabel(row.urgency),
        status: exportEnumLabel(row.status),
        description: exportCell(row.description),
        solution: exportCell(row.solution),
        submittedAt: exportDateTime(row.submittedAt),
        completedAt: exportDateTime(row.completedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
  ];
}

/**
 * Renders a single inspection & repair request as a printable PDF.
 */
export async function exportInspectionRepairPdf(input: {
  request: InspectionRepairDetail;
  companyName?: string;
  preparedBy: string;
}): Promise<void> {
  const { request, companyName, preparedBy } = input;

  await exportHrDocumentPdf({
    documentTitle: 'Inspection & Repair Request',
    subtitle: request.deviceName,
    requestNumber: request.requestNumber,
    companyName,
    preparedBy,
    fileNamePrefix: 'inspection-repair',
    sections: [
      {
        title: 'Request',
        fields: [
          { label: 'Request Number', value: request.requestNumber },
          { label: 'Status', value: exportEnumLabel(request.status) },
          { label: 'Employee', value: exportPersonName(request.employee) },
          { label: 'Employee Email', value: request.employee?.email },
          {
            label: 'Inspection Type',
            value: exportEnumLabel(request.inspectionType),
          },
          { label: 'Urgency', value: exportEnumLabel(request.urgency) },
          { label: 'Location', value: request.location },
        ],
      },
      {
        title: 'Equipment',
        fields: [
          { label: 'Device Name', value: request.deviceName },
          { label: 'Asset Serial Number', value: request.asset?.serialNumber },
          { label: 'Make', value: request.make },
          { label: 'Model', value: request.model },
          { label: 'Year', value: request.year },
        ],
      },
      {
        title: 'Record',
        fields: [
          { label: 'Created', value: exportDateTime(request.createdAt) },
          { label: 'Submitted', value: exportDateTime(request.submittedAt) },
          { label: 'Completed', value: exportDateTime(request.completedAt) },
        ],
      },
    ],
    itemsTable: {
      title: 'Fault & Solution',
      head: ['Section', 'Detail'],
      rows: [
        ['Reported Fault', exportCell(request.description)],
        ['Proposed Solution', exportCell(request.solution)],
      ],
    },
  });
}
