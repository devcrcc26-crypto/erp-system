import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDF_FONT, registerCjkFont } from '@/lib/utils/pdf-font';
import type { MaterialRequisitionDetail } from '@/lib/api/material-requisition.types';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import {
  formatMaterialRequisitionEmployeeName,
  formatMaterialRequisitionStatus,
} from '@/lib/utils/material-requisition-display';
import { formatProjectDate } from '@/lib/utils/project-display';

const PAGE_MARGIN = 14;

export interface MaterialRequisitionPdfLabels {
  title: string;
  generatedAt: string;
  preparedBy: string;
  footer: string;
  overview: string;
  items: string;
  documents: string;
  field: string;
  value: string;
  requestNumber: string;
  status: string;
  employee: string;
  requestTitle: string;
  purpose: string;
  warehouseLocation: string;
  requiredByDate: string;
  project: string;
  itemCount: string;
  submittedAt: string;
  createdAt: string;
  itemName: string;
  itemCode: string;
  description: string;
  quantity: string;
  unit: string;
  none: string;
  page: string;
  of: string;
}

type TranslateFn = (
  key: string,
  options?: Record<string, string | number>,
) => string;

interface MaterialRequisitionPdfInput {
  requisition: MaterialRequisitionDetail;
  companyName: string;
  preparedBy: string;
  labels: MaterialRequisitionPdfLabels;
  t: TranslateFn;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text(title.toUpperCase(), PAGE_MARGIN, y + 4);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN, y + 6, doc.internal.pageSize.getWidth() - PAGE_MARGIN, y + 6);
  return y + 10;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 16) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

function dash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '-';
}

/**
 * Generates a material requisition detail PDF (header + line items, no approvals).
 */
export async function exportMaterialRequisitionPdf(
  input: MaterialRequisitionPdfInput,
): Promise<void> {
  const { requisition, companyName, preparedBy, labels, t } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerCjkFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toISOString();
  const employeeName = formatMaterialRequisitionEmployeeName(
    requisition.employee,
  );
  const projectLabel = requisition.project
    ? [requisition.project.projectCode, requisition.project.name]
        .filter(Boolean)
        .join(' - ')
    : '-';

  let y = PAGE_MARGIN;

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(companyName, PAGE_MARGIN, PAGE_MARGIN);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
  doc.text(labels.title, PAGE_MARGIN, PAGE_MARGIN + 7);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, PAGE_MARGIN + 12, pageWidth - PAGE_MARGIN, PAGE_MARGIN + 12);
  y = PAGE_MARGIN + 18;

  doc.setTextColor(120, 120, 120);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(8);
  doc.text(
    `${labels.generatedAt}: ${formatDisplayDateTime(generatedAt)}`,
    PAGE_MARGIN,
    y,
  );
  doc.text(`${labels.preparedBy}: ${preparedBy}`, pageWidth / 2, y);
  y += 8;

  y = drawSectionTitle(doc, labels.overview, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    head: [[labels.field, labels.value]],
    body: [
      [labels.requestNumber, requisition.requestNumber],
      [labels.status, formatMaterialRequisitionStatus(requisition.status, t)],
      [labels.employee, employeeName],
      [labels.requestTitle, dash(requisition.title)],
      [labels.purpose, dash(requisition.purpose)],
      [labels.warehouseLocation, dash(requisition.warehouseLocation)],
      [
        labels.requiredByDate,
        requisition.requiredByDate
          ? formatProjectDate(requisition.requiredByDate)
          : '-',
      ],
      [labels.project, projectLabel],
      [labels.itemCount, String(requisition.itemCount ?? requisition.items.length)],
      [
        labels.submittedAt,
        requisition.submittedAt
          ? formatProjectDate(requisition.submittedAt)
          : '-',
      ],
      [labels.createdAt, formatProjectDate(requisition.createdAt)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 45);
  y = drawSectionTitle(doc, labels.items, y);
  const itemRows =
    requisition.items.length > 0
      ? requisition.items.map((item) => [
          dash(item.itemName),
          dash(item.itemCode),
          dash(item.description),
          String(item.quantity),
          dash(item.unit),
        ])
      : [[labels.none, '-', '-', '-', '-']];
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 7.5, textColor: [40, 40, 40], cellPadding: 2 },
    head: [
      [
        labels.itemName,
        labels.itemCode,
        labels.description,
        labels.quantity,
        labels.unit,
      ],
    ],
    body: itemRows,
  });
  y = doc.lastAutoTable.finalY + 8;

  const documentNames = (requisition.documents ?? [])
    .map((docItem) => docItem.name)
    .filter(Boolean);
  if (documentNames.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, labels.documents, y);
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'plain',
      styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
      bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
      head: [[labels.documents]],
      body: documentNames.map((name) => [name]),
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${labels.footer} - ${labels.title} - ${labels.page} ${page} ${labels.of} ${pageCount}`,
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  const dateStamp = generatedAt.slice(0, 10);
  const safeNumber = requisition.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`material-requisition_${safeNumber}_${dateStamp}.pdf`);
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
