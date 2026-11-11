import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDF_FONT, registerCjkFont } from '@/lib/utils/pdf-font';
import type { Project } from '@/lib/api/project-management.types';
import type {
  ProjectReportPdfBreakdownRow,
  ProjectReportPdfLabels,
  ProjectReportPdfModuleRow,
} from '@/lib/api/reporting.types';
import {
  formatProjectBudget,
  formatProjectDate,
  formatProjectStatus,
} from '@/lib/utils/project-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';

const PAGE_MARGIN = 14;

interface ProjectReportPdfInput {
  project: Project;
  generatedAt: string;
  preparedBy: string;
  labels: ProjectReportPdfLabels;
  siteOps: {
    openRfis: number | null;
    overdueRfis: number | null;
    openIssues: number | null;
    openPunchItems: number | null;
  };
  schedule: {
    plannedProgressPct: number | null;
    actualProgressPct: number | null;
    scheduleVariancePct: number | null;
    taskCount: number;
    criticalCount: number;
  };
  engineering: {
    activeReviewSessions: number | null;
    slaOverdueSessions: number | null;
    openComments: number | null;
    pendingSubmittals: number | null;
  } | null;
  taskStatusRows: ProjectReportPdfBreakdownRow[];
  siteOpsRows: ProjectReportPdfBreakdownRow[];
  packageStatusRows: ProjectReportPdfBreakdownRow[];
  disciplineStatusRows: ProjectReportPdfBreakdownRow[];
  moduleSummaryRows: ProjectReportPdfModuleRow[];
  formatPercent: (value: number | null | undefined) => string;
  formatCount: (value: number | null | undefined) => string;
}

function pct(part: number, total: number): string {
  if (total <= 0) {
    return '0%';
  }
  return `${Math.round((part / total) * 100)}%`;
}

function drawSectionTitle(doc: jsPDF, title: string, y: number): number {
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(80, 80, 80);
  doc.text(title.toUpperCase(), PAGE_MARGIN, y + 4);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(PAGE_MARGIN, y + 6, doc.internal.pageSize.getWidth() - PAGE_MARGIN, y + 6);
  return y + 10;
}

function ensureSpace(doc: jsPDF, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - 16) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

function breakdownTableBody(
  rows: ProjectReportPdfBreakdownRow[],
): string[][] {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (rows.length === 0) {
    return [['-', '0', '0%']];
  }
  return rows.map((row) => [row.label, String(row.count), pct(row.count, total)]);
}

/**
 * Generates a structured multi-section PDF for a single project report.
 */
export async function exportProjectReportPdf(input: ProjectReportPdfInput): Promise<void> {
  const {
    project,
    generatedAt,
    preparedBy,
    labels,
    siteOps,
    schedule,
    engineering,
    taskStatusRows,
    siteOpsRows,
    packageStatusRows,
    disciplineStatusRows,
    moduleSummaryRows,
    formatPercent,
    formatCount,
  } = input;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerCjkFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = PAGE_MARGIN;

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(project.projectCode, PAGE_MARGIN, PAGE_MARGIN);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
  doc.text(labels.title, PAGE_MARGIN, PAGE_MARGIN + 7);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, PAGE_MARGIN + 12, pageWidth - PAGE_MARGIN, PAGE_MARGIN + 12);
  y = PAGE_MARGIN + 18;

  doc.setTextColor(120, 120, 120);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(8);
  doc.text(
    `${labels.generatedAt}: ${formatDisplayDateTime(generatedAt)}`,
    PAGE_MARGIN,
    y,
  );
  doc.text(`${labels.preparedBy}: ${preparedBy}`, pageWidth / 2, y);
  y += 8;

  y = drawSectionTitle(doc, labels.projectOverview, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 72, fontStyle: 'bold' },
      1: { halign: 'right' },
    },
    head: [[labels.metric, labels.value]],
    body: [
      [labels.projectCode, project.projectCode],
      [labels.projectName, project.name],
      [labels.status, formatProjectStatus(project.status)],
      [labels.plannedFinish, formatProjectDate(project.plannedFinishDate)],
      [
        labels.budget,
        formatProjectBudget(project.budget, project.currency),
      ],
      [
        labels.overallProgress,
        project.overallProgressPct != null ? `${project.overallProgressPct}%` : '-',
      ],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.siteOps, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.metric, labels.value]],
    body: [
      [labels.openRfis, formatCount(siteOps.openRfis)],
      [labels.overdueRfis, formatCount(siteOps.overdueRfis)],
      [labels.openIssues, formatCount(siteOps.openIssues)],
      [labels.openPunch, formatCount(siteOps.openPunchItems)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.schedule, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.metric, labels.value]],
    body: [
      [labels.plannedProgress, formatPercent(schedule.plannedProgressPct)],
      [labels.actualProgress, formatPercent(schedule.actualProgressPct)],
      [labels.scheduleVariance, formatPercent(schedule.scheduleVariancePct)],
      [labels.taskCount, String(schedule.taskCount)],
      [labels.criticalTasks, String(schedule.criticalCount)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  if (engineering) {
    y = ensureSpace(doc, y, 40);
    y = drawSectionTitle(doc, labels.engineering, y);
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'plain',
      styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
      bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
      head: [[labels.metric, labels.value]],
      body: [
        [labels.activeReviews, formatCount(engineering.activeReviewSessions)],
        [labels.slaOverdue, formatCount(engineering.slaOverdueSessions)],
        [labels.openComments, formatCount(engineering.openComments)],
        [labels.pendingSubmittals, formatCount(engineering.pendingSubmittals)],
      ],
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.tasksByStatus, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.metric, labels.count, labels.share]],
    body: breakdownTableBody(taskStatusRows),
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.siteOpsBreakdown, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.metric, labels.count, labels.share]],
    body: breakdownTableBody(siteOpsRows),
  });
  y = doc.lastAutoTable.finalY + 8;

  if (packageStatusRows.length > 0) {
    y = ensureSpace(doc, y, 40);
    y = drawSectionTitle(doc, labels.packagesByStatus, y);
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'plain',
      styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
      bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
      head: [[labels.metric, labels.count, labels.share]],
      body: breakdownTableBody(packageStatusRows),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (disciplineStatusRows.length > 0) {
    y = ensureSpace(doc, y, 40);
    y = drawSectionTitle(doc, labels.disciplinesByStatus, y);
    autoTable(doc, {
      startY: y,
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      theme: 'plain',
      styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
      headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
      bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
      head: [[labels.metric, labels.count, labels.share]],
      body: breakdownTableBody(disciplineStatusRows),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  y = ensureSpace(doc, y, 30);
  y = drawSectionTitle(doc, labels.moduleSummary, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.module, labels.snapshot]],
    body:
      moduleSummaryRows.length > 0
        ? moduleSummaryRows.map((row) => [row.module, row.snapshot])
        : [['-', '-']],
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `${labels.footer} - ${labels.title} - Page ${page} of ${pageCount}`,
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  const dateStamp = new Date(generatedAt).toISOString().slice(0, 10);
  const safeCode = project.projectCode.replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`project-report_${safeCode}_${dateStamp}.pdf`);
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
