import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  ExitPermitDetail,
  ExitPermitDirection,
} from '@/lib/api/exit-permit.types';
import { HR_PDF_COMPANY_NAME } from '@/lib/utils/hr-document-pdf';
import {
  exportCell,
  exportDate,
  exportEnumLabel,
  exportNumber,
  exportPersonName,
} from '@/lib/utils/hr-export-excel';

const TEAL: [number, number, number] = [16, 152, 138];
const NAVY: [number, number, number] = [27, 43, 75];
const MUTED: [number, number, number] = [111, 114, 119];
const PAGE_MARGIN = 10;

export type ExitPermitGateRegisterDirection = ExitPermitDirection | 'ALL';

export interface ExitPermitGateRegisterPdfLabels {
  documentTitle: string;
  subtitleForDirection: (directionLabel: string, dateLabel: string) => string;
  generatedAt: string;
  preparedBy: string;
  approvedOnly: string;
  permitCount: (count: number) => string;
  sectionEntrance: string;
  sectionExit: string;
  noPermits: string;
  gateVerified: string;
  footer: string;
  page: string;
  of: string;
}

const DEFAULT_LABELS: ExitPermitGateRegisterPdfLabels = {
  documentTitle: 'Gate Pass Register',
  subtitleForDirection: (directionLabel, dateLabel) =>
    `Approved ${directionLabel} permits — ${dateLabel}`,
  generatedAt: 'Generated',
  preparedBy: 'Prepared by',
  approvedOnly: 'Approved permits only',
  permitCount: (count) => `${count} permit(s)`,
  sectionEntrance: 'Entrance',
  sectionExit: 'Exit',
  noPermits: 'No approved permits for this date and direction.',
  gateVerified: 'Verified',
  footer:
    'Post at the gate. Security checks each line item against physical goods before signing.',
  page: 'Page',
  of: 'of',
};

export interface ExitPermitGateRegisterPdfInput {
  permitDate: string;
  direction: ExitPermitGateRegisterDirection;
  permits: ExitPermitDetail[];
  companyName?: string;
  preparedBy: string;
  directionLabels?: Record<ExitPermitDirection, string>;
  labels?: Partial<ExitPermitGateRegisterPdfLabels>;
}

/**
 * Printable gate register: all approved permits for one date, grouped by direction.
 */
