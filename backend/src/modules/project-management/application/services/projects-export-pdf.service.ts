import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  M,
  fmtDate,
  fmtEtb,
  fmtTs,
  fullName,
  resolveFontPath,
} from '../../../../shared/pdf/hr-pdf-renderer';

// A4 Landscape
const PW_L = 841.89;
const PH_L = 595.28;
const CW_L = PW_L - M * 2;

const COMPANY_NAME = 'CRCC International Consulting';
const COL_MED = '#C8C8C8';
const COL_LIGHT = '#E0E0E0';
const COL_TEXT = '#1A1A1A';
const COL_MUTED = '#787878';
const COL_SECTION = '#505050';
const ROW_H = 16;

@Injectable()
export class ProjectsExportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    companyId: string,
    filters?: { search?: string; status?: string },
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const whereStatus = filters?.status
      ? { status: { in: filters.status.split(',').map((s) => s.trim()) as any[] } }
      : {};
    const whereSearch = filters?.search?.trim()
      ? {
          OR: [
            { name: { contains: filters.search, mode: 'insensitive' as const } },
            { projectCode: { contains: filters.search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const projects = await this.prisma.project.findMany({
      where: { companyId, deletedAt: null, ...whereStatus, ...whereSearch },
      orderBy: { projectCode: 'asc' },
    });

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const buffer = await this.render(projects, generatedAt, fontPath, filters);
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `projects-export_${dateStamp}.pdf`,
    };
  }

  private render(projects: any[], generatedAt: Date, fontPath: string, filters?: { search?: string; status?: string }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: M, bufferPages: true, info: { Title: 'Project Register Export', Author: 'ERP System' } });
      const chunks: Buffer[] = [];
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      try {
        doc.registerFont('F', fontPath);
        doc.font('F');
        this.draw(doc, projects, generatedAt, filters);
        this.addFooters(doc);
        doc.flushPages();
        doc.end();
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  private draw(doc: PDFKit.PDFDocument, projects: any[], generatedAt: Date, filters?: { search?: string; status?: string }): void {
    let y = M;

    doc.fontSize(9).fillColor(COL_TEXT).text(COMPANY_NAME, M, y, { width: CW_L, lineBreak: false });
    y += 14;
    doc.fontSize(14).fillColor(COL_TEXT).text('Project Register Export', M, y, { width: CW_L, lineBreak: false });
    y += 12;
    doc.strokeColor(COL_MED).lineWidth(0.4).moveTo(M, y).lineTo(M + CW_L, y).stroke();
    y += 8;
    doc.fontSize(8).fillColor(COL_MUTED)
      .text(`Generated: ${fmtTs(generatedAt)}`, M, y, { width: CW_L * 0.5, lineBreak: false });
    y += 14;

    // Summary section
    doc.fontSize(8).fillColor(COL_SECTION).text('SUMMARY', M, y, { width: CW_L, lineBreak: false });
    doc.strokeColor(COL_MED).lineWidth(0.3).moveTo(M, y + 11).lineTo(M + CW_L, y + 11).stroke();
    y += 17;

    const totalBudget = projects.reduce((sum, p) => {
      const n = Number(p.budget); return Number.isFinite(n) ? sum + n : sum;
    }, 0);
    const filterDesc = [
      filters?.search ? `Search: ${filters.search}` : null,
      filters?.status ? `Status: ${filters.status}` : null,
    ].filter(Boolean).join(', ') || 'None';
    const kvW = 200;
    const kvRows: [string, string][] = [
      ['Total projects', String(projects.length)],
      ['Total budget (USD)', fmtEtb(totalBudget).replace('ETB', 'USD')],
      ['Filters', filterDesc],
    ];
    doc.strokeColor(COL_MED).lineWidth(0.3).moveTo(M, y).lineTo(M + CW_L, y).stroke();
    doc.fontSize(8).fillColor(COL_TEXT).text('Field', M, y + 3, { width: kvW, lineBreak: false });
    doc.text('Value', M + kvW + 4, y + 3, { width: CW_L - kvW - 4, lineBreak: false });
    y += ROW_H;
    doc.strokeColor(COL_MED).lineWidth(0.3).moveTo(M, y).lineTo(M + CW_L, y).stroke();
    for (const [k, v] of kvRows) {
      doc.strokeColor(COL_LIGHT).lineWidth(0.15).moveTo(M, y).lineTo(M + CW_L, y).stroke();
      doc.fontSize(8).fillColor(COL_TEXT)
        .text(k, M, y + 3, { width: kvW, lineBreak: false })
        .text(v, M + kvW + 4, y + 3, { width: CW_L - kvW - 4, lineBreak: false });
      y += ROW_H;
    }
    y += 8;

    // Project table
    if (y + 30 > PH_L - M - 14) { doc.addPage(); y = M; }
    doc.fontSize(8).fillColor(COL_SECTION).text('PROJECTS', M, y, { width: CW_L, lineBreak: false });
    doc.strokeColor(COL_MED).lineWidth(0.3).moveTo(M, y + 11).lineTo(M + CW_L, y + 11).stroke();
    y += 17;

    const cols = [60, 140, 65, 65, 60, 80, 65, 70, 80, 76]; // sum = 761 ≈ CW_L
    const headers = ['Code', 'Name', 'Type', 'Status', 'Progress', 'Budget', 'Start', 'Planned Finish', 'Client', 'Department'];

    doc.strokeColor(COL_MED).lineWidth(0.3).moveTo(M, y).lineTo(M + CW_L, y).stroke();
    let x = M;
    doc.fontSize(7).fillColor(COL_TEXT);
    for (let i = 0; i < headers.length; i++) {
      doc.text(headers[i], x + 2, y + 3, { width: cols[i] - 4, lineBreak: false });
      x += cols[i];
    }
    y += 14;
    doc.strokeColor(COL_MED).lineWidth(0.3).moveTo(M, y).lineTo(M + CW_L, y).stroke();

    for (const project of projects) {
      if (y + ROW_H > PH_L - M - 14) { doc.addPage(); y = M; }
      doc.strokeColor(COL_LIGHT).lineWidth(0.15).moveTo(M, y).lineTo(M + CW_L, y).stroke();
      x = M;
      doc.fontSize(7).fillColor('#383838');
      const cells = [
        project.projectCode ?? '-',
        project.name ?? '-',
        project.projectType ?? '-',
        project.status ?? '-',
        project.overallProgressPct != null ? `${project.overallProgressPct}%` : '-',
        project.budget != null ? `${Number(project.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${project.currency ?? ''}` : '-',
        fmtDate(project.startDate),
        fmtDate(project.plannedFinishDate),
        project.client ?? '-',
        project.responsibleDepartment ?? '-',
      ];
      for (let i = 0; i < cols.length; i++) {
        doc.text(cells[i], x + 2, y + 3, { width: cols[i] - 4, lineBreak: false });
        x += cols[i];
      }
      y += ROW_H;
    }
  }

  private addFooters(doc: PDFKit.PDFDocument): void {
    const { start, count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
      doc.switchToPage(start + i);
      const fy = PH_L - M + 6;
      doc.fontSize(7).fillColor(COL_MUTED)
        .text(`${COMPANY_NAME} — Project Register Export`, M, fy, { width: CW_L - 60, lineBreak: false });
      doc.text(`Page ${i + 1} of ${count}`, M, fy, { width: CW_L, align: 'right', lineBreak: false });
    }
  }
}
