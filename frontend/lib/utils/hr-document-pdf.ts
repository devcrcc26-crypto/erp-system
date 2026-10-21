import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDF_FONT, registerCjkFont } from '@/lib/utils/pdf-font';

/**
 * Shared PDF layout builder for HR single-record exports.
 *
 * Produces a formal internal document: company name header, a request metadata
 * strip, one or more label/value sections, an optional items table, and a page
 * footer. Every HR detail page's PDF export is one call to `exportHrDocumentPdf`
 * with its own fields.
 */

export const HR_PDF_COMPANY_NAME = 'CRCC International Consulting';

const PAGE_MARGIN = 14;
const EM_DASH = '-';

export interface HrPdfField {
  label: string;
  value: string | number | null | undefined;
  /** Renders the value across both columns - for long free text. */
  wide?: boolean;
}

export interface HrPdfSection {
  title: string;
  fields: HrPdfField[];
}

export interface HrPdfItemsTable {
  title: string;
  head: string[];
  rows: Array<Array<string | number>>;
  /** Column indexes to right-align (quantities, money). */
  numericColumns?: number[];
  emptyText?: string;
}

export interface HrPdfInput {
  /** Document title in the header, e.g. `Vehicle Application`. */
  documentTitle: string;
  /** Second line of the header - the record's own subject. */
  subtitle?: string | null;
  /** Request or application number shown in the header and file name. */
  requestNumber: string;
  /** Falls back to CRCC International Consulting when not supplied. */
  companyName?: string;
  preparedBy: string;
  sections: HrPdfSection[];
  itemsTable?: HrPdfItemsTable;
  /** Extra note printed under the last section, e.g. a signature line. */
  footerNote?: string;
  /** File name prefix; the request number and date are appended. */
  fileNamePrefix: string;
  labels?: Partial<HrPdfLabels>;
}

export interface HrPdfLabels {
  generatedAt: string;
  preparedBy: string;
  field: string;
  value: string;
  page: string;
  of: string;
  none: string;
}

const DEFAULT_LABELS: HrPdfLabels = {
  generatedAt: 'Generated',
  preparedBy: 'Prepared by',
  field: 'Field',
  value: 'Value',
  page: 'Page',
  of: 'of',
  none: 'No items recorded',
};

/**
 * Renders and downloads a single-record HR document PDF.
 */
export async function exportHrDocumentPdf(input: HrPdfInput): Promise<void> {
  const labels = { ...DEFAULT_LABELS, ...input.labels };
  const companyName = input.companyName?.trim() || HR_PDF_COMPANY_NAME;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerCjkFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  const generatedAt = new Date();

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(HR_PDF_COMPANY_NAME, PAGE_MARGIN, PAGE_MARGIN);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
  doc.text(input.documentTitle, PAGE_MARGIN, PAGE_MARGIN + 7);
  if (input.subtitle?.trim()) {
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(truncate(input.subtitle.trim(), 90), PAGE_MARGIN, PAGE_MARGIN + 14);
  }
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  const headerLineY = input.subtitle?.trim() ? PAGE_MARGIN + 18 : PAGE_MARGIN + 12;
  doc.line(PAGE_MARGIN, headerLineY, pageWidth - PAGE_MARGIN, headerLineY);

  let y = headerLineY + 8;
  doc.setTextColor(120, 120, 120);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(8);
  doc.text(
    `${labels.generatedAt}: ${formatTimestamp(generatedAt)}`,
    PAGE_MARGIN,
    y,
  );
  doc.text(
    `${labels.preparedBy}: ${input.preparedBy || EM_DASH}`,
    pageWidth / 2,
    y,
  );
  if (companyName !== HR_PDF_COMPANY_NAME) {
    doc.text(companyName, pageWidth - PAGE_MARGIN, y, { align: 'right' });
  }
  y += 8;

  for (const section of input.sections) {
    if (section.fields.length === 0) {
      continue;
    }
    y = ensureSpace(doc, y, 32);
    y = drawSectionTitle(doc, section.title, y);
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'plain',
      styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
      bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2, valign: 'top' },
      columnStyles: {
        0: { cellWidth: 52, fontStyle: 'bold' },
        1: { cellWidth: 'auto' },
      },
      head: [[labels.field, labels.value]],
      body: section.fields.map((field) => [field.label, dash(field.value)]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (input.itemsTable) {
    const table = input.itemsTable;
    y = ensureSpace(doc, y, 45);
    y = drawSectionTitle(doc, table.title, y);
    const columnStyles: Record<number, { halign: 'right' }> = {};
    for (const index of table.numericColumns ?? []) {
      columnStyles[index] = { halign: 'right' };
    }
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'plain',
      styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7.5, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 1.5 },
      bodyStyles: { font: PDF_FONT, fontSize: 7.5, textColor: [40, 40, 40], cellPadding: 1.5 },
      columnStyles,
      head: [table.head],
      body:
        table.rows.length > 0
          ? table.rows.map((row) => row.map((cell) => dash(cell)))
          : [
              [
                table.emptyText ?? labels.none,
                ...table.head.slice(1).map(() => EM_DASH),
              ],
            ],
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (input.footerNote?.trim()) {
    y = ensureSpace(doc, y, 16);
    doc.setFont(PDF_FONT, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(
      doc.splitTextToSize(
        input.footerNote.trim(),
        pageWidth - PAGE_MARGIN * 2,
      ) as string[],
      PAGE_MARGIN,
      y,
    );
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${HR_PDF_COMPANY_NAME} - ${input.documentTitle} ${input.requestNumber}`,
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
    );
    doc.text(
      `${labels.page} ${page} ${labels.of} ${pageCount}`,
      pageWidth - PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
      { align: 'right' },
    );
  }

  const safeNumber = input.requestNumber.replace(/[^a-zA-Z0-9-_]/g, '_');
  const dateStamp = generatedAt.toISOString().slice(0, 10);
  doc.save(`${input.fileNamePrefix}_${safeNumber}_${dateStamp}.pdf`);
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
  if (y + needed > doc.internal.pageSize.getHeight() - 16) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

function dash(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return EM_DASH;
  }
  const text = String(value).trim();
  return text === '' ? EM_DASH : text;
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
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