export function exportExitPermitGateRegisterPdf(
  input: ExitPermitGateRegisterPdfInput,
): void {
  const labels = { ...DEFAULT_LABELS, ...input.labels };
  const companyName = input.companyName?.trim() || HR_PDF_COMPANY_NAME;
  const directionLabels = input.directionLabels ?? {
    ENTRANCE: 'Entrance',
    EXIT: 'Exit',
  };
  const generatedAt = new Date();
  const dateLabel = exportDate(input.permitDate);

  const directionLabel =
    input.direction === 'ALL'
      ? `${directionLabels.ENTRANCE} & ${directionLabels.EXIT}`
      : directionLabels[input.direction];

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageWidth, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(companyName, PAGE_MARGIN, 11);
  doc.setFontSize(16);
  doc.text(labels.documentTitle, PAGE_MARGIN, 20);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(
    labels.subtitleForDirection(directionLabel, dateLabel),
    PAGE_MARGIN,
    26,
  );

  let y = 34;
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(
    `${labels.generatedAt}: ${formatTimestamp(generatedAt)}`,
    PAGE_MARGIN,
    y,
  );
  doc.text(
    `${labels.preparedBy}: ${input.preparedBy || '—'}`,
    pageWidth / 2 - 20,
    y,
  );
  doc.text(labels.approvedOnly, pageWidth - PAGE_MARGIN, y, { align: 'right' });
  y += 6;

  const sorted = [...input.permits].sort((a, b) =>
    a.requestNumber.localeCompare(b.requestNumber),
  );

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(9);
  doc.text(labels.permitCount(sorted.length), PAGE_MARGIN, y);
  y += 6;

  const sections: Array<{
    key: ExitPermitDirection;
    title: string;
    permits: ExitPermitDetail[];
  }> =
    input.direction === 'ALL'
      ? [
          {
            key: 'ENTRANCE',
            title: directionLabels.ENTRANCE,
            permits: sorted.filter((p) => p.direction === 'ENTRANCE'),
          },
          {
            key: 'EXIT',
            title: directionLabels.EXIT,
            permits: sorted.filter((p) => p.direction === 'EXIT'),
          },
        ]
      : [
          {
            key: input.direction,
            title: directionLabels[input.direction],
            permits: sorted,
          },
        ];

  const tableHead = [
    'Request #',
    'Employee',
    'Department',
    'Item',
    'Issue',
    'Qty',
    'Unit',
    labels.gateVerified,
  ];

  let anyRows = false;

  for (const section of sections) {
    if (input.direction === 'ALL') {
      y = ensureSpace(doc, y, 18, pageHeight);
      doc.setFillColor(229, 231, 235);
      doc.rect(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN * 2, 7, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...NAVY);
      const sectionTitle =
        section.key === 'ENTRANCE'
          ? labels.sectionEntrance
          : labels.sectionExit;
      doc.text(
        `${sectionTitle.toUpperCase()} (${section.permits.length})`,
        PAGE_MARGIN + 2,
        y + 5,
      );
      y += 10;
    }

    const bodyRows = section.permits.flatMap((permit) => {
      const items = permit.items ?? [];
      if (items.length === 0) {
        return [
          [
            permit.requestNumber,
            exportPersonName(permit.employee),
            exportCell(permit.department?.name),
            '—',
            '—',
            '—',
            '—',
            '',
          ],
        ];
      }
      return items.map((item, index) => [
        index === 0 ? permit.requestNumber : '',
        index === 0 ? exportPersonName(permit.employee) : '',
        index === 0 ? exportCell(permit.department?.name) : '',
        exportCell(item.itemName),
        exportCell(item.issue),
        exportNumber(item.quantity),
        exportCell(item.unit),
        '',
      ]);
    });

    if (bodyRows.length === 0) {
      if (input.direction !== 'ALL') {
        y = ensureSpace(doc, y, 20, pageHeight);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        doc.text(labels.noPermits, PAGE_MARGIN, y);
        y += 8;
      }
      continue;
    }

    anyRows = true;
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'striped',
      headStyles: { fillColor: TEAL, fontSize: 7.5, cellPadding: 1.5 },
      bodyStyles: { fontSize: 7.5, cellPadding: 1.5, valign: 'top' },
      columnStyles: {
        0: { cellWidth: 24 },
        1: { cellWidth: 32 },
        2: { cellWidth: 28 },
        3: { cellWidth: 38 },
        4: { cellWidth: 32 },
        5: { cellWidth: 12, halign: 'right' },
        6: { cellWidth: 14 },
        7: { cellWidth: 18, halign: 'center' },
      },
      head: [tableHead],
      body: bodyRows,
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (!anyRows) {
    y = ensureSpace(doc, y, 20, pageHeight);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(labels.noPermits, PAGE_MARGIN, y);
  }

  y = ensureSpace(doc, y, 14, pageHeight);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(
    doc.splitTextToSize(labels.footer, pageWidth - PAGE_MARGIN * 2) as string[],
    PAGE_MARGIN,
    y,
  );

  const docTitleShort = labels.documentTitle;
  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(
      `${HR_PDF_COMPANY_NAME} — ${docTitleShort} — ${dateLabel}`,
      PAGE_MARGIN,
      pageHeight - 6,
    );
    doc.text(
      `${labels.page} ${page} ${labels.of} ${pageCount}`,
      pageWidth - PAGE_MARGIN,
      pageHeight - 6,
      { align: 'right' },
    );
  }

  const dirSlug =
    input.direction === 'ALL' ? 'all' : input.direction.toLowerCase();
  const dateStamp = input.permitDate.slice(0, 10);
  doc.save(`exit-permit-gate-register_${dirSlug}_${dateStamp}.pdf`);
}

/** Approved permits on a calendar date, optionally filtered by direction. */
export function filterExitPermitsForGateRegister(
  permits: ExitPermitDetail[],
  permitDate: string,
  direction: ExitPermitGateRegisterDirection,
): ExitPermitDetail[] {
  const dateKey = permitDate.slice(0, 10);
  return permits.filter((permit) => {
    if (permit.status !== 'APPROVED') {
      return false;
    }
    const rowDate = (permit.date ?? '').slice(0, 10);
    if (rowDate !== dateKey) {
      return false;
    }
    if (direction !== 'ALL' && permit.direction !== direction) {
      return false;
    }
    return true;
  });
}

function ensureSpace(
  doc: jsPDF,
  y: number,
  needed: number,
  pageHeight: number,
): number {
  if (y + needed > pageHeight - 14) {
    doc.addPage();
    return PAGE_MARGIN + 4;
  }
  return y;
}

function formatTimestamp(date: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
