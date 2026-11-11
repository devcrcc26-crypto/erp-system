import { existsSync } from 'fs';
import { join } from 'path';
import PDFDocument from 'pdfkit';

const FONT_FILE = 'NotoSansSC-Regular.otf';

/** Same brand and font as payroll payslips. */
export const PAYSLIP_COMPANY = 'CCECC Ethiopia Branch';
export const PAYSLIP_FONT = 'NotoSansSC';
export const PAYSLIP_AMOUNT_WIDTH = 150;

/** Minimum row advances — match payslip rhythm for single-line content. */
const ROW_BRAND = 18;
const ROW_SUBTITLE = 16;
const ROW_PAIR = 15;
const ROW_LINE = 15;
const ROW_SECTION = 16;
const ROW_FIELD = 14;
const ROW_TOTAL = 16;
const ROW_NOTE = 13;
const ROW_GAP = 4;
const COL_GAP = 12;

export type PayslipTextAlign = 'left' | 'center' | 'right';

/**
 * Resolves Noto Sans SC under backend/assets/fonts (same as payroll).
 */
export function resolvePayslipFontPath(): string {
  const candidates = [
    join(process.cwd(), 'assets', 'fonts', FONT_FILE),
    join(process.cwd(), 'backend', 'assets', 'fonts', FONT_FILE),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    `Noto Sans SC font not found. Expected ${FONT_FILE} in backend/assets/fonts.`,
  );
}

export function dash(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '-';
}

export function fmtDate(iso: string | Date | null | undefined): string {
  if (!iso) return '-';
  return String(iso).slice(0, 10);
}

export function fmtGeneratedDate(date: Date): string {
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = months[date.getUTCMonth()] ?? '';
  return `${day} ${month} ${date.getUTCFullYear()}`;
}

export function fmtEtb(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const rounded = Math.round(n * 100) / 100;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rounded);
}

export function fullName(
  user: { firstName?: string | null; lastName?: string | null } | null | undefined,
): string {
  if (!user) return '-';
  return [user.firstName, user.lastName].filter(Boolean).join(' ') || '-';
}

export function bilingualTitle(english: string, chinese?: string | null): string {
  const zh = chinese?.trim();
  return zh ? `${english.toUpperCase()} / ${zh}` : english.toUpperCase();
}

/**
 * Imperative painter matching payroll payslip spacing and typography.
 * Document PDFs stack or wrap within dedicated columns and advance by the
 * actual rendered bottom (PDFKit `doc.y`) so bilingual / long values never
 * overlap neighbouring text.
 */
export class PayslipPdfPainter {
  readonly doc: PDFKit.PDFDocument;
  readonly left: number;
  readonly right: number;
  readonly width: number;
  y: number;

  constructor(doc: PDFKit.PDFDocument) {
    this.doc = doc;
    this.left = doc.page.margins.left;
    this.right = doc.page.width - doc.page.margins.right;
    this.width = this.right - this.left;
    this.y = doc.page.margins.top;
  }

  /**
   * True when `value` fits on one line inside `boxWidth` (with a small safety margin).
   */
  private fitsOneLine(value: string, boxWidth: number, size: number): boolean {
    if (!value || boxWidth <= 0) return true;
    this.doc.font(PAYSLIP_FONT).fontSize(size);
    return this.doc.widthOfString(value) <= boxWidth * 0.98;
  }

  /**
   * Draws text inside a column and returns the Y just below the rendered block.
   * Always uses the post-draw `doc.y` so CJK wrapping cannot undershoot the advance.
   */
  text(
    value: string,
    x: number,
    lineY: number,
    boxWidth: number,
    options?: { align?: PayslipTextAlign; size?: number; color?: string },
  ): number {
    if (boxWidth <= 0) {
      return lineY;
    }
    const size = options?.size ?? 9;
    this.doc
      .font(PAYSLIP_FONT)
      .fontSize(size)
      .fillColor(options?.color ?? '#1A1A1A')
      .text(value, x, lineY, {
        width: boxWidth,
        align: options?.align ?? 'left',
        lineBreak: true,
        lineGap: 1,
      });
    return Math.max(this.doc.y, lineY + this.doc.currentLineHeight(true));
  }

  ensure(needed: number): void {
    if (this.y + needed <= this.doc.page.height - this.doc.page.margins.bottom) {
      return;
    }
    this.doc.addPage();
    this.y = this.doc.page.margins.top;
  }

