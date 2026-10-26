import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { PAYSLIP_COMPANY } from '../../../../shared/pdf/payslip-style-pdf';
import {
  humanize,
  isoDate,
  renderDocumentPdf,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';
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

    const companyName = summary.companyName ?? PAYSLIP_COMPANY;
    const reportTitle = summary.title ?? 'System Report';
    const today = isoDate(new Date());
    const totalProjects = summary.projects?.total ?? 0;
    const statusEntries = Object.entries(summary.projects?.byStatus ?? {})
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a);
    const totalBudget = summary.projects?.totalBudget
      ? `${Number(summary.projects.totalBudget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${summary.baseCurrency ?? ''}`.trim()
      : '-';

    const buffer = await renderDocumentPdf({
      title: reportTitle,
      titleZh: '系统报告',
      numberPrefix: '',
      number: `System report ${today}`,
      hero: {
        headline: companyName,
        caption: `${totalProjects} project(s)  ·  completion ${summary.completionRate ?? '-'}%`,
        dateLabel: 'Report date / 报告日期',
        date: today,
      },
      sections: [
        {
          title: 'Executive summary / 概要',
          rows: [
            ['Total projects / 项目总数', summary.projects?.total],
            ['Active projects / 在建项目', summary.projects?.active],
            ['Completion rate / 完成率', `${summary.completionRate ?? '-'}%`],
            [
              'Average progress / 平均进度',
              summary.projects?.averageProgressPct != null ? `${summary.projects.averageProgressPct}%` : '-',
            ],
            ['Total budget / 总预算', totalBudget],
            ['Branches / 分支机构', summary.organization?.branches],
            ['Departments / 部门', summary.organization?.departments],
            ['Audit events, last 30 days / 近30天审计', summary.audit?.last30Days],
          ],
        },
        {
          title: 'Site operations / 现场管理',
          rows: [
            ['Open items / 未关闭事项', summary.siteOps?.totalOpen],
            ['Open RFIs / 未关闭RFI', summary.siteOps?.openRfis],
            ['Overdue RFIs / 逾期RFI', summary.siteOps?.overdueRfis],
            ['Open issues / 未关闭问题', summary.siteOps?.openIssues],
            ['Open punch items / 未关闭整改项', summary.siteOps?.openPunchItems],
          ],
        },
      ],
      tables: [
        {
          title: 'Portfolio by status / 项目状态',
          numbered: false,
          columns: [
            { header: 'Status / 状态', weight: 3 },
            { header: 'Projects / 项目数', weight: 1.4, align: 'right' },
            { header: 'Share / 占比', weight: 1.4, align: 'right' },
          ],
          rows: statusEntries.map(([status, count]) => ({
            cells: [
              humanize(status),
              count,
              totalProjects > 0 ? `${Math.round((count / totalProjects) * 100)}%` : '-',
            ],
          })),
          emptyText: 'No projects / 无项目',
        },
        {
          title: 'Project register / 项目台账',
          columns: [
            { header: 'Code / 编码', weight: 1.4 },
            { header: 'Name / 名称', weight: 3.2 },
            { header: 'Status / 状态', weight: 1.4 },
            { header: 'Progress / 进度', weight: 1.1, align: 'right' },
            { header: 'Finish / 完工', weight: 1.4 },
          ],
          rows: projects.map((project) => ({
            cells: [
              project.projectCode,
              project.name,
              humanize(project.status),
              project.overallProgressPct != null ? `${project.overallProgressPct}%` : '-',
              isoDate(project.plannedFinishDate),
            ],
            sub:
              [
                project.projectType ? humanize(project.projectType) : null,
                project.budget != null
                  ? `${Number(project.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${project.currency ?? ''}`.trim()
                  : null,
              ]
                .filter(Boolean)
                .join(' · ') || null,
          })),
          subColumn: 1,
          emptyText: 'No projects / 无项目',
        },
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `system-report_${safeFilePart(companyName)}_${today}.pdf`,
    };
  }
}
