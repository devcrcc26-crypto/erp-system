import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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

const TEAL: [number, number, number] = [16, 152, 138];
const NAVY: [number, number, number] = [27, 43, 75];
const MUTED: [number, number, number] = [111, 114, 119];
const BORDER: [number, number, number] = [229, 231, 235];
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
  doc.setFillColor(...BORDER);
  doc.rect(PAGE_MARGIN, y, doc.internal.pageSize.getWidth() - PAGE_MARGIN * 2, 7, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...NAVY);
  doc.text(title.toUpperCase(), PAGE_MARGIN + 2, y + 5);
  return y + 11;
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
export function exportProjectReportPdf(input: ProjectReportPdfInput): void {
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
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = PAGE_MARGIN;

  doc.setFillColor(...TEAL);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(labels.title, PAGE_MARGIN, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(project.name, PAGE_MARGIN, 21);
  doc.setFontSize(8);
  doc.text(`${project.projectCode} · ${labels.subtitle}`, PAGE_MARGIN, 27);

  y = 40;
  doc.setTextColor(...MUTED);
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
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8, cellPadding: 2 },
    bodyStyles: { fontSize: 8, cellPadding: 2 },
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
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
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
    theme: 'grid',
    headStyles: { fillColor: NAVY, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
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
      theme: 'grid',
      headStyles: { fillColor: NAVY, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
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
    theme: 'striped',
    headStyles: { fillColor: TEAL, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    head: [[labels.metric, labels.count, labels.share]],
    body: breakdownTableBody(taskStatusRows),
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.siteOpsBreakdown, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'striped',
    headStyles: { fillColor: TEAL, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
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
      theme: 'striped',
      headStyles: { fillColor: TEAL, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
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
      theme: 'striped',
      headStyles: { fillColor: TEAL, fontSize: 8 },
      bodyStyles: { fontSize: 8 },
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
    theme: 'striped',
    headStyles: { fillColor: NAVY, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
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
    doc.setTextColor(...MUTED);
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
