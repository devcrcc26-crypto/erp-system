import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDF_FONT, registerCjkFont } from '@/lib/utils/pdf-font';
import type { Project, ProjectStatus, ProjectType } from '@/lib/api/project-management.types';
import type {
  PortfolioSummary,
  SystemReportPdfLabels,
} from '@/lib/api/reporting.types';
import {
  formatProjectBudget,
  formatProjectDate,
  formatProjectStatus,
  formatProjectType,
} from '@/lib/utils/project-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';

const PAGE_MARGIN = 14;

interface SystemReportPdfInput {
  summary: PortfolioSummary;
  projects: Project[];
  preparedBy: string;
  labels: SystemReportPdfLabels;
  formatStatusLabel: (status: string) => string;
  formatTypeLabel: (type: string) => string;
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

/**
 * Generates a structured multi-section PDF for the company system report.
 */
export async function exportSystemReportPdf(input: SystemReportPdfInput): Promise<void> {
  const { summary, projects, preparedBy, labels, formatStatusLabel, formatTypeLabel } =
    input;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  await registerCjkFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = PAGE_MARGIN;

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(summary.companyName, PAGE_MARGIN, PAGE_MARGIN);
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
    `${labels.generatedAt}: ${formatDisplayDateTime(summary.generatedAt)}`,
    PAGE_MARGIN,
    y,
  );
  doc.text(`${labels.preparedBy}: ${preparedBy}`, pageWidth / 2, y);
  y += 8;

  y = drawSectionTitle(doc, labels.executiveSummary, y);
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
      [labels.portfolio, String(summary.projects.total)],
      [
        labels.organization,
        `${summary.organization.branches} ${labels.branches} · ${summary.organization.departments} ${labels.departments}`,
      ],
      [labels.completionRate, `${summary.completionRate}%`],
      [
        labels.averageProgress,
        summary.projects.averageProgressPct != null
          ? `${summary.projects.averageProgressPct}%`
          : '-',
      ],
      [
        labels.portfolioBudget,
        summary.projects.totalBudget
          ? formatProjectBudget(summary.projects.totalBudget, summary.baseCurrency)
          : '-',
      ],
      [labels.activeProjects, String(summary.projects.active)],
      [labels.totalOpenSiteOps, String(summary.siteOps.totalOpen)],
      [labels.auditLast30Days, String(summary.audit.last30Days)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, `${labels.portfolio} - ${labels.byStatus}`, y);
  const statusRows = Object.entries(summary.projects.byStatus)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => [
      formatStatusLabel(status),
      String(count),
      pct(count, summary.projects.total),
    ]);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.status, labels.count, labels.share]],
    body: statusRows.length > 0 ? statusRows : [['-', '0', '0%']],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, `${labels.portfolio} - ${labels.byType}`, y);
  const typeRows = Object.entries(summary.projects.byType)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => [
      formatTypeLabel(type),
      String(count),
      pct(count, summary.projects.total),
    ]);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.type, labels.count, labels.share]],
    body: typeRows.length > 0 ? typeRows : [['-', '0', '0%']],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.organization, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.metric, labels.value]],
    body: [
      [labels.branches, String(summary.organization.branches)],
      [labels.departments, String(summary.organization.departments)],
      [labels.usersTotal, String(summary.users.total)],
      [labels.usersActive, String(summary.users.active)],
      [labels.usersInactive, String(summary.users.inactive)],
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
      [labels.openRfis, String(summary.siteOps.openRfis)],
      [labels.overdueRfis, String(summary.siteOps.overdueRfis)],
      [labels.openIssues, String(summary.siteOps.openIssues)],
      [labels.openPunchItems, String(summary.siteOps.openPunchItems)],
      [labels.totalOpenSiteOps, String(summary.siteOps.totalOpen)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.audit, y);
  const moduleRows =
    summary.audit.topModules.length > 0
      ? summary.audit.topModules.map((row) => [row.module, String(row.count)])
      : [['-', '0']];
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.metric, labels.value]],
    body: [
      [labels.auditLast30Days, String(summary.audit.last30Days)],
      [labels.auditTotal, String(summary.audit.total)],
    ],
  });
  y = doc.lastAutoTable.finalY + 6;
  y = ensureSpace(doc, y, 24);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);
  doc.text(labels.auditModules, PAGE_MARGIN, y);
  y += 5;
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [[labels.module, labels.count]],
    body: moduleRows,
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 30);
  y = drawSectionTitle(doc, labels.projectRegister, y);
  const projectRows = [...projects]
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode))
    .map((project) => [
      project.projectCode,
      project.name,
      formatProjectStatus(project.status as ProjectStatus),
      project.projectType
        ? formatProjectType(project.projectType as ProjectType)
        : '-',
      project.overallProgressPct != null ? `${project.overallProgressPct}%` : '-',
      formatProjectBudget(project.budget, project.currency),
      formatProjectDate(project.plannedFinishDate),
    ]);

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2, overflow: 'linebreak', cellWidth: 'wrap' },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 7, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 7, textColor: [40, 40, 40] },
    head: [
      [
        labels.code,
        labels.name,
        labels.status,
        labels.type,
        labels.progress,
        labels.budget,
        labels.plannedFinish,
      ],
    ],
    body:
      projectRows.length > 0
        ? projectRows
        : [['-', '-', '-', '-', '-', '-', '-']],
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

  const dateStamp = new Date(summary.generatedAt).toISOString().slice(0, 10);
  const safeCompany = summary.companyName.replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`system-report_${safeCompany}_${dateStamp}.pdf`);
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
