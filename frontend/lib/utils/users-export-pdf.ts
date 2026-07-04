import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { User } from '@/lib/api/types';
import { formatUserDisciplineLabel } from '@/lib/constants/user-discipline';
import { formatUserName } from '@/lib/utils/user-display';

const TEAL: [number, number, number] = [16, 152, 138];
const NAVY: [number, number, number] = [27, 43, 75];
const MUTED: [number, number, number] = [111, 114, 119];
const BORDER: [number, number, number] = [229, 231, 235];
const PAGE_MARGIN = 14;

export interface UsersExportPdfLabels {
  title: string;
  subtitle: string;
  preparedBy: string;
  generatedAt: string;
  summary: string;
  statusBreakdown: string;
  rolesBreakdown: string;
  directory: string;
  metric: string;
  value: string;
  status: string;
  count: string;
  share: string;
  role: string;
  name: string;
  email: string;
  phone: string;
  roles: string;
  discipline: string;
  lastLogin: string;
  footer: string;
  totalUsers: string;
  activeUsers: string;
  pendingUsers: string;
  inactiveUsers: string;
  noRole: string;
}

export interface UsersExportSummary {
  total: number;
  active: number;
  pending: number;
  inactive: number;
}

interface UsersExportPdfInput {
  companyName: string;
  generatedAt: string;
  preparedBy: string;
  labels: UsersExportPdfLabels;
  users: User[];
  summary: UsersExportSummary;
  formatUserStatus: (user: User) => string;
  formatUserRoles: (user: User) => string;
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

function formatLastLogin(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

function computeRoleBreakdown(
  users: User[],
  noRoleLabel: string,
): { role: string; count: number }[] {
  const counts = new Map<string, number>();

  for (const user of users) {
    const roleNames = user.userRoles?.map((assignment) => assignment.role.name) ?? [];
    if (roleNames.length === 0) {
      counts.set(noRoleLabel, (counts.get(noRoleLabel) ?? 0) + 1);
      continue;
    }
    for (const roleName of roleNames) {
      counts.set(roleName, (counts.get(roleName) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role));
}

export function computeUsersExportSummary(users: User[]): UsersExportSummary {
  let active = 0;
  let pending = 0;
  let inactive = 0;

  for (const user of users) {
    if (!user.isActive) {
      inactive += 1;
    } else if (!user.emailVerifiedAt) {
      pending += 1;
    } else {
      active += 1;
    }
  }

  return {
    total: users.length,
    active,
    pending,
    inactive,
  };
}

/**
 * Generates a structured PDF export of the company user directory.
 */
export function exportUsersPdf(input: UsersExportPdfInput): void {
  const {
    companyName,
    generatedAt,
    preparedBy,
    labels,
    users,
    summary,
    formatUserStatus,
    formatUserRoles,
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
  doc.text(companyName, PAGE_MARGIN, 21);
  doc.setFontSize(8);
  doc.text(labels.subtitle, PAGE_MARGIN, 27);

  y = 40;
  doc.setTextColor(...MUTED);
  doc.setFontSize(8);
  doc.text(
    `${labels.generatedAt}: ${new Date(generatedAt).toLocaleString()}`,
    PAGE_MARGIN,
    y,
  );
  doc.text(`${labels.preparedBy}: ${preparedBy}`, pageWidth / 2, y);
  y += 8;

  y = drawSectionTitle(doc, labels.summary, y);
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
      [labels.totalUsers, String(summary.total)],
      [labels.activeUsers, String(summary.active)],
      [labels.pendingUsers, String(summary.pending)],
      [labels.inactiveUsers, String(summary.inactive)],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.statusBreakdown, y);
  const statusRows = [
    [labels.activeUsers, String(summary.active), pct(summary.active, summary.total)],
    [labels.pendingUsers, String(summary.pending), pct(summary.pending, summary.total)],
    [labels.inactiveUsers, String(summary.inactive), pct(summary.inactive, summary.total)],
  ];
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'striped',
    headStyles: { fillColor: TEAL, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    head: [[labels.status, labels.count, labels.share]],
    body: summary.total > 0 ? statusRows : [['-', '0', '0%']],
  });
  y = doc.lastAutoTable.finalY + 8;

  const roleBreakdown = computeRoleBreakdown(users, labels.noRole);
  y = ensureSpace(doc, y, 40);
  y = drawSectionTitle(doc, labels.rolesBreakdown, y);
  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'striped',
    headStyles: { fillColor: TEAL, fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    head: [[labels.role, labels.count, labels.share]],
    body:
      roleBreakdown.length > 0
        ? roleBreakdown.map((row) => [
            row.role,
            String(row.count),
            pct(row.count, summary.total),
          ])
        : [['-', '0', '0%']],
  });
  y = doc.lastAutoTable.finalY + 8;

  y = ensureSpace(doc, y, 30);
  y = drawSectionTitle(doc, labels.directory, y);
  const directoryRows = [...users]
    .sort((a, b) => {
      const last = a.lastName.localeCompare(b.lastName);
      if (last !== 0) {
        return last;
      }
      return a.firstName.localeCompare(b.firstName);
    })
    .map((user) => [
      formatUserName(user),
      user.email?.trim() || '-',
      user.phone?.trim() || '-',
      formatUserStatus(user),
      formatUserRoles(user),
      formatUserDisciplineLabel(user.discipline),
      formatLastLogin(user.lastLogin),
    ]);

  autoTable(doc, {
    startY: y,
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    theme: 'striped',
    headStyles: { fillColor: NAVY, fontSize: 7 },
    bodyStyles: { fontSize: 7 },
    styles: { overflow: 'linebreak', cellWidth: 'wrap' },
    head: [
      [
        labels.name,
        labels.email,
        labels.phone,
        labels.status,
        labels.roles,
        labels.discipline,
        labels.lastLogin,
      ],
    ],
    body: directoryRows.length > 0 ? directoryRows : [['-', '-', '-', '-', '-', '-', '-']],
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    doc.text(
      `${labels.footer} — ${labels.title} — Page ${page} of ${pageCount}`,
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
    );
  }

  const dateStamp = new Date(generatedAt).toISOString().slice(0, 10);
  const safeCompany = companyName.replace(/[^a-zA-Z0-9-_]/g, '_');
  doc.save(`users_${safeCompany}_${dateStamp}.pdf`);
}

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}
