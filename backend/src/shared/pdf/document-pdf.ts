import { formatEnglishName } from '../utils/user-display.util';
import {
  PayslipPdfPainter,
  bilingualTitle,
  dash,
  fmtGeneratedDate,
  renderPayslipPdf,
} from './payslip-style-pdf';

/**
 * One layout for every exported record and report: header (number, status,
 * printed date), optional boxed headline, employee block with the company
 * employee ID, field sections, column tables, approval chain, attachments,
 * notes, and "number · page X of Y" on every page.
 *
 * Build a `DocumentPdfSpec` and call `renderDocumentPdf`. Documents that need
 * something extra (the gate pass stamp box) compose the exported pieces.
 */

export const DOC_INK = '#1A1A1A';
export const DOC_MUTED = '#555555';
export const DOC_HAIRLINE = '#BBBBBB';

export type DocValue = string | number | null | undefined;

export interface DocPerson {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  chineseName?: string | null;
  email?: string | null;
  /** Company employee number (User.employeeId), not the internal user id. */
  employeeId?: string | null;
}

export interface DocTableColumn {
  header: string;
  /** Relative width; columns share the space left after the No. column. */
  weight: number;
  align?: 'left' | 'right';
}

export interface DocTableRow {
  cells: DocValue[];
  /** Small muted line under one cell (see `DocTable.subColumn`). */
  sub?: string | null;
}

export interface DocTable {
  title: string;
  columns: DocTableColumn[];
  rows: DocTableRow[];
  totals?: ReadonlyArray<readonly [string, string]>;
  emptyText?: string;
  /** Leading "No." column. Defaults to true. */
  numbered?: boolean;
  /** Trailing empty "Checked" box per row, for gate checks. */
  checkColumn?: boolean;
  /** Column that carries each row's `sub` line. Defaults to 0. */
  subColumn?: number;
  /** Append the row count to the title. Defaults to `numbered`. */
  countInTitle?: boolean;
}

export interface DocTier {
  tierOrder: number;
  label: string;
  decision: string;
  decidedAt?: Date | string | null;
  comment?: string | null;
  approver?: DocPerson | null;
}

export interface DocSection {
  title: string;
  /** Short label/value rows. Long values wrap as "Label: value". */
  rows?: ReadonlyArray<readonly [string, DocValue]>;
  /** Label on its own line, then the text wrapped underneath. */
  paragraphs?: ReadonlyArray<readonly [string, DocValue]>;
}

export interface DocHero {
  headline: string;
  caption?: string | null;
  dateLabel?: string;
  date?: string | null;
}

export interface DocumentPdfSpec {
  title: string;
  titleZh?: string | null;
  /** Request / record number shown in the header and every page footer. */
  number: string;
  /** Printed before `number` in the header. Defaults to "No. "; reports pass "". */
  numberPrefix?: string;
  status?: string | null;
  layout?: 'portrait' | 'landscape';
  hero?: DocHero;
  employee?: {
    person: DocPerson | null | undefined;
    department?: string | null;
    extraRows?: ReadonlyArray<readonly [string, DocValue]>;
  };
  sections?: DocSection[];
  tables?: DocTable[];
  /** Omit to skip the section; pass [] to print "no approval chain". */
  approvalTiers?: DocTier[] | null;
  documents?: string[];
  notes?: string[];
}

export function isoDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toISOString().slice(0, 10);
}