  /**
   * Company on its own row, document title on the next — avoids long bilingual
   * titles colliding with the brand on one line.
   */
  brand(title: string): void {
    this.ensure(ROW_BRAND * 2 + ROW_GAP);
    const companyBottom = this.text(PAYSLIP_COMPANY, this.left, this.y, this.width, {
      size: 11,
    });
    this.y = Math.max(this.y + ROW_BRAND, companyBottom) + 2;
    const titleBottom = this.text(title, this.left, this.y, this.width, {
      size: 13,
      align: 'right',
    });
    this.y = Math.max(this.y + ROW_BRAND, titleBottom) + ROW_GAP;
  }

  subtitleRight(text: string): void {
    this.ensure(ROW_SUBTITLE + ROW_GAP);
    const bottom = this.text(text, this.left, this.y, this.width, {
      size: 11,
      align: 'right',
      color: '#333333',
    });
    this.y = Math.max(this.y + ROW_SUBTITLE, bottom) + ROW_GAP;
  }

  rule(): void {
    this.ensure(14);
    this.y += 4;
    this.doc
      .save()
      .strokeColor('#1A1A1A')
      .lineWidth(0.7)
      .moveTo(this.left, this.y)
      .lineTo(this.right, this.y)
      .stroke()
      .restore();
    this.y += 10;
  }

  /**
   * Two columns when both sides fit on one line; otherwise stacked full-width
   * lines so wrapped bilingual text cannot collide across the gutter.
   */
  pair(leftText: string, rightText = ''): void {
    const col = (this.width - COL_GAP) / 2;
    const leftFits = this.fitsOneLine(leftText, col, 9);
    const rightFits = !rightText || this.fitsOneLine(rightText, col, 9);

    if (leftFits && rightFits) {
      this.ensure(ROW_PAIR + ROW_GAP);
      const startY = this.y;
      const leftBottom = this.text(leftText, this.left, startY, col, { size: 9 });
      let rightBottom = startY;
      if (rightText) {
        rightBottom = this.text(rightText, this.left + col + COL_GAP, startY, col, {
          size: 9,
        });
      }
      this.y = Math.max(startY + ROW_PAIR, leftBottom, rightBottom) + ROW_GAP;
      return;
    }

    this.line(leftText);
    if (rightText) {
      this.line(rightText);
    }
  }

  line(
    value: string,
    options?: { size?: number; color?: string; indent?: number },
  ): void {
    const indent = (options?.indent ?? 0) * 12;
    const size = options?.size ?? 9;
    const boxWidth = this.width - indent;
    this.ensure(ROW_LINE + ROW_GAP);
    const bottom = this.text(value, this.left + indent, this.y, boxWidth, {
      size,
      color: options?.color,
    });
    this.y = Math.max(this.y + ROW_LINE, bottom) + ROW_GAP;
  }

  section(label: string, trailing?: string): void {
    const labelW = trailing
      ? Math.max(this.width - PAYSLIP_AMOUNT_WIDTH - COL_GAP, 40)
      : this.width;
    this.ensure(ROW_SECTION + ROW_GAP + 4);
    this.y += 4;
    const startY = this.y;
    const labelBottom = this.text(label, this.left, startY, labelW, { size: 10 });
    let trailingBottom = startY;
    if (trailing) {
      trailingBottom = this.text(
        trailing,
        this.right - PAYSLIP_AMOUNT_WIDTH,
        startY,
        PAYSLIP_AMOUNT_WIDTH,
        { size: 9, align: 'right', color: '#333333' },
      );
    }
    this.y = Math.max(startY + ROW_SECTION, labelBottom, trailingBottom) + ROW_GAP;
  }

  /**
   * Short trailing values (amounts, flags) sit on the right. Longer values use
   * a single wrapping "Label: value" block so columns never collide.
   */
  field(label: string, value: string, indent = 0): void {
    const pad = indent * 12;
    const contentWidth = this.width - pad;
    const labelW = Math.max(contentWidth - PAYSLIP_AMOUNT_WIDTH - COL_GAP, 40);
    const valueFits =
      this.fitsOneLine(value, PAYSLIP_AMOUNT_WIDTH, 9) &&
      this.fitsOneLine(label, labelW, 9);

    if (valueFits) {
      this.ensure(ROW_FIELD + ROW_GAP);
      const startY = this.y;
      const labelBottom = this.text(label, this.left + pad, startY, labelW, {
        size: 9,
      });
      const valueBottom = this.text(
        value,
        this.right - PAYSLIP_AMOUNT_WIDTH,
        startY,
        PAYSLIP_AMOUNT_WIDTH,
        { size: 9, align: 'right' },
      );
      this.y = Math.max(startY + ROW_FIELD, labelBottom, valueBottom) + ROW_GAP;
      return;
    }

    this.line(`${label}:  ${value}`, { indent, size: 9 });
  }

