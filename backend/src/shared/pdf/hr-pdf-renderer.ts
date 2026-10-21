import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';

// A4 dimensions in PDF points (1pt = 1/72 inch)
const PW = 595.28;
const PH = 841.89;
export const M = 40; // page margin (matches PDFKit default)
export const CW = PW - M * 2; // content width = 515.28

// Colour palette (B&W design)
const COL_TEXT = '#1A1A1A';
const COL_MUTED = '#787878';
const COL_SECTION = '#505050';
const COL_BORDER_MED = '#C8C8C8';
const COL_BORDER_LIGHT = '#E0E0E0';

// Layout constants
const KV_KEY_W = 150; // default key column width in key-value tables
const ROW_H = 18; // default row height (pt)
const ITEMS_ROW_H = 16;
const CELL_PAD = 4;

const FONT_FILE = 'NotoSansSC-Regular.otf';

export function resolveFontPath(): string {
  for (const base of [process.cwd(), join(process.cwd(), 'backend')]) {
    const p = join(base, 'assets', 'fonts', FONT_FILE);
    if (existsSync(p)) return p;
  }
  throw new Error(`Font not found: ${FONT_FILE} — expected in backend/assets/fonts`);
}

export function createDoc(title: string): PDFKit.PDFDocument {
  return new PDFDocument({
    size: 'A4',
    margin: M,
    bufferPages: true,
    info: { Title: title, Author: 'ERP System' },
  });
}

export function docToBuffer(
  doc: PDFKit.PDFDocument,
  fontPath: string,
  draw: (d: PDFKit.PDFDocument) => void,
  footerLeft: string,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    try {
      doc.registerFont('F', fontPath);
      doc.font('F');
      draw(doc);
      addFooters(doc, footerLeft);
      doc.flushPages();
      doc.end();
    } catch (err) {
      reject(err instanceof Error ? err : new Error(String(err)));
    }
  });
}

/** Page header: company name + title + optional subtitle + divider. Returns new Y. */
export function drawPageHeader(
  doc: PDFKit.PDFDocument,
  companyName: string,
  title: string,
  subtitle?: string | null,
): number {
  let y = M;
  doc.fontSize(9).fillColor(COL_TEXT).font('F')
    .text(companyName, M, y, { width: CW, lineBreak: false });
  y += 14;
  doc.fontSize(14).fillColor(COL_TEXT)
    .text(title, M, y, { width: CW, lineBreak: false });
  y += subtitle ? 14 : 12;
  if (subtitle?.trim()) {
    doc.fontSize(9).fillColor(COL_SECTION)
      .text(subtitle.trim(), M, y, { width: CW, lineBreak: false });
    y += 12;
  }
  doc.strokeColor(COL_BORDER_MED).lineWidth(0.4)
    .moveTo(M, y).lineTo(M + CW, y).stroke();
  return y + 8;
}

/** Meta line: generated timestamp + prepared by. Returns new Y. */
export function drawMeta(
  doc: PDFKit.PDFDocument,
  y: number,
  generatedAt: string,
  preparedBy: string,
): number {
  doc.fontSize(8).fillColor(COL_MUTED)
    .text(`Generated: ${generatedAt}`, M, y, { width: CW * 0.5, lineBreak: false })
    .text(`Prepared by: ${preparedBy}`, M + CW * 0.5, y, { width: CW * 0.5, lineBreak: false });
  return y + 14;
}

/** Section title line (uppercase + thin divider). Returns new Y. */
export function drawSectionTitle(
  doc: PDFKit.PDFDocument,
  title: string,
  y: number,
): number {
  doc.fontSize(8).fillColor(COL_SECTION)
    .text(title.toUpperCase(), M, y, { width: CW, lineBreak: false });
  doc.strokeColor(COL_BORDER_MED).lineWidth(0.3)
    .moveTo(M, y + 11).lineTo(M + CW, y + 11).stroke();
  return y + 17;
}

/**
 * Two-column key-value table (Field | Value header + body rows).
 * Rows with long values auto-expand the row height.
 * Returns new Y.
 */
