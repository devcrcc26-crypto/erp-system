import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  bilingualTitle,
  dash,
  fmtDate,
  fmtGeneratedDate,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';

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

    const [openRfis, overdueRfis, openIssues, openPunchItems] =
      await Promise.all([
        this.prisma.rfi
          .count({
            where: {
              projectId,
              status: { notIn: ['CLOSED', 'VOID'] as never },
              deletedAt: null,
            },
          })
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
          .count({
            where: {
              projectId,
              status: { not: 'CLOSED' as never },
              deletedAt: null,
            },
          })
          .catch(() => 0),
        this.prisma.punchItem
          .count({
            where: {
              projectId,
              status: { not: 'CLOSED' as never },
              deletedAt: null,
            },
          })
          .catch(() => 0),
      ]);

    const taskGroups = await this.prisma.task
      .groupBy({
        by: ['status'],
        where: { projectId, deletedAt: null },
        _count: { _all: true },
      })
      .catch(() => []);
    const taskCount = taskGroups.reduce((sum, group) => sum + group._count._all, 0);

    const generatedAt = new Date();
    const buffer = await renderPayslipPdf({ title: 'Project Report' }, (p) => {
      p.brand(bilingualTitle('Project Report', '项目报告'));
      p.subtitleRight(project.projectCode);
      p.line(project.name, { color: '#333333' });
      p.rule();

      p.section('PROJECT OVERVIEW');
      p.fields([
        ['Project Code', project.projectCode],
        ['Name', project.name],
        ['Status', project.status],
        ['Type', dash((project as { projectType?: string }).projectType)],
        ['Planned Finish', fmtDate(project.plannedFinishDate)],
        [
          'Budget',
          project.budget != null
            ? `${Number(project.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${(project as { currency?: string }).currency ?? ''}`
            : '-',
        ],
        [
          'Overall Progress',
          project.overallProgressPct != null
            ? `${project.overallProgressPct}%`
            : '-',
        ],
      ]);

      p.section('SITE OPERATIONS');
      p.fields([
        ['Open RFIs', String(openRfis)],
        ['Overdue RFIs', String(overdueRfis)],
        ['Open Issues', String(openIssues)],
        ['Open Punch Items', String(openPunchItems)],
      ]);

      p.section('TASKS BY STATUS', 'Share');
      if (taskGroups.length === 0) {
        p.field('Tasks', String(taskCount), 1);
      } else {
        for (const group of taskGroups) {
          const share =
            taskCount > 0
              ? `${Math.round((group._count._all / taskCount) * 100)}%`
              : '0%';
          p.field(String(group.status), `${group._count._all} · ${share}`, 1);
        }
      }

      p.footerNotes([
        `Generated ${fmtGeneratedDate(generatedAt)}`,
        'This project report is system-generated.',
      ]);
    });

    const safe = project.projectCode.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `project-report_${safe}_${dateStamp}.pdf`,
    };
  }
}
