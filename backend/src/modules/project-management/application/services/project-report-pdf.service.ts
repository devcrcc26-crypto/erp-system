import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  humanize,
  isoDate,
  renderDocumentPdf,
  safeFilePart,
} from '../../../../shared/pdf/document-pdf';

function money(value: unknown, currency: string | null | undefined): string {
  if (value == null) return '-';
  const amount = Number(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
  return `${amount} ${currency ?? ''}`.trim();
}

@Injectable()
export class ProjectReportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    projectId: string,
    companyId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, companyId, deletedAt: null },
    });
    if (!project) throw new NotFoundException('Project not found');

    const [openRfis, overdueRfis, openIssues, openPunchItems] = await Promise.all([
      this.prisma.rfi
        .count({ where: { projectId, status: { notIn: ['CLOSED', 'VOID'] as never }, deletedAt: null } })
        .catch(() => 0),
      this.prisma.rfi
        .count({
          where: {
            projectId,
            status: { notIn: ['CLOSED', 'VOID'] as never },
            dueDate: { lt: new Date() },
            deletedAt: null,
          },
        })
        .catch(() => 0),
      this.prisma.issue
        .count({ where: { projectId, status: { not: 'CLOSED' as never }, deletedAt: null } })
        .catch(() => 0),
      this.prisma.punchItem
        .count({ where: { projectId, status: { not: 'CLOSED' as never }, deletedAt: null } })
        .catch(() => 0),
    ]);

    const taskGroups = await this.prisma.task
      .groupBy({ by: ['status'], where: { projectId, deletedAt: null }, _count: { _all: true } })
      .catch(() => []);
    const taskCount = taskGroups.reduce((sum, group) => sum + group._count._all, 0);
    const progress = project.overallProgressPct != null ? `${project.overallProgressPct}%` : '-';

    const buffer = await renderDocumentPdf({
      title: 'Project Report',
      titleZh: '项目报告',
      number: project.projectCode,
      status: project.status,
      hero: {
        headline: project.name,
        caption: `${humanize(project.projectType)}  ·  progress ${progress}`,
        dateLabel: 'Planned finish / 计划完工',
        date: isoDate(project.plannedFinishDate),
      },
      sections: [
        {
          title: 'Project overview / 项目概况',
          rows: [
            ['Project code / 项目编码', project.projectCode],
            ['Name / 名称', project.name],
            ['Status / 状态', humanize(project.status)],
            ['Type / 类型', humanize(project.projectType)],
            ['Start / 开工', isoDate(project.startDate)],
            ['Planned finish / 计划完工', isoDate(project.plannedFinishDate)],
            ['Budget / 预算', money(project.budget, project.currency)],
            ['Overall progress / 总进度', progress],
          ],
        },
        {
          title: 'Site operations / 现场管理',
          rows: [
            ['Open RFIs / 未关闭RFI', openRfis],
            ['Overdue RFIs / 逾期RFI', overdueRfis],
            ['Open issues / 未关闭问题', openIssues],
            ['Open punch items / 未关闭整改项', openPunchItems],
          ],
        },
      ],
      tables: [
        {
          title: 'Tasks by status / 任务状态',
          numbered: false,
          columns: [
            { header: 'Status / 状态', weight: 3 },
            { header: 'Tasks / 任务数', weight: 1.4, align: 'right' },
            { header: 'Share / 占比', weight: 1.4, align: 'right' },
          ],
          rows: taskGroups.map((group) => ({
            cells: [
              humanize(String(group.status)),
              group._count._all,
              taskCount > 0 ? `${Math.round((group._count._all / taskCount) * 100)}%` : '0%',
            ],
          })),
          totals: [['Total tasks / 任务合计', String(taskCount)]],
          emptyText: 'No tasks / 无任务',
        },
      ],
    });

    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `project-report_${safeFilePart(project.projectCode)}_${isoDate(new Date())}.pdf`,
    };
  }
}