  total(label: string, value: string): void {
    const labelW = Math.max(this.width - PAYSLIP_AMOUNT_WIDTH - COL_GAP, 40);
    this.ensure(ROW_TOTAL + ROW_GAP + 2);
    this.y += 2;
    const startY = this.y;
    const labelBottom = this.text(label, this.left, startY, labelW, {
      size: 10,
      align: 'right',
    });
    const valueBottom = this.text(
      value,
      this.right - PAYSLIP_AMOUNT_WIDTH,
      startY,
      PAYSLIP_AMOUNT_WIDTH,
      { size: 10, align: 'right' },
    );
    this.y = Math.max(startY + ROW_TOTAL, labelBottom, valueBottom) + ROW_GAP;
  }

  wrapped(
    value: string,
    options?: { indent?: number; size?: number; color?: string },
  ): void {
    const indent = options?.indent ?? 12;
    const size = options?.size ?? 9;
    const color = options?.color ?? '#333333';
    const boxWidth = this.width - indent;
    this.ensure(ROW_LINE + 6);
    const bottom = this.text(value, this.left + indent, this.y, boxWidth, {
      size,
      color,
    });
    this.y = Math.max(this.y + ROW_LINE, bottom) + ROW_GAP;
  }

  note(value: string): void {
    this.ensure(ROW_NOTE + ROW_GAP);
    const bottom = this.text(value, this.left, this.y, this.width, {
      size: 8,
      color: '#333333',
    });
    this.y = Math.max(this.y + ROW_NOTE, bottom) + ROW_GAP;
  }

  /**
   * Renders Field/Value rows as payslip amount lines (no grid).
   */
  fields(rows: ReadonlyArray<readonly [string, string]>): void {
    for (const [key, value] of rows) {
      this.field(key, dash(value), 1);
    }
  }

  /**
   * Renders a multi-column items block without cell borders.
   * First column is the primary label; remaining cells join under it;
   * last column is shown on the right when there are 2+ columns.
   */
  itemsBlock(
    title: string,
    headers: string[],
    rows: ReadonlyArray<ReadonlyArray<string | number>>,
    emptyText = 'No items recorded',
  ): void {
    this.section(title, headers.length > 1 ? headers[headers.length - 1] : undefined);
    if (rows.length === 0) {
      this.line(emptyText, { indent: 1, color: '#333333' });
      return;
    }
    for (const row of rows) {
      const cells = row.map((cell) => (cell == null || cell === '' ? '-' : String(cell)));
      if (cells.length === 1) {
        this.line(`•  ${cells[0]}`, { indent: 1, color: '#333333' });
        continue;
      }
      const primary = cells[0] ?? '-';
      const trailing = cells[cells.length - 1] ?? '';
      const middle = cells.slice(1, -1).filter((c) => c !== '-');
      this.field(primary, trailing, 1);
      if (middle.length > 0) {
        this.wrapped(middle.join(' · '), { indent: 24, size: 8 });
      }
    }
  }

  footerNotes(lines: string[]): void {
    this.rule();
    for (const line of lines) {
      this.note(line);
    }
  }
}

export interface RenderPayslipPdfOptions {
  title: string;
  author?: string;
  layout?: 'portrait' | 'landscape';
  size?: 'A4' | 'A5';
  margin?: number;
}

/**
 * Creates a PDF (A4 unless `size` says otherwise), registers Noto Sans SC,
 * runs `draw`, returns the buffer.
 */
export function renderPayslipPdf(
  options: RenderPayslipPdfOptions,
  draw: (painter: PayslipPdfPainter) => void,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: options.size ?? 'A4',
      layout: options.layout ?? 'portrait',
      margin: options.margin ?? 40,
      bufferPages: true,
      info: {
        Title: options.title,
        Author: options.author ?? PAYSLIP_COMPANY,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
    doc.on('error', reject);

    try {
      doc.registerFont(PAYSLIP_FONT, resolvePayslipFontPath());
      doc.font(PAYSLIP_FONT);
      draw(new PayslipPdfPainter(doc));
      doc.flushPages();
      doc.end();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
