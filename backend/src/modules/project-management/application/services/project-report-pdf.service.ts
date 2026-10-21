import { Injectable, NotFoundException } from '@nestjs/common';
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

const COMPANY_NAME = 'CRCC International Consulting';

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

    // Aggregate site ops counts
    const [openRfis, overdueRfis, openIssues, openPunchItems] = await Promise.all([
      this.prisma.rfi.count({ where: { projectId, status: { notIn: ['CLOSED', 'VOID'] as any }, deletedAt: null } }).catch(() => 0),
      this.prisma.rfi.count({ where: { projectId, status: { notIn: ['CLOSED', 'VOID'] as any }, dueDate: { lt: new Date() }, deletedAt: null } }).catch(() => 0),
      this.prisma.issue.count({ where: { projectId, status: { not: 'CLOSED' as any }, deletedAt: null } }).catch(() => 0),
      this.prisma.punchItem.count({ where: { projectId, status: { not: 'CLOSED' as any }, deletedAt: null } }).catch(() => 0),
    ]);

    // Task status breakdown
    const taskGroups = await this.prisma.task
      .groupBy({ by: ['status'], where: { projectId, deletedAt: null }, _count: { _all: true } })
      .catch(() => []);
    const taskCount = taskGroups.reduce((s, g) => s + g._count._all, 0);

    const fontPath = resolveFontPath();
    const generatedAt = new Date();
    const doc = createDoc('Project Report');
    const footerLeft = `${COMPANY_NAME} — Project Report ${project.projectCode}`;

    const buffer = await docToBuffer(doc, fontPath, (d) => {
      let y = drawPageHeader(d, COMPANY_NAME, 'Project Report', project.name);
      y = drawMeta(d, y, fmtTs(generatedAt), '');
      y += 6;

      y = ensureSpace(d, y, 40);
      y = drawSectionTitle(d, 'Project Overview', y);
      y = drawKvTable(d, [
        ['Project Code', project.projectCode],
        ['Name', project.name],
        ['Status', project.status],
        ['Type', (project as any).projectType ?? '-'],
        ['Planned Finish', fmtDate(project.plannedFinishDate)],
        ['Budget', project.budget != null ? `${Number(project.budget).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${(project as any).currency ?? ''}` : '-'],
        ['Overall Progress', project.overallProgressPct != null ? `${project.overallProgressPct}%` : '-'],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 35);
      y = drawSectionTitle(d, 'Site Operations', y);
      y = drawKvTable(d, [
        ['Open RFIs', String(openRfis)],
        ['Overdue RFIs', String(overdueRfis)],
        ['Open Issues', String(openIssues)],
        ['Open Punch Items', String(openPunchItems)],
      ], y);
      y += 8;

      y = ensureSpace(d, y, 35);
      y = drawSectionTitle(d, 'Tasks by Status', y);
      if (taskGroups.length > 0) {
        const colW = [CW * 0.5, CW * 0.25, CW * 0.25];
        const statusRows = taskGroups.map((g) => [
          String(g.status),
          String(g._count._all),
          taskCount > 0 ? `${Math.round((g._count._all / taskCount) * 100)}%` : '0%',
        ]);
        y = drawItemsTable(d, ['Status', 'Count', 'Share'], statusRows, colW, y);
      } else {
        y = drawKvTable(d, [['Tasks', `${taskCount}`]], y);
      }
    }, footerLeft);

    const safe = project.projectCode.replace(/[^a-zA-Z0-9-_]/g, '_');
    const dateStamp = generatedAt.toISOString().slice(0, 10);
    return {
      buffer,
      mimeType: 'application/pdf',
      filename: `project-report_${safe}_${dateStamp}.pdf`,
    };
  }
}
