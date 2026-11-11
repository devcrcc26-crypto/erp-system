import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDF_FONT, registerCjkFont } from '@/lib/utils/pdf-font';
import type { Project, ProjectStatus } from '@/lib/api/project-management.types';
import {
  formatProjectBudget,
  formatProjectDate,
  formatProjectDesignProperties,
  formatProjectDesignStage,
  formatProjectResponsibleDepartment,
  formatProjectStatus,
  formatProjectType,
} from '@/lib/utils/project-display';
import { formatDisplayDateTime } from '@/lib/utils/date-format';

const PAGE_MARGIN = 14;

interface ProjectsExportPdfInput {
  companyName: string;
  generatedAt: string;
  preparedBy: string;
  projects: Project[];
  filters?: {
    search?: string;
    status?: string;
  };
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

function statusBreakdown(projects: Project[]): { status: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const project of projects) {
    const status = formatProjectStatus(project.status);
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

function totalBudget(projects: Project[]): number {
  return projects.reduce((sum, project) => {
    const amount = Number(project.budget);
    return Number.isFinite(amount) ? sum + amount : sum;
  }, 0);
}

/**
 * Generates a structured PDF export of the project register.
 */
export async function exportProjectsPdf(input: ProjectsExportPdfInput): Promise<void> {
  const { companyName, generatedAt, preparedBy, projects, filters } = input;
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  await registerCjkFont(doc);
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = PAGE_MARGIN;

  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);
  doc.text(companyName, PAGE_MARGIN, PAGE_MARGIN);
  doc.setFont(PDF_FONT, 'bold');
  doc.setFontSize(14);
  doc.text('Project Register Export', PAGE_MARGIN, PAGE_MARGIN + 7);
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(PAGE_MARGIN, PAGE_MARGIN + 12, pageWidth - PAGE_MARGIN, PAGE_MARGIN + 12);
  y = PAGE_MARGIN + 18;

  doc.setTextColor(120, 120, 120);
  doc.setFont(PDF_FONT, 'normal');
  doc.setFontSize(8);
  doc.text(`Generated: ${formatDisplayDateTime(generatedAt)}`, PAGE_MARGIN, y);
  doc.text(`Prepared by: ${preparedBy}`, pageWidth / 2, y);
  y += 8;

  const activeFilters = [
    filters?.search ? `Search: ${filters.search}` : null,
    filters?.status
      ? `Status: ${filters.status
          .split(',')
          .map((s) => formatProjectStatus(s.trim() as ProjectStatus))
          .join(', ')}`
      : null,
  ].filter(Boolean);

  y = drawSectionTitle(doc, 'Summary', y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3, cellPadding: 2 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40], cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 80, fontStyle: 'bold' },
      1: { halign: 'right' },
    },
    head: [['Metric', 'Value']],
    body: [
      ['Total projects', String(projects.length)],
      ['Total budget', formatProjectBudget(String(totalBudget(projects)), 'USD')],
      ['Filters', activeFilters.length > 0 ? activeFilters.join(', ') : 'None'],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 38);
  y = drawSectionTitle(doc, 'Status Breakdown', y);
  const breakdown = statusBreakdown(projects);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2 },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 8, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 8, textColor: [40, 40, 40] },
    head: [['Status', 'Count', 'Share']],
    body:
      breakdown.length > 0
        ? breakdown.map((row) => [row.status, String(row.count), pct(row.count, projects.length)])
        : [['-', '0', '0%']],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 30);
  y = drawSectionTitle(doc, 'Projects', y);
  const rows = [...projects]
    .sort((a, b) => a.projectCode.localeCompare(b.projectCode))
    .map((project) => [
      project.projectCode,
      project.name,
      formatProjectType(project.projectType),
      formatProjectStatus(project.status),
      project.client ?? '-',
      formatProjectResponsibleDepartment(project.responsibleDepartment),
      formatProjectDesignProperties(project.designProperties),
      formatProjectDesignStage(project.designStage),
      project.location ?? '-',
      formatProjectDate(project.startDate),
      formatProjectDate(project.plannedFinishDate),
      formatProjectBudget(project.budget, project.currency),
      `${project.overallProgressPct}%`,
    ]);

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'plain',
    styles: { font: PDF_FONT, lineColor: [180, 180, 180], lineWidth: 0.2, overflow: 'linebreak', cellWidth: 'wrap' },
    headStyles: { font: PDF_FONT, fillColor: [255, 255, 255], textColor: [0, 0, 0], fontStyle: 'bold', fontSize: 6.5, lineColor: [180, 180, 180], lineWidth: 0.3 },
    bodyStyles: { font: PDF_FONT, fontSize: 6.5, textColor: [40, 40, 40] },
    head: [
      [
        'Code',
        'Name',
        'Type',
        'Status',
        'Client',
        'Department',
        'Design properties',
        'Design stage',
        'Location',
        'Start',
        'Planned finish',
        'Budget',
        'Progress',
      ],
    ],
    body:
      rows.length > 0
        ? rows
        : [['-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(120, 120, 120);
    doc.text(
      `ERP System - Project Register Export - Page ${page} of ${pageCount}`,
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  const dateStamp = new Date(generatedAt).toISOString().slice(0, 10);
  const safeCompany = companyName.replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`projects_${safeCompany}_${dateStamp}.pdf`);
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
