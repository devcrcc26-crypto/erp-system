import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { PurchaseRequestDetail } from '@/lib/api/purchase-request.types';
import { formatDisplayDateTime } from '@/lib/utils/date-format';
import {
  formatEtbAmount,
  formatPurchaseItemDescription,
  formatPurchaseRequestEmployeeName,
  formatPurchaseRequestStatus,
} from '@/lib/utils/purchase-request-display';
import { formatProjectDate } from '@/lib/utils/project-display';

const TEAL: [number, number, number] = [16, 152, 138];
const NAVY: [number, number, number] = [27, 43, 75];
const MUTED: [number, number, number] = [111, 114, 119];
const BORDER: [number, number, number] = [229, 231, 235];
const PAGE_MARGIN = 14;

export interface PurchaseRequestPdfLabels {
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
  justification: string;
  vendorName: string;
  vendorEmail: string;
  vendorPhone: string;
  requiredByDate: string;
  itemCount: string;
  estimatedTotal: string;
  submittedAt: string;
  createdAt: string;
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  lineTotal: string;
  none: string;
  page: string;
  of: string;
}

type TranslateFn = (
  key: string,
  options?: Record<string, string | number>,
) => string;

interface PurchaseRequestPdfInput {
  request: PurchaseRequestDetail;
  companyName: string;
  preparedBy: string;
  labels: PurchaseRequestPdfLabels;
  t: TranslateFn;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFillColor(...BORDER);
  doc.rect(PAGE_MARGIN, y, doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(title.toUpperCase(), PAGE_MARGIN + 2, y + 5);
  return y + 11;
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
 * Generates a purchase request detail PDF (header + line items, no approvals).
 */
export function exportPurchaseRequestPdf(input: PurchaseRequestPdfInput): void {
  const { request, companyName, preparedBy, labels, t } = input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date().toISOString();
  const employeeName = formatPurchaseRequestEmployeeName(request.employee);

  let y = PAGE_MARGIN;

  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(labels.title, PAGE_MARGIN, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(dash(request.title), PAGE_MARGIN, 21);
  doc.setFontSize(8);
  doc.text(`${request.requestNumber} · ${companyName}`, PAGE_MARGIN, 27);

  y = 40;
  doc.setTextColor(...MUTED);
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
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 55, fontStyle: 'bold' },
      1: { cellWidth: 'auto' },
    },
    head: [[labels.field, labels.value]],
    body: [
      [labels.requestNumber, request.requestNumber],
      [labels.status, formatPurchaseRequestStatus(request.status, t)],
      [labels.employee, employeeName],
      [labels.requestTitle, dash(request.title)],
      [labels.justification, dash(request.justification)],
      [labels.vendorName, dash(request.vendorName)],
      [labels.vendorEmail, dash(request.vendorEmail)],
      [labels.vendorPhone, dash(request.vendorPhone)],
      [
        labels.requiredByDate,
        request.requiredByDate
          ? formatProjectDate(request.requiredByDate)
          : '-',
      ],
      [labels.itemCount, String(request.itemCount ?? request.items.length)],
      [labels.estimatedTotal, formatEtbAmount(request.totalEstimatedEtb)],
      [
        labels.submittedAt,
        request.submittedAt ? formatProjectDate(request.submittedAt) : '-',
      ],
      [labels.createdAt, formatProjectDate(request.createdAt)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 45);
  y = drawSectionTitle(doc, labels.items, y);
  const itemRows =
    request.items.length > 0
      ? request.items.map((item) => [
          dash(item.itemName),
          dash(
            formatPurchaseItemDescription(item.description, item.modelSpec),
          ),
          String(item.quantity),
          dash(item.unit),
          formatEtbAmount(item.unitPrice),
          formatEtbAmount(item.totalPriceEtb),
        ])
      : [['-', labels.none, '-', '-', '-', '-']];
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'striped',
    headStyles: { fillColor: TEAL, fontSize: 7.5, cellPadding: 1.5 },
    bodyStyles: { fontSize: 7, cellPadding: 1.5 },
    head: [
      [
        labels.itemName,
        labels.description,
        labels.quantity,
        labels.unit,
        labels.unitPrice,
        labels.lineTotal,
      ],
    ],
    body: itemRows,
  });
  y = doc.lastAutoTable.finalY + 8;

  const documentNames = (request.documents ?? [])
    .map((docItem) => docItem.name)
    .filter(Boolean);
  if (documentNames.length > 0) {
    y = ensureSpace(doc, y, 30);
    y = drawSectionTitle(doc, labels.documents, y);
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'striped',
      headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
      bodyStyles: { fontSize: 8, cellPadding: 2 },
      head: [[labels.documents]],
      body: documentNames.map((name) => [name]),
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `${labels.footer} - ${labels.title} - ${labels.page} ${page} ${labels.of} ${pageCount}`,
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  const dateStamp = generatedAt.slice(0, 10);
  const safeNumber = request.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`purchase-request_${safeNumber}_${dateStamp}.pdf`);
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