export function drawKvTable(
  doc: PDFKit.PDFDocument,
  rows: [string, string][],
  y: number,
  keyWidth = KV_KEY_W,
): number {
  const valX = M + keyWidth + 4;
  const valW = CW - keyWidth - 4;

  // Header
  doc.strokeColor(COL_BORDER_MED).lineWidth(0.3)
    .moveTo(M, y).lineTo(M + CW, y).stroke();
  doc.fontSize(8).fillColor(COL_TEXT)
    .text('Field', M, y + CELL_PAD, { width: keyWidth, lineBreak: false })
    .text('Value', valX, y + CELL_PAD, { width: valW, lineBreak: false });
  y += ROW_H;
  doc.strokeColor(COL_BORDER_MED).lineWidth(0.3)
    .moveTo(M, y).lineTo(M + CW, y).stroke();

  // Body
  for (const [k, v] of rows) {
    const val = v?.trim() || '-';
    const valH = doc.heightOfString(val, { width: valW });
    const rh = Math.max(ROW_H, valH + CELL_PAD * 2);
    doc.strokeColor(COL_BORDER_LIGHT).lineWidth(0.15)
      .moveTo(M, y).lineTo(M + CW, y).stroke();
    doc.fontSize(8).fillColor(COL_TEXT)
      .text(k, M, y + CELL_PAD, { width: keyWidth, lineBreak: false });
    doc.fillColor('#383838')
      .text(val, valX, y + CELL_PAD, { width: valW, lineBreak: true });
    y += rh;
  }
  return y;
}

/**
 * Multi-column items table.
 * colWidths must sum to ≤ CW.
 * Returns new Y.
 */
export function drawItemsTable(
  doc: PDFKit.PDFDocument,
  headers: string[],
  rows: (string | number)[][],
  colWidths: number[],
  y: number,
  emptyText = 'No items recorded',
): number {
  // Header
  doc.strokeColor(COL_BORDER_MED).lineWidth(0.3)
    .moveTo(M, y).lineTo(M + CW, y).stroke();
  let x = M;
  doc.fontSize(7.5).fillColor(COL_TEXT);
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], x + 2, y + CELL_PAD - 1, {
      width: colWidths[i] - 4,
      lineBreak: false,
    });
    x += colWidths[i];
  }
  y += ITEMS_ROW_H;
  doc.strokeColor(COL_BORDER_MED).lineWidth(0.3)
    .moveTo(M, y).lineTo(M + CW, y).stroke();

  // Body
  const displayRows =
    rows.length > 0
      ? rows
      : [[emptyText, ...headers.slice(1).map(() => '-')]];
  for (const row of displayRows) {
    x = M;
    doc.strokeColor(COL_BORDER_LIGHT).lineWidth(0.15)
      .moveTo(M, y).lineTo(M + CW, y).stroke();
    doc.fontSize(7.5).fillColor('#383838');
    for (let i = 0; i < colWidths.length; i++) {
      doc.text(
        row[i] != null ? String(row[i]) : '-',
        x + 2,
        y + CELL_PAD - 1,
        { width: colWidths[i] - 4, lineBreak: false },
      );
      x += colWidths[i];
    }
    y += ITEMS_ROW_H;
  }
  return y;
}

/** Add a new page if `needed` points would exceed the page bottom. */
export function ensureSpace(
  doc: PDFKit.PDFDocument,
  y: number,
  needed: number,
): number {
  if (y + needed > PH - M - 16) {
    doc.addPage();
    return M;
  }
  return y;
}

/** Stamp footers on every page after content is finalized. */
function addFooters(doc: PDFKit.PDFDocument, leftText: string): void {
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);
    const fy = PH - M + 6;
    doc.fontSize(7).fillColor(COL_MUTED)
      .text(leftText, M, fy, { width: CW - 60, lineBreak: false });
    doc.text(`Page ${i + 1} of ${count}`, M, fy, {
      width: CW,
      align: 'right',
      lineBreak: false,
    });
  }
}

/** Format a Date to "YYYY-MM-DD HH:mm". */
export function fmtTs(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Format an ISO date string to "YYYY-MM-DD". */
export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return String(iso).slice(0, 10);
}

/** Format a Decimal/number/null as "ETB X,XXX.XX". */
export function fmtEtb(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `ETB ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function dash(value: string | null | undefined): string {
  const t = value?.trim();
  return t || '-';
}

export function fullName(user: { firstName: string; lastName: string } | null | undefined): string {
  if (!user) return '-';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || '-';
}
