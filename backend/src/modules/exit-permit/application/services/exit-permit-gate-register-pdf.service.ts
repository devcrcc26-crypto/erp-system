import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  M,
  CW,
  dash,
  fmtDate,
  fullName,
  resolveFontPath,
} from '../../../../shared/pdf/hr-pdf-renderer';

// A4 Landscape: 842 × 595 pt
const PW_L = 841.89;
const PH_L = 595.28;
const CW_L = PW_L - M * 2; // 761.89

const COMPANY_NAME = 'CRCC International Consulting';
const COL_BORDER_MED = '#C8C8C8';
const COL_BORDER_LIGHT = '#E0E0E0';
const COL_MUTED = '#787878';
const COL_TEXT = '#1A1A1A';
const COL_SECTION = '#505050';
const ITEMS_ROW_H = 16;

@Injectable()
export class ExitPermitGateRegisterPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    permitDate: string,
    direction: 'ENTRANCE' | 'EXIT' | 'ALL',
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const dateKey = permitDate.slice(0, 10);
    const dirFilter =
      direction === 'ALL'
        ? undefined
        : ({ direction } as { direction: 'ENTRANCE' | 'EXIT' });

    const permits = await this.prisma.exitPermit.findMany({
      where: {
        companyId,
        status: 'APPROVED',
        date: { gte: new Date(`${dateKey}T00:00:00.000Z`), lte: new Date(`${dateKey}T23:59:59.999Z`) },
        ...dirFilter,
        deletedAt: null,
      },
      include: {
        employee: { select: { firstName: true, lastName: true } },
        department: { select: { name: true } },
        items: { select: { itemName: true, issue: true, quantity: true, unit: true } },
      },
      orderBy: { requestNumber: 'asc' },
    });

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const dirLabel = direction === 'ALL' ? 'Entrance & Exit' : direction;
    const docTitle = 'Gate Pass Register';

    const buffer = await this.renderLandscape(
      permits,
      direction,
      dateKey,
      dirLabel,
      docTitle,
      generatedAt,
      fontPath,
    );

    const dirSlug = direction === 'ALL' ? 'all' : direction.toLowerCase();
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `exit-permit-gate-register_${dirSlug}_${dateKey}.pdf`,
    };
  }

  private renderLandscape(
    permits: any[],
    direction: 'ENTRANCE' | 'EXIT' | 'ALL',
    dateKey: string,
    dirLabel: string,
    docTitle: string,
    generatedAt: Date,
    fontPath: string,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({
        size: 'A4',
        layout: 'landscape',
        margin: M,
        bufferPages: true,
        info: { Title: docTitle, Author: 'ERP System' },
      });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      try {
        doc.registerFont('F', fontPath);
        doc.font('F');
        this.draw(doc, permits, direction, dateKey, dirLabel, docTitle, generatedAt);
        this.addFooters(doc, docTitle, dateKey);
        doc.flushPages();
        doc.end();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private draw(
    doc: PDFKit.PDFDocument,
    permits: any[],
    direction: 'ENTRANCE' | 'EXIT' | 'ALL',
    dateKey: string,
    dirLabel: string,
    docTitle: string,
    generatedAt: Date,
  ): void {
    const p = (n: number): string => String(n).padStart(2, '0');
    const ts = `${generatedAt.getFullYear()}-${p(generatedAt.getMonth() + 1)}-${p(generatedAt.getDate())} ${p(generatedAt.getHours())}:${p(generatedAt.getMinutes())}`;

    let y = M;
    doc.fontSize(9).fillColor(COL_TEXT)
      .text(COMPANY_NAME, M, y, { width: CW_L, lineBreak: false });
    y += 14;
    doc.fontSize(14).fillColor(COL_TEXT)
      .text(docTitle, M, y, { width: CW_L, lineBreak: false });
    y += 12;
    doc.fontSize(9).fillColor(COL_SECTION)
      .text(`Approved ${dirLabel} permits — ${fmtDate(dateKey)}`, M, y, { width: CW_L, lineBreak: false });
    y += 10;
    doc.strokeColor(COL_BORDER_MED).lineWidth(0.4)
      .moveTo(M, y).lineTo(M + CW_L, y).stroke();
    y += 8;
    doc.fontSize(8).fillColor(COL_MUTED)
      .text(`Generated: ${ts}`, M, y, { width: CW_L * 0.4, lineBreak: false })
      .text(`${permits.length} permit(s)`, M + CW_L * 0.4, y, { width: CW_L * 0.3, lineBreak: false })
      .text('Approved permits only', M, y, { width: CW_L, align: 'right', lineBreak: false });
    y += 12;

    const sections =
      direction === 'ALL'
        ? [
            { key: 'ENTRANCE' as const, title: 'ENTRANCE', data: permits.filter((p) => p.direction === 'ENTRANCE') },
            { key: 'EXIT' as const, title: 'EXIT', data: permits.filter((p) => p.direction === 'EXIT') },
          ]
        : [{ key: direction, title: direction, data: permits }];

    const colW = [70, 85, 80, 110, 100, 36, 45, 56]; // sum ≈ 582, fits in CW_L=761 but with M

    for (const section of sections) {
      if (direction === 'ALL') {
        y = this.ensureSpace(doc, y, 18);
        doc.fontSize(8).fillColor(COL_SECTION)
          .text(`${section.title} (${section.data.length})`, M, y, { width: CW_L, lineBreak: false });
        doc.strokeColor(COL_BORDER_MED).lineWidth(0.3)
          .moveTo(M, y + 11).lineTo(M + CW_L, y + 11).stroke();
        y += 17;
      }

      const headers = ['Request #', 'Employee', 'Department', 'Item', 'Issue', 'Qty', 'Unit', 'Gate Verified'];
      y = this.drawLandscapeHeader(doc, headers, colW, y);

      if (section.data.length === 0) {
        doc.fontSize(8).fillColor(COL_MUTED)
          .text('No approved permits for this date and direction.', M, y + 4, { width: CW_L, lineBreak: false });
        y += 16;
        continue;
      }

      for (const permit of section.data) {
        const items = permit.items ?? [];
        if (items.length === 0) {
          y = this.ensureSpace(doc, y, ITEMS_ROW_H);
          y = this.drawLandscapeRow(doc, [
            permit.requestNumber,
            fullName(permit.employee),
            permit.department?.name ?? '-',
            '-', '-', '-', '-', '',
          ], colW, y);
        } else {
          for (let i = 0; i < items.length; i++) {
            y = this.ensureSpace(doc, y, ITEMS_ROW_H);
            y = this.drawLandscapeRow(doc, [
              i === 0 ? permit.requestNumber : '',
              i === 0 ? fullName(permit.employee) : '',
              i === 0 ? (permit.department?.name ?? '-') : '',
              dash(items[i].itemName),
              dash(items[i].issue),
              String(items[i].quantity ?? '-'),
              dash(items[i].unit),
              '',
            ], colW, y);
          }
        }
      }
      y += 6;
    }
  }

  private drawLandscapeHeader(doc: PDFKit.PDFDocument, headers: string[], colWidths: number[], y: number): number {
    doc.strokeColor(COL_BORDER_MED).lineWidth(0.3)
      .moveTo(M, y).lineTo(M + colWidths.reduce((a, b) => a + b, 0), y).stroke();
    let x = M;
    doc.fontSize(7.5).fillColor(COL_TEXT);
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 2, y + 3, { width: colWidths[i] - 4, lineBreak: false });
      x += colWidths[i];
    }
    y += ITEMS_ROW_H;
    doc.strokeColor(COL_BORDER_MED).lineWidth(0.3)
      .moveTo(M, y).lineTo(M + colWidths.reduce((a, b) => a + b, 0), y).stroke();
    return y;
  }

  private drawLandscapeRow(doc: PDFKit.PDFDocument, cells: string[], colWidths: number[], y: number): number {
    doc.strokeColor(COL_BORDER_LIGHT).lineWidth(0.15)
      .moveTo(M, y).lineTo(M + colWidths.reduce((a, b) => a + b, 0), y).stroke();
    let x = M;
    doc.fontSize(7.5).fillColor('#383838');
    for (let i = 0; i < cells.length; i++) {
      doc.text(cells[i] || '', x + 2, y + 3, { width: colWidths[i] - 4, lineBreak: false });
      x += colWidths[i];
    }
    return y + ITEMS_ROW_H;
  }

  private ensureSpace(doc: PDFKit.PDFDocument, y: number, needed: number): number {
    if (y + needed > PH_L - M - 14) {
      doc.addPage();
      return M;
    }
    return y;
  }

  private addFooters(doc: PDFKit.PDFDocument, docTitle: string, dateKey: string): void {
    const { start, count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      doc.switchToPage(start + i);
      const fy = PH_L - M + 6;
      doc.fontSize(7).fillColor(COL_MUTED)
        .text(`${COMPANY_NAME} — ${docTitle} — ${dateKey}`, M, fy, { width: CW_L - 60, lineBreak: false });
      doc.text(`Page ${i + 1} of ${count}`, M, fy, { width: CW_L, align: 'right', lineBreak: false });
    }
  }
}
