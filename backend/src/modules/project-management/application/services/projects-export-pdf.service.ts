import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  bilingualTitle,
  fmtDate,
  fmtEtb,
  fmtGeneratedDate,
  renderPayslipPdf,
} from '../../../../shared/pdf/payslip-style-pdf';

@Injectable()
export class ProjectsExportPdfService {
  constructor(private readonly prisma: PrismaService) {}

  async getPdf(
    companyId: string,
    filters?: { search?: string; status?: string },
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
    const whereStatus = filters?.status
      ? {
          status: {
            in: filters.status.split(',').map((s) => s.trim()) as never[],
          },
        }
      : {};
    const whereSearch = filters?.search?.trim()
      ? {
          OR: [
            {
              name: {
                contains: filters.search,
                mode: 'insensitive' as const,
              },
            },
            {
              projectCode: {
                contains: filters.search,
                mode: 'insensitive' as const,
              },
            },
          ],
        }
      : {};

    const projects = await this.prisma.project.findMany({
      where: { companyId, deletedAt: null, ...whereStatus, ...whereSearch },
      orderBy: { projectCode: 'asc' },
    });

    const generatedAt = new Date();
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

    const buffer = await renderPayslipPdf(
      { title: 'Project Register Export', layout: 'landscape' },
      (p) => {
        p.brand(bilingualTitle('Project Register Export', '项目台账'));
        p.subtitleRight(`${projects.length} project(s)`);
        p.rule();

        p.section('SUMMARY');
        p.fields([
          ['Total projects', String(projects.length)],
          ['Total budget (USD)', fmtEtb(totalBudget)],
          ['Filters', filterDesc],
        ]);

        p.rule();
        p.section('PROJECTS', 'Progress');
        if (projects.length === 0) {
          p.line('No projects', { indent: 1, color: '#333333' });
        } else {
          for (const project of projects) {
            p.field(
              `${project.projectCode ?? '-'} · ${project.name ?? '-'}`,
              project.overallProgressPct != null
                ? `${project.overallProgressPct}%`
                : '-',
              1,
            );
            p.wrapped(
              [
                project.projectType ?? null,
                project.status ?? null,
                project.budget != null
                  ? `${Number(project.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${project.currency ?? ''}`
                  : null,
                `Start ${fmtDate(project.startDate)}`,
                `Finish ${fmtDate(project.plannedFinishDate)}`,
                project.client ? `Client ${project.client}` : null,
                project.responsibleDepartment
                  ? `Dept ${project.responsibleDepartment}`
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
              { indent: 24, size: 8 },
            );
          }
        }

        p.footerNotes([
          `Generated ${fmtGeneratedDate(generatedAt)}`,
          'This project register export is system-generated.',
        ]);
      },
    );

    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `projects-export_${dateStamp}.pdf`,
    };
  }
}
