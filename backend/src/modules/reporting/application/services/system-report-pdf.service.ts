import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  CW,
  createDoc,
  docToBuffer,
  drawItemsTable,
  drawKvTable,
  drawMeta,
  drawPageHeader,
  drawSectionTitle,
  ensureSpace,
  fmtDate,
  fmtTs,
  resolveFontPath,
} from '../../../../shared/pdf/hr-pdf-renderer';
import { ReportingService } from './reporting.service';

const COMPANY_NAME = 'CRCC International Consulting';

@Injectable()
export class SystemReportPdfService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reportingService: ReportingService,
  ) {}

  async getPdf(
    companyId: string,
    userId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const summary = (await this.reportingService.getPortfolioSummary({
      companyId,
      userId,
    })) as any;

    const projects = await this.prisma.project.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { projectCode: 'asc' },
      select: {
        projectCode: true,
        name: true,
        status: true,
        projectType: true,
        overallProgressPct: true,
        budget: true,
        currency: true,
        plannedFinishDate: true,
      },
    });

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const doc = createDoc('System Report');
    const footerLeft = `${summary.companyName ?? COMPANY_NAME} — System Report`;

    const buffer = await docToBuffer(doc, fontPath, (d) => {
      let y = drawPageHeader(d, summary.companyName ?? COMPANY_NAME, summary.title ?? 'System Report');
      y = drawMeta(d, y, fmtTs(generatedAt), '');
      y += 6;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Executive Summary', y);
      y = drawKvTable(d, [
        ['Total Projects', String(summary.projects?.total ?? '-')],
        ['Active Projects', String(summary.projects?.active ?? '-')],
        ['Completion Rate', `${summary.completionRate ?? '-'}%`],
        ['Average Progress', summary.projects?.averageProgressPct != null ? `${summary.projects.averageProgressPct}%` : '-'],
        ['Total Budget', summary.projects?.totalBudget ? `${Number(summary.projects.totalBudget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${summary.baseCurrency ?? ''}` : '-'],
        ['Branches', String(summary.organization?.branches ?? '-')],
        ['Departments', String(summary.organization?.departments ?? '-')],
        ['Open Site Ops', String(summary.siteOps?.totalOpen ?? '-')],
        ['Audit (Last 30 Days)', String(summary.audit?.last30Days ?? '-')],
      ], y);
      y += 8;

      const statusEntries = Object.entries(summary.projects?.byStatus ?? {}).filter(([, c]) => (c as number) > 0).sort(([, a], [, b]) => (b as number) - (a as number));
      if (statusEntries.length > 0) {
        y = ensureSpace(d, y, 30);
        y = drawSectionTitle(d, 'Portfolio — By Status', y);
        const total = summary.projects?.total ?? 1;
        const colW = [CW * 0.5, CW * 0.25, CW * 0.25];
        y = drawItemsTable(d, ['Status', 'Count', 'Share'], statusEntries.map(([s, c]) => [s, String(c), `${Math.round(((c as number) / total) * 100)}%`]), colW, y);
        y += 8;
      }

      y = ensureSpace(d, y, 30);
      y = drawSectionTitle(d, 'Site Ops', y);
      y = drawKvTable(d, [
        ['Open RFIs', String(summary.siteOps?.openRfis ?? '-')],
        ['Overdue RFIs', String(summary.siteOps?.overdueRfis ?? '-')],
        ['Open Issues', String(summary.siteOps?.openIssues ?? '-')],
        ['Open Punch Items', String(summary.siteOps?.openPunchItems ?? '-')],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 30);
      y = drawSectionTitle(d, 'Project Register', y);
      const projCols = [CW * 0.13, CW * 0.27, CW * 0.13, CW * 0.12, CW * 0.1, CW * 0.13, CW * 0.12];
      const projRows = projects.map((p) => [
        p.projectCode,
        p.name,
        p.status,
        p.projectType ?? '-',
        p.overallProgressPct != null ? `${p.overallProgressPct}%` : '-',
        p.budget != null ? `${Number(p.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '-',
        fmtDate(p.plannedFinishDate),
      ]);
      y = drawItemsTable(d, ['Code', 'Name', 'Status', 'Type', 'Progress', 'Budget', 'Planned Finish'], projRows, projCols, y);
    }, footerLeft);

    const dateStamp = generatedAt.toISOString().slice(0, 10);
    const safeCompany = (summary.companyName ?? COMPANY_NAME).replace(/[^a-zA-Z0-9-_]/g, '_');
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `system-report_${safeCompany}_${dateStamp}.pdf`,
    };
  }
}
