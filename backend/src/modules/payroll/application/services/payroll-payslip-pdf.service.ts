import { existsSync } from 'fs';
import { join } from 'path';
import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import {
  buildPayslipLines,
  type PayslipLine,
  type PayslipPdfModel,
} from './payroll-payslip-pdf.layout';

const FONT_FILE = 'NotoSansSC-Regular.otf';

/**
 * Renders a one-page A4 payslip PDF from locked payroll entry data.
 * PDFKit subsets Noto Sans SC to the glyphs used on that page.
 */
@Injectable()
export class PayrollPayslipPdfService {
  /**
   * Builds the PDF buffer. Chinese labels use Noto Sans SC so they are not boxes.
   */
  async render(model: PayslipPdfModel): Promise<Buffer> {
    return this.toPdfBuffer(this.resolveFontPath(), buildPayslipLines(model));
  }

  /**
   * Resolves the regular-weight Noto Sans SC file under backend/assets/fonts.
   */
  resolveFontPath(): string {
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

  private toPdfBuffer(fontPath: string, lines: PayslipLine[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        info: {
          Title: 'Payslip',
          Author: 'CCECC Ethiopia Branch',
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
        doc.registerFont('NotoSansSC', fontPath);
        doc.font('NotoSansSC');
        this.draw(doc, lines);
        doc.end();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private draw(doc: PDFKit.PDFDocument, lines: PayslipLine[]): void {
    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;
    const amountWidth = 150;
    let y = doc.page.margins.top;

    const text = (
      value: string,
      x: number,
      lineY: number,
      boxWidth: number,
      options?: { align?: 'left' | 'right'; size?: number; color?: string },
    ): void => {
      doc
        .font('NotoSansSC')
        .fontSize(options?.size ?? 9)
        .fillColor(options?.color ?? '#1A1A1A')
        .text(value, x, lineY, {
          width: boxWidth,
          align: options?.align ?? 'left',
          lineBreak: false,
        });
    };

    for (const line of lines) {
      if (line.kind === 'brand') {
        text(line.left, left, y, width * 0.55, { size: 11 });
        text(line.right, left, y, width, { size: 13, align: 'right' });
        y += 18;
        continue;
      }
      if (line.kind === 'right') {
        text(line.text, left, y, width, { size: 11, align: 'right', color: '#333333' });
        y += 16;
        continue;
      }
      if (line.kind === 'rule') {
        y += 4;
        doc
          .save()
          .strokeColor('#1A1A1A')
          .lineWidth(0.7)
          .moveTo(left, y)
          .lineTo(right, y)
          .stroke()
          .restore();
        y += 10;
        continue;
      }
      if (line.kind === 'pair') {
        const col = width / 2 - 6;
        text(line.left, left, y, col, { size: 9 });
        if (line.right) {
          text(line.right, left + width / 2, y, col, { size: 9 });
        }
        y += 15;
        continue;
      }
      if (line.kind === 'section') {
        y += 4;
        text(line.label, left, y, width - amountWidth, { size: 10 });
        if (line.trailing) {
          text(line.trailing, right - amountWidth, y, amountWidth, {
            size: 9,
            align: 'right',
            color: '#333333',
          });
        }
        y += 16;
        continue;
      }
      if (line.kind === 'amount') {
        const indent = line.indent * 12;
        text(line.label, left + indent, y, width - amountWidth - indent, { size: 9 });
        if (line.amount) {
          text(line.amount, right - amountWidth, y, amountWidth, {
            size: 9,
            align: 'right',
          });
        }
        y += 14;
        continue;
      }
      if (line.kind === 'total') {
        y += 2;
        text(line.label, left, y, width - amountWidth - 8, { size: 10, align: 'right' });
        text(line.amount, right - amountWidth, y, amountWidth, {
          size: 10,
          align: 'right',
        });
        y += 16;
        continue;
      }
      if (line.kind === 'net') {
        y += 2;
        text(line.label, left, y, width - amountWidth - 8, { size: 12, align: 'right' });
        text(line.amount, right - amountWidth, y, amountWidth, {
          size: 12,
          align: 'right',
        });
        y += 18;
        continue;
      }
      text(line.text, left, y, width, { size: 8, color: '#333333' });
      y += 13;
    }
  }
}
