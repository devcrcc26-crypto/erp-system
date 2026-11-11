import type {
  ExitPermitDetail,
  ExitPermitListItem,
} from '@/lib/api/exit-permit.types';
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
import { exportHrDocumentPdf } from '@/lib/utils/hr-document-pdf';

/**
 * Excel and PDF exports for equipment & materials exit permits.
 *
 * The workbook has a permit sheet and an `Items` sheet keyed by request
 * number, matching the item-level shape the importer reads back.
 */

export function buildExitPermitExportSheets(
  rows: ExitPermitListItem[],
  details?: ExitPermitDetail[],
): HrExportSheet[] {
  const detailByPermitId = new Map(
    (details ?? []).map((detail) => [detail.id, detail] as const),
  );

  return [
    {
      name: 'Exit Permits',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Department', key: 'department', width: 22 },
        { header: 'Direction', key: 'direction', width: 14 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Items', key: 'itemCount', width: 10 },
        { header: 'Status', key: 'status', width: 14 },
        { header: 'Current Tier', key: 'currentTier', width: 20 },
        { header: 'Filed On Behalf', key: 'isOnBehalf', width: 16 },
        { header: 'Created By', key: 'createdBy', width: 24 },
        { header: 'Submitted By', key: 'submittedBy', width: 24 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Completed At', key: 'completedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        department: exportCell(row.department?.name),
        direction: exportEnumLabel(row.direction),
        date: exportDate(row.date),
        itemCount: exportNumber(row.itemCount),
        status: exportEnumLabel(row.status),
        currentTier: exportCell(row.currentTierLabel),
        isOnBehalf: exportBoolean(row.isOnBehalf),
        createdBy: exportPersonName(row.creator),
        submittedBy: exportPersonName(row.submitter),
        submittedAt: exportDateTime(row.submittedAt),
        completedAt: exportDateTime(row.completedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
    {
      name: 'Items',
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Direction', key: 'direction', width: 14 },
        { header: 'Date', key: 'date', width: 14 },
        { header: 'Item Name', key: 'itemName', width: 28 },
        { header: 'Issue', key: 'issue', width: 28 },
        { header: 'Quantity', key: 'quantity', width: 12 },
        { header: 'Unit', key: 'unit', width: 12 },
      ],
      rows: rows.flatMap((row) => {
        const items = detailByPermitId.get(row.id)?.items ?? [];
        return items.map((item) => ({
          requestNumber: exportCell(row.requestNumber),
          employee: exportPersonName(row.employee),
          direction: exportEnumLabel(row.direction),
          date: exportDate(row.date),
          itemName: exportCell(item.itemName),
          issue: exportCell(item.issue),
          quantity: exportNumber(item.quantity),
          unit: exportCell(item.unit),
        }));
      }),
    },
  ];
}

/**
 * Renders a single exit permit as a printable PDF with its items table.
 */
export async function exportExitPermitPdf(input: {
  permit: ExitPermitDetail;
  companyName?: string;
  preparedBy: string;
}): Promise<void> {
  const { permit, companyName, preparedBy } = input;

  const isApproved = permit.status === 'APPROVED';

  await exportHrDocumentPdf({
    documentTitle: isApproved
      ? 'Approved Gate Pass — Equipment & Materials'
      : 'Equipment & Materials Exit Permit',
    subtitle: `${exportEnumLabel(permit.direction)} - ${exportDate(permit.date)}`,
    requestNumber: permit.requestNumber,
    companyName,
    preparedBy,
    fileNamePrefix: 'exit-permit',
    sections: [
      {
        title: 'Permit',
        fields: [
          { label: 'Request Number', value: permit.requestNumber },
          { label: 'Status', value: exportEnumLabel(permit.status) },
          { label: 'Direction', value: exportEnumLabel(permit.direction) },
          { label: 'Date', value: exportDate(permit.date) },
          { label: 'Employee', value: exportPersonName(permit.employee) },
          { label: 'Employee Email', value: permit.employee?.email },
          { label: 'Department', value: permit.department?.name },
          { label: 'Current Tier', value: permit.currentTierLabel },
        ],
      },
      {
        title: 'Record',
        fields: [
          { label: 'Filed On Behalf', value: exportBoolean(permit.isOnBehalf) },
          { label: 'Created By', value: exportPersonName(permit.creator) },
          { label: 'Created', value: exportDateTime(permit.createdAt) },
          { label: 'Submitted By', value: exportPersonName(permit.submitter) },
          { label: 'Submitted', value: exportDateTime(permit.submittedAt) },
          { label: 'Completed', value: exportDateTime(permit.completedAt) },
        ],
      },
    ],
    itemsTable: {
      title: 'Items',
      head: ['No.', 'Item Name', 'Issue', 'Quantity', 'Unit'],
      rows: (permit.items ?? []).map((item, index) => [
        index + 1,
        exportCell(item.itemName),
        exportCell(item.issue),
        exportNumber(item.quantity),
        exportCell(item.unit),
      ]),
      numericColumns: [0, 3],
    },
    footerNote: isApproved
      ? 'Approved gate pass — post at the gate or carry with goods. Security verifies each item before passage.'
      : 'Draft or pending — not valid at the gate until approved.',
  });
}
