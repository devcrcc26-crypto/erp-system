import type {
  OfficialSealDetail,
  OfficialSealListItem,
} from '@/lib/api/official-seal.types';
import type {
  ProjectSealDetail,
  ProjectSealListItem,
} from '@/lib/api/project-seal.types';
import type { HrExportSheet } from '@/lib/utils/hr-export-excel';
import {
  exportCell,
  exportDate,
  exportDateTime,
  exportEnumLabel,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';
import { exportHrDocumentPdf } from '@/lib/utils/hr-document-pdf';

/**
 * Excel and PDF exports for the two seal-usage modules.
 *
 * Official and project seal requests carry identical fields, so both share one
 * builder that is given the wording for the module it is exporting.
 */

type SealListItem = OfficialSealListItem | ProjectSealListItem;
type SealDetail = OfficialSealDetail | ProjectSealDetail;

export type SealExportKind = 'official' | 'project';

const SHEET_NAME: Record<SealExportKind, string> = {
  official: 'Official Seal Usage',
  project: 'Project Seal Usage',
};

const DOCUMENT_TITLE: Record<SealExportKind, string> = {
  official: 'Official Seal Usage Request',
  project: 'Project Seal Usage Request',
};

export function buildSealExportSheets(
  kind: SealExportKind,
  rows: SealListItem[],
): HrExportSheet[] {
  return [
    {
      name: SHEET_NAME[kind],
      columns: [
        { header: 'Request Number', key: 'requestNumber', width: 18 },
        { header: 'Employee', key: 'employee', width: 24 },
        { header: 'Employee Email', key: 'employeeEmail', width: 28 },
        { header: 'Document Name', key: 'fileName', width: 34 },
        { header: 'Seal Category', key: 'sealCategory', width: 20 },
        { header: 'Copy Count', key: 'copyCount', width: 12 },
        { header: 'Urgency', key: 'urgency', width: 14 },
        { header: 'Date Needed', key: 'dateNeeded', width: 16 },
        { header: 'Status', key: 'status', width: 16 },
        { header: 'Current Tier', key: 'currentTier', width: 20 },
        { header: 'Description', key: 'description', width: 44 },
        { header: 'Issued At', key: 'issuedAt', width: 18 },
        { header: 'Sealed Document Attached', key: 'sealedDocument', width: 22 },
        { header: 'Submitted At', key: 'submittedAt', width: 18 },
        { header: 'Completed At', key: 'completedAt', width: 18 },
        { header: 'Created At', key: 'createdAt', width: 18 },
      ],
      rows: rows.map((row) => ({
        requestNumber: exportCell(row.requestNumber),
        employee: exportPersonName(row.employee),
        employeeEmail: exportCell(row.employee?.email),
        fileName: exportCell(row.fileName),
        sealCategory: exportCell(row.sealCategory),
        copyCount: exportNumber(row.copyCount),
        urgency: exportEnumLabel(row.urgency),
        dateNeeded: exportDate(row.dateNeeded),
        status: exportEnumLabel(row.status),
        currentTier: row.directApproved
          ? 'Direct Approval'
          : exportCell(row.currentTierLabel),
        description: exportCell(row.description),
        issuedAt: exportDateTime(row.issuedAt),
        sealedDocument: row.sealedDocumentId ? 'Yes' : 'No',
        submittedAt: exportDateTime(row.submittedAt),
        completedAt: exportDateTime(row.completedAt),
        createdAt: exportDateTime(row.createdAt),
      })),
    },
  ];
}

/**
 * Renders a single seal usage request as a printable PDF.
 */
export async function exportSealPdf(input: {
  kind: SealExportKind;
  seal: SealDetail;
  companyName?: string;
  preparedBy: string;
}): Promise<void> {
  const { kind, seal, companyName, preparedBy } = input;

  await exportHrDocumentPdf({
    documentTitle: DOCUMENT_TITLE[kind],
    subtitle: seal.fileName,
    requestNumber: seal.requestNumber,
    companyName,
    preparedBy,
    fileNamePrefix: kind === 'official' ? 'official-seal' : 'project-seal',
    sections: [
      {
        title: 'Request',
        fields: [
          { label: 'Request Number', value: seal.requestNumber },
          { label: 'Status', value: exportEnumLabel(seal.status) },
          { label: 'Employee', value: exportPersonName(seal.employee) },
          { label: 'Employee Email', value: seal.employee?.email },
          { label: 'Urgency', value: exportEnumLabel(seal.urgency) },
          { label: 'Date Needed', value: exportDate(seal.dateNeeded) },
          {
            label: 'Current Tier',
            value: seal.directApproved
              ? 'Direct Approval'
              : seal.currentTierLabel,
          },
        ],
      },
      {
        title: 'Document',
        fields: [
          { label: 'Document Name', value: seal.fileName },
          { label: 'Seal Category', value: seal.sealCategory },
          { label: 'Copy Count', value: seal.copyCount },
          { label: 'Description', value: seal.description },
        ],
      },
      {
        title: 'Issuance',
        fields: [
          { label: 'Issued By', value: exportPersonName(seal.issuer) },
          { label: 'Issued At', value: exportDateTime(seal.issuedAt) },
          {
            label: 'Sealed Document',
            value: seal.sealedDocument?.name ?? 'Not attached',
          },
          { label: 'Created', value: exportDateTime(seal.createdAt) },
          { label: 'Submitted', value: exportDateTime(seal.submittedAt) },
          { label: 'Completed', value: exportDateTime(seal.completedAt) },
        ],
      },
    ],
    itemsTable: {
      title: 'Attachments',
      head: ['No.', 'File Name', 'Type'],
      rows: (seal.documents ?? []).map((document, index) => [
        index + 1,
        exportCell(document.name),
        exportCell(document.fileType),
      ]),
      numericColumns: [0],
      emptyText: 'No attachments',
    },
  });
}
