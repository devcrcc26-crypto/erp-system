import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { fmtEtb } from '../../../../shared/pdf/payslip-style-pdf';
import {
  humanize,
  isoDate,
  renderDocumentPdf,
} from '../../../../shared/pdf/document-pdf';

@Injectable()
export class ProjectsExportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    companyId: string,
    filters?: { search?: string; status?: string },
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const whereStatus = filters?.status
      ? { status: { in: filters.status.split(',').map((s) => s.trim()) as never[] } }
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

    const totalBudget = projects.reduce((sum, project) => {
      const n = Number(project.budget);
      return Number.isFinite(n) ? sum + n : sum;
    }, 0);
    const filterDesc =
      [
        filters?.search ? `Search: ${filters.search}` : null,
        filters?.status ? `Status: ${filters.status}` : null,
      ]
        .filter(Boolean)
        .join(', ') || 'None';
    const today = isoDate(new Date());

    const buffer = await renderDocumentPdf({
      title: 'Project Register Export',
      titleZh: '项目台账',
      numberPrefix: '',
      number: `Project register ${today}`,
      layout: 'landscape',
      hero: {
        headline: `${projects.length} project(s)  /  项目`,
        caption: `Filters: ${filterDesc}`,
        dateLabel: 'Total budget / 总预算',
        date: fmtEtb(totalBudget),
      },
      tables: [
        {
          title: 'Projects / 项目',
          columns: [
            { header: 'Code / 编码', weight: 1.3 },
            { header: 'Name / 名称', weight: 3 },
            { header: 'Type / 类型', weight: 1.3 },
            { header: 'Status / 状态', weight: 1.3 },
            { header: 'Progress / 进度', weight: 1, align: 'right' },
            { header: 'Budget / 预算', weight: 1.6, align: 'right' },
            { header: 'Start / 开工', weight: 1.2 },
            { header: 'Finish / 完工', weight: 1.2 },
          ],
          rows: projects.map((project) => ({
            cells: [
              project.projectCode,
              project.name,
              humanize(project.projectType),
              humanize(project.status),
              project.overallProgressPct != null ? `${project.overallProgressPct}%` : '-',
              project.budget != null
                ? `${Number(project.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${project.currency ?? ''}`.trim()
                : '-',
              isoDate(project.startDate),
              isoDate(project.plannedFinishDate),
            ],
            sub:
              [
                project.client ? `Client ${project.client}` : null,
                project.responsibleDepartment ? `Dept ${project.responsibleDepartment}` : null,
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
      filename: `projects-export_${today}.pdf`,
    };
  }
}