/** "SUBMITTED" -> "Submitted", "IN_PROGRESS" -> "In progress". */
export function humanize(value: string | null | undefined): string {
  if (!value) return '-';
  const text = value.toLowerCase().replace(/_/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function yesNo(value: boolean | null | undefined): string {
  if (value == null) return '-';
  return value ? 'Yes / 是' : 'No / 否';
}

/** English name (first, middle, last) with the Chinese name in brackets. */
export function personName(person: DocPerson | null | undefined): string {
  if (!person) return '-';
  const english = formatEnglishName(person);
  const chinese = person.chineseName?.trim();
  if (english && chinese) return `${english} (${chinese})`;
  return english || chinese || '-';
}

/** Company employee number; never falls back to the internal user id. */
export function personEmployeeId(person: DocPerson | null | undefined): string {
  return dash(person?.employeeId);
}

/** Prisma select for a person printed on a document. */
export const DOC_PERSON_SELECT = {
  firstName: true,
  middleName: true,
  lastName: true,
  chineseName: true,
  email: true,
  employeeId: true,
} as const;

/** Person plus their department, for the Employee block. */
export const DOC_EMPLOYEE_SELECT = {
  ...DOC_PERSON_SELECT,
  department: { select: { name: true } },
} as const;

/** Prisma include for an approval chain printed on a document. */
export const DOC_APPROVAL_INCLUDE = {
  include: {
    tiers: {
      orderBy: { tierOrder: 'asc' as const },
      include: { approver: { select: DOC_PERSON_SELECT } },
    },
  },
} as const;

/** Missing values print as "-"; an explicit '' stays blank (continuation rows). */
function text(value: DocValue): string {
  if (value == null) return '-';
  if (value === '') return '';
  const s = String(value).trim();
  return s ? s : '-';
}

export function docHline(
  p: PayslipPdfPainter,
  x1: number,
  x2: number,
  y: number,
  color = DOC_INK,
  width = 0.6,
): void {
  p.doc.save().strokeColor(color).lineWidth(width).moveTo(x1, y).lineTo(x2, y).stroke().restore();
}

export function docHeader(
  p: PayslipPdfPainter,
  spec: Pick<DocumentPdfSpec, 'title' | 'titleZh' | 'number' | 'numberPrefix' | 'status'>,
): void {
  p.brand(bilingualTitle(spec.title, spec.titleZh));
  const parts = [`${spec.numberPrefix ?? 'No. '}${spec.number}`];
  if (spec.status) parts.push(humanize(spec.status));
  parts.push(`Printed ${fmtGeneratedDate(new Date())}`);
  p.subtitleRight(parts.join('  ·  '));
  p.rule();
}

/** Bordered box: large headline on the left, a labelled date on the right. */
export function docHero(p: PayslipPdfPainter, hero: DocHero): void {
  const { doc } = p;
  const hasDate = Boolean(hero.dateLabel || hero.date);
  const headW = (hasDate ? p.width * 0.62 : p.width) - 24;

  let size = 20;
  for (const candidate of [20, 17, 14, 12]) {
    size = candidate;
    doc.fontSize(candidate);
    if (doc.widthOfString(hero.headline) <= headW) break;
  }
  doc.fontSize(size);
  const headH = doc.heightOfString(hero.headline, { width: headW, lineGap: 1 });
  doc.fontSize(9);
  const capH = hero.caption ? doc.heightOfString(hero.caption, { width: headW }) + 4 : 0;
  const boxH = Math.max(50, headH + capH + 24);

  p.ensure(boxH + 12);
  const top = p.y;
  doc.save().lineWidth(1.2).strokeColor(DOC_INK).rect(p.left, top, p.width, boxH).stroke().restore();
  const contentTop = top + (boxH - headH - capH) / 2;
  const headBottom = p.text(hero.headline, p.left + 12, contentTop, headW, { size });
  if (hero.caption) {
    p.text(hero.caption, p.left + 12, headBottom + 2, headW, { size: 9, color: DOC_MUTED });
  }
  if (hasDate) {
    const dateX = p.left + p.width * 0.62;
    const dateW = p.width * 0.38 - 12;
    p.text(hero.dateLabel ?? '', dateX, top + boxH / 2 - 16, dateW, {
      size: 8,
      align: 'right',
      color: DOC_MUTED,
    });
    p.text(text(hero.date), dateX, top + boxH / 2 - 3, dateW, { size: 14, align: 'right' });
  }
  p.y = top + boxH + 12;
}

export function docSection(p: PayslipPdfPainter, section: DocSection): void {
  const rows = section.rows ?? [];
  const paragraphs = (section.paragraphs ?? []).filter(([, v]) => text(v) !== '-');
  if (rows.length === 0 && paragraphs.length === 0) return;
  p.section(section.title);
  for (const [label, value] of rows) {
    p.field(label, text(value), 1);
  }
  for (const [label, value] of paragraphs) {
    p.line(label, { indent: 1 });
    p.wrapped(text(value), { indent: 24, size: 8.5 });
  }
}

export function docEmployee(
  p: PayslipPdfPainter,
  employee: NonNullable<DocumentPdfSpec['employee']>,
): void {
  docSection(p, {
    title: 'Employee / 员工',
    rows: [
      ['Name / 姓名', personName(employee.person)],
      ['Employee ID / 工号', personEmployeeId(employee.person)],
      ...(employee.department !== undefined
        ? ([['Department / 部门', employee.department]] as const)
        : []),
      ['Email / 邮箱', employee.person?.email],
      ...(employee.extraRows ?? []),
    ],
  });
}

/**
 * Column table with optional No. and Checked columns. Headings repeat on each
 * new page; the first cell can carry a muted sub-line.
 */
export function docTable(p: PayslipPdfPainter, table: DocTable): void {
  const { doc } = p;
  const numbered = table.numbered ?? true;
  p.section((table.countInTitle ?? numbered) ? `${table.title} (${table.rows.length})` : table.title);

  const noW = numbered ? 24 : 0;
  const checkW = table.checkColumn ? 40 : 0;
  const free = p.width - noW - checkW;
  const weightSum = table.columns.reduce((sum, c) => sum + c.weight, 0) || 1;
  const widths = table.columns.map((c) => (free * c.weight) / weightSum);
  const xs: number[] = [];
  let x = p.left + noW;
  for (const w of widths) {
    xs.push(x);
    x += w;
  }
  const pad = 6;

  const drawHeader = (): void => {
    const headY = p.y;
    let bottom = headY + 10;
    if (numbered) {
      bottom = Math.max(bottom, p.text('No.', p.left, headY, noW, { size: 7.5, color: DOC_MUTED }));
    }
    table.columns.forEach((col, i) => {
      bottom = Math.max(
        bottom,
        p.text(col.header, xs[i], headY, widths[i] - pad, {
          size: 7.5,
          color: DOC_MUTED,
          align: col.align ?? 'left',
        }),
      );
    });
    if (table.checkColumn) {
      p.text('Checked', p.right - checkW, headY, checkW, { size: 7.5, color: DOC_MUTED, align: 'right' });
    }
    p.y = bottom + 3;
    docHline(p, p.left, p.right, p.y, DOC_INK, 0.7);
  };
  const pageCount = (): number => doc.bufferedPageRange().count;

  p.ensure(50);
  drawHeader();

  table.rows.forEach((row, index) => {
    const pagesBefore = pageCount();
    p.ensure(30);
    if (pageCount() !== pagesBefore) drawHeader();

    const top = p.y + 4;
    let bottom = top + 12;
    if (numbered) {
      bottom = Math.max(bottom, p.text(String(index + 1), p.left, top, noW, { size: 9 }));
    }
    table.columns.forEach((col, i) => {
      let cellBottom = p.text(text(row.cells[i]), xs[i], top, widths[i] - pad, {
        size: 9,
        align: col.align ?? 'left',
      });
      if (i === (table.subColumn ?? 0) && row.sub?.trim()) {
        cellBottom = p.text(row.sub.trim(), xs[i], cellBottom, widths[i] - pad, {
          size: 7.5,
          color: DOC_MUTED,
        });
      }
      bottom = Math.max(bottom, cellBottom);
    });
    if (table.checkColumn) {
      doc.save().lineWidth(0.7).strokeColor(DOC_INK).rect(p.right - 11, top + 1, 9, 9).stroke().restore();
    }
    p.y = bottom + 4;
    docHline(p, p.left, p.right, p.y, DOC_HAIRLINE, 0.4);
  });

  if (table.rows.length === 0) {
    p.line(table.emptyText ?? 'Nothing recorded / 无记录', { color: DOC_MUTED });
  }
  if (table.totals?.length) {
    p.y += 4;
    for (const [label, value] of table.totals) {
      p.field(label, value);
    }
  }
}

export function docApprovalChain(
  p: PayslipPdfPainter,
  tiers: DocTier[],
  status: string | null | undefined,
): void {
  p.section('Approval chain / 审批流程');
  if (tiers.length === 0) {
    p.line(
      status === 'APPROVED'
        ? 'Approved directly, no approval chain / 直接批准'
        : 'Not submitted for approval yet / 尚未提交审批',
      { indent: 1, color: DOC_MUTED },
    );
    return;
  }
  for (const tier of [...tiers].sort((a, b) => a.tierOrder - b.tierOrder)) {
    const decided = tier.decidedAt ? `  ·  ${isoDate(tier.decidedAt)}` : '';
    p.field(
      `${tier.tierOrder}. ${tier.label} — ${personName(tier.approver)}`,
      `${humanize(tier.decision)}${decided}`,
      1,
    );
    if (tier.comment?.trim()) {
      p.wrapped(`“${tier.comment.trim()}”`, { indent: 24, size: 8 });
    }
  }
}

export function docDocuments(p: PayslipPdfPainter, names: string[]): void {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length === 0) return;
  p.section('Attachments / 附件');
  for (const name of clean) {
    p.line(`•  ${name}`, { indent: 1, color: '#333333' });
  }
}

/**
 * Number and page count on every page. Call last: the bottom margin is lifted
 * while stamping because PDFKit opens a new page for text placed inside it.
 */
export function docPageFooters(p: PayslipPdfPainter, number: string): void {
  const { doc } = p;
  const { start, count } = doc.bufferedPageRange();
  for (let i = 0; i < count; i++) {
    doc.switchToPage(start + i);
    const savedBottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    p.text(`${number}  ·  Page ${i + 1} of ${count}`, p.left, doc.page.height - savedBottom + 10, p.width, {
      size: 7,
      align: 'right',
      color: DOC_MUTED,
    });
    doc.page.margins.bottom = savedBottom;
  }
}

export function drawDocument(p: PayslipPdfPainter, spec: DocumentPdfSpec): void {
  docHeader(p, spec);
  if (spec.hero) docHero(p, spec.hero);
  if (spec.employee) docEmployee(p, spec.employee);
  for (const section of spec.sections ?? []) docSection(p, section);
  for (const table of spec.tables ?? []) docTable(p, table);
  if (spec.approvalTiers) docApprovalChain(p, spec.approvalTiers, spec.status);
  docDocuments(p, spec.documents ?? []);
  p.footerNotes(spec.notes?.length ? spec.notes : ['This document is system-generated. / 本文件由系统生成。']);
  docPageFooters(p, spec.number);
}

export function renderDocumentPdf(spec: DocumentPdfSpec): Promise<Buffer> {
  return renderPayslipPdf(
    { title: `${spec.title} ${spec.number}`, layout: spec.layout },
    (p) => drawDocument(p, spec),
  );
}

/** Filename-safe version of a record number. */
export function safeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9-_]/g, '_');
}
