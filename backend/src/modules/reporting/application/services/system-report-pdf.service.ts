import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  bilingualTitle,
  fmtDate,
  fmtGeneratedDate,
  PAYSLIP_COMPANY,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';
import { ReportingService } from './reporting.service';

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
    })) as unknown as {
      companyName?: string;
      title?: string;
      completionRate?: number;
      baseCurrency?: string;
      projects?: {
        total?: number;
        active?: number;
        averageProgressPct?: number;
        totalBudget?: number;
        byStatus?: Record<string, number>;
      };
      organization?: { branches?: number; departments?: number };
      siteOps?: {
        totalOpen?: number;
        openRfis?: number;
        overdueRfis?: number;
        openIssues?: number;
        openPunchItems?: number;
      };
      audit?: { last30Days?: number };
    };

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

    const generatedAt = new Date();
    const companyName = summary.companyName ?? PAYSLIP_COMPANY;
    const reportTitle = summary.title ?? 'System Report';

    const buffer = await renderPayslipPdf({ title: reportTitle }, (p) => {
      p.brand(bilingualTitle(reportTitle, '系统报告'));
      p.subtitleRight(companyName);
      p.rule();

      p.section('EXECUTIVE SUMMARY');
      p.fields([
        ['Total Projects', String(summary.projects?.total ?? '-')],
        ['Active Projects', String(summary.projects?.active ?? '-')],
        ['Completion Rate', `${summary.completionRate ?? '-'}%`],
        [
          'Average Progress',
          summary.projects?.averageProgressPct != null
            ? `${summary.projects.averageProgressPct}%`
            : '-',
        ],
        [
          'Total Budget',
          summary.projects?.totalBudget
            ? `${Number(summary.projects.totalBudget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${summary.baseCurrency ?? ''}`
            : '-',
        ],
        ['Branches', String(summary.organization?.branches ?? '-')],
        ['Departments', String(summary.organization?.departments ?? '-')],
        ['Open Site Ops', String(summary.siteOps?.totalOpen ?? '-')],
        ['Audit (Last 30 Days)', String(summary.audit?.last30Days ?? '-')],
      ]);

      const statusEntries = Object.entries(summary.projects?.byStatus ?? {})
        .filter(([, count]) => (count as number) > 0)
        .sort(([, a], [, b]) => (b as number) - (a as number));
      if (statusEntries.length > 0) {
        p.section('PORTFOLIO — BY STATUS', 'Share');
        const total = summary.projects?.total ?? 1;
        for (const [status, count] of statusEntries) {
          const share = `${Math.round(((count as number) / total) * 100)}%`;
          p.field(status, `${count} · ${share}`, 1);
        }
      }

      p.section('SITE OPS');
      p.fields([
        ['Open RFIs', String(summary.siteOps?.openRfis ?? '-')],
        ['Overdue RFIs', String(summary.siteOps?.overdueRfis ?? '-')],
        ['Open Issues', String(summary.siteOps?.openIssues ?? '-')],
        ['Open Punch Items', String(summary.siteOps?.openPunchItems ?? '-')],
      ]);

      p.rule();
      p.section('PROJECT REGISTER', 'Progress');
      if (projects.length === 0) {
        p.line('No projects', { indent: 1, color: '#333333' });
      } else {
        for (const project of projects) {
          p.field(
            `${project.projectCode} · ${project.name}`,
            project.overallProgressPct != null
              ? `${project.overallProgressPct}%`
              : '-',
            1,
          );
          p.wrapped(
            [
              project.status,
              project.projectType ?? null,
              project.budget != null
                ? Number(project.budget).toLocaleString('en-US', {
                    maximumFractionDigits: 0,
                  })
                : null,
              `Finish ${fmtDate(project.plannedFinishDate)}`,
            ]
              .filter(Boolean)
              .join(' · '),
            { indent: 24, size: 8 },
          );
        }
      }

      p.footerNotes([
        `Generated ${fmtGeneratedDate(generatedAt)}`,
        'This system report is system-generated.',
      ]);
    });

    const dateStamp = generatedAt.toISOString().slice(0, 10);
    const safeCompany = companyName.replace(/[^a-zA-Z0-9-_]/g, '_');
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `system-report_${safeCompany}_${dateStamp}.pdf`,
    };
  }
}
