import ExcelJS from 'exceljs';

/**
 * Shared Excel export toolkit for HR list pages.
 *
 * Column headers are the same English labels the list table shows, so an
 * exported file reads like the screen it came from. Enum codes are exported as
 * human-readable labels, dates as `YYYY-MM-DD`, and money in ETB.
 */

export interface HrExportColumn {
  header: string;
  key: string;
  width?: number;
}

export interface HrExportSheet {
  name: string;
  columns: HrExportColumn[];
  rows: Array<Record<string, string | number>>;
}

/** Same default as the HR PDF documents (`HR_PDF_COMPANY_NAME`). */
export const HR_EXPORT_COMPANY_NAME = 'CRCC International Consulting';

/*
 * Monochrome document layout, after the HR PDF documents (hr-document-pdf.ts):
 *
 *   COMPANY NAME                          (small, grey)
 *   Title                                 (large, bold)
 *   Subtitle                              (grey, optional)
 *   Generated  …   Prepared by  …   Records  …
 *   ─────────────────────────────────────  (solid black rule)
 *
 *   HEADER     HEADER         HEADER       (bold, black rule beneath)
 *   row ………………………………………………………………     (hairline dividers, no grid)
 *   Total                         1,234.00 (ETB columns only)
 *
 * Gridlines are hidden so the sheet reads like a page; the print footer
 * repeats the PDF's "Company - Title / Page x of y".
 */
const FONT = 'Arial';
const INK = 'FF111111';
const BODY = 'FF262626';
const MUTED = 'FF6B6B6B';
const HAIRLINE = 'FFD9D9D9';

const RULE_STRONG: Partial<ExcelJS.Border> = { style: 'medium', color: { argb: INK } };
const RULE_THIN: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: INK } };
const RULE_HAIR: Partial<ExcelJS.Border> = { style: 'hair', color: { argb: HAIRLINE } };

const MIN_COLUMN_WIDTH = 10;
const MAX_COLUMN_WIDTH = 48;
const MONEY_FORMAT = '#,##0.00';
const COUNT_FORMAT = '#,##0';
const DECIMAL_FORMAT = '#,##0.0#';

/** Money columns carry `(ETB)` in their header (see `exportEtb`). */
function isMoneyColumn(header: string): boolean {
  return /\(ETB\)/i.test(header);
}

/** Column letter for a 1-based index (1 → A, 27 → AA). */
function columnLetter(index: number): string {
  let letters = '';
  for (let value = index; value > 0; value = Math.floor((value - 1) / 26)) {
    letters = String.fromCharCode(65 + ((value - 1) % 26)) + letters;
  }
  return letters;
}

/** Width that fits the header and the longest value, within sensible bounds. */
function fittedWidth(column: HrExportColumn, rows: HrExportSheet['rows']): number {
  let longest = column.header.length;
  for (const row of rows) {
    const value = row[column.key];
    const text =
      typeof value === 'number'
        ? value.toLocaleString('en-US', { maximumFractionDigits: 2 })
        : String(value ?? '');
    longest = Math.max(longest, text.length);
  }
  const fitted = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, longest + 3));
  return column.width ? Math.max(column.width, Math.min(fitted, MAX_COLUMN_WIDTH)) : fitted;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** `26 Oct 2026, 09:05` */
function formatGeneratedAt(date: Date): string {
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Excel header/footer codes start with `&`, so literal ampersands are doubled. */
function footerText(value: string): string {
  return value.replace(/&/g, '&&');
}

/** Excel sheet names: max 31 characters, none of `[]:*?/\`. */
function safeSheetName(name: string, used: Set<string>): string {
  const base = name.replace(/[[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = base;
  for (let index = 2; used.has(candidate.toLowerCase()); index += 1) {
    const suffix = ` (${index})`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function writeDocumentSheet(
  workbook: ExcelJS.Workbook,
  sheetDef: HrExportSheet,
  meta: {
    sheetName: string;
    companyName: string;
    title: string;
    subtitle: string | null;
    generatedAt: Date;
    preparedBy: string | null;
  },
): void {
  const columns = sheetDef.columns;
  const columnCount = Math.max(1, columns.length);
  const sheet = workbook.addWorksheet(meta.sheetName, {
    properties: { defaultRowHeight: 18 },
    pageSetup: {
      paperSize: 9, // A4
      orientation: columnCount > 6 ? 'landscape' : 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      horizontalCentered: true,
      margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.75, header: 0.3, footer: 0.3 },
    },
    headerFooter: {
      oddFooter: `&L&"${FONT}"&8&K6B6B6B${footerText(`${meta.companyName} - ${meta.title}`)}&R&"${FONT}"&8&K6B6B6BPage &P of &N`,
    },
  });

  sheet.columns = columns.map((column) => ({
    key: column.key,
    width: fittedWidth(column, sheetDef.rows),
  }));

  // A column is numeric when every filled value is a number.
  const numericColumns = columns.map((column) => {
    const values = sheetDef.rows
      .map((row) => row[column.key])
      .filter((value) => value !== '' && value !== undefined && value !== null);
    return values.length > 0 && values.every((value) => typeof value === 'number');
  });
  const numberFormatFor = (index: number): string => {
    if (isMoneyColumn(columns[index].header)) return MONEY_FORMAT;
    const allWhole = sheetDef.rows.every((row) => {
      const value = row[columns[index].key];
      return typeof value !== 'number' || Number.isInteger(value);
    });
    return allWhole ? COUNT_FORMAT : DECIMAL_FORMAT;
  };

  // ── Document header ──
  let row = 1;
  const companyCell = sheet.getCell(row, 1);
  companyCell.value = meta.companyName.toUpperCase();
  companyCell.font = { name: FONT, size: 8, bold: true, color: { argb: MUTED } };
  row += 1;

  sheet.getRow(row).height = 28;
  const titleCell = sheet.getCell(row, 1);
  titleCell.value = meta.title;
  titleCell.font = { name: FONT, size: 16, bold: true, color: { argb: INK } };
  titleCell.alignment = { vertical: 'middle' };
  row += 1;

  if (meta.subtitle) {
    const subtitleCell = sheet.getCell(row, 1);
    subtitleCell.value = meta.subtitle;
    subtitleCell.font = { name: FONT, size: 10, color: { argb: MUTED } };
    row += 1;
  }

  // Metadata strip: muted labels, dark values, then a solid rule.
  const metaParts: Array<[string, string]> = [
    ['Generated', formatGeneratedAt(meta.generatedAt)],
    ...(meta.preparedBy ? ([['Prepared by', meta.preparedBy]] as Array<[string, string]>) : []),
    ['Records', sheetDef.rows.length.toLocaleString('en-US')],
  ];
  const metaRow = sheet.getRow(row);
  metaRow.height = 22;
  const metaCell = sheet.getCell(row, 1);
  metaCell.value = {
    richText: metaParts.flatMap(([label, value], index) => [
      {
        text: `${index > 0 ? '      ' : ''}${label}  `,
        font: { name: FONT, size: 8, color: { argb: MUTED } },
      },
      {
        text: value,
        font: { name: FONT, size: 8, bold: true, color: { argb: INK } },
      },
    ]),
  };
  metaCell.alignment = { vertical: 'top' };
  for (let column = 1; column <= columnCount; column += 1) {
    sheet.getCell(row, column).border = { bottom: RULE_STRONG };
  }
  row += 1;
  sheet.getRow(row).height = 12; // breathing room before the table
  row += 1;

  // ── Table header ──
  const headerRowNumber = row;
  const headerRow = sheet.getRow(headerRowNumber);
  headerRow.height = 24;
  columns.forEach((column, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = column.header;
    cell.font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
    cell.alignment = {
      vertical: 'middle',
      wrapText: true,
      horizontal: numericColumns[index] ? 'right' : 'left',
    };
    cell.border = { bottom: RULE_THIN };
  });

  // ── Body ──
  const firstBodyRow = headerRowNumber + 1;
  if (sheetDef.rows.length === 0) {
    const cell = sheet.getCell(firstBodyRow, 1);
    cell.value = 'No records';
    cell.font = { name: FONT, size: 9, italic: true, color: { argb: MUTED } };
    for (let column = 1; column <= columnCount; column += 1) {
      sheet.getCell(firstBodyRow, column).border = { bottom: RULE_HAIR };
    }
  } else {
    for (const data of sheetDef.rows) {
      const bodyRow = sheet.addRow(data);
      // Style every column, including trailing blanks eachCell would skip.
      for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
        const cell = bodyRow.getCell(columnNumber);
        const index = columnNumber - 1;
        cell.font = { name: FONT, size: 9, color: { argb: BODY } };
        cell.border = { bottom: RULE_HAIR };
        if (typeof cell.value === 'number') {
          cell.numFmt = numberFormatFor(index);
        }
        cell.alignment = {
          vertical: 'top',
          horizontal: numericColumns[index] ? 'right' : 'left',
          wrapText:
            typeof cell.value === 'string' &&
            cell.value.length > (sheet.getColumn(columnNumber).width ?? MIN_COLUMN_WIDTH),
        };
      }
    }
  }
  const lastBodyRow = firstBodyRow + Math.max(sheetDef.rows.length, 1) - 1;

  // ── Totals (money columns only) ──
  const moneyIndexes = columns
    .map((column, index) => (isMoneyColumn(column.header) && numericColumns[index] ? index : -1))
    .filter((index) => index >= 0);
  if (sheetDef.rows.length > 1 && moneyIndexes.length > 0) {
    const totalRow = sheet.getRow(lastBodyRow + 1);
    totalRow.height = 22;
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber += 1) {
      const cell = totalRow.getCell(columnNumber);
      cell.font = { name: FONT, size: 9, bold: true, color: { argb: INK } };
      cell.border = { top: RULE_THIN, bottom: RULE_STRONG };
      cell.alignment = { vertical: 'middle' };
    }
    const labelCell = totalRow.getCell(1);
    if (!moneyIndexes.includes(0)) {
      labelCell.value = 'Total';
    }
    for (const index of moneyIndexes) {
      const letter = columnLetter(index + 1);
      const total = sheetDef.rows.reduce((sum, data) => {
        const value = data[columns[index].key];
        return sum + (typeof value === 'number' ? value : 0);
      }, 0);
      const cell = totalRow.getCell(index + 1);
      cell.value = {
        formula: `SUM(${letter}${firstBodyRow}:${letter}${lastBodyRow})`,
        result: Number(total.toFixed(2)),
      };
      cell.numFmt = MONEY_FORMAT;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    }
  }

  sheet.views = [{ state: 'frozen', ySplit: headerRowNumber, showGridLines: false }];
  sheet.autoFilter = {
    from: { row: headerRowNumber, column: 1 },
    to: { row: headerRowNumber, column: columnCount },
  };
  sheet.pageSetup.printTitlesRow = `${headerRowNumber}:${headerRowNumber}`;
}

export interface HrExcelWorkbookInput {
  sheets: HrExportSheet[];
  generatedAt?: string;
  /** Defaults to CRCC International Consulting, as on the PDFs. */
  companyName?: string;
  /** Current user's name for the "Prepared by" line; omitted when unknown. */
  preparedBy?: string | null;
  /**
   * One title for every sheet (e.g. `HR Report`); each sheet's name then
   * becomes its subtitle. Without it the sheet name is the title.
   */
  documentTitle?: string;
}

/** Builds the workbook, each sheet laid out like the HR PDF documents. */
export function buildHrExcelWorkbook(input: HrExcelWorkbookInput): ExcelJS.Workbook {
  const generatedAt = new Date(input.generatedAt ?? new Date().toISOString());
  const companyName = input.companyName?.trim() || HR_EXPORT_COMPANY_NAME;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = companyName;
  workbook.created = generatedAt;

  const usedNames = new Set<string>();
  for (const sheetDef of input.sheets) {
    writeDocumentSheet(workbook, sheetDef, {
      sheetName: safeSheetName(sheetDef.name, usedNames),
      companyName,
      title: input.documentTitle?.trim() || sheetDef.name,
      subtitle: input.documentTitle?.trim() ? sheetDef.name : null,
      generatedAt,
      preparedBy: input.preparedBy?.trim() || null,
    });
  }
  return workbook;
}

/**
 * Base Excel export - takes sheet definitions with their column definitions
 * and row data and downloads the workbook.
 */
export async function downloadHrExcelWorkbook(
  input: HrExcelWorkbookInput & { fileName: string },
): Promise<void> {
  const workbook = buildHrExcelWorkbook(input);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = input.fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Renders any cell value as a plain string, blanking nullish values. */
export function exportCell(
  value: string | number | null | undefined,
): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return String(value);
}

/** Trims a date or datetime to the exported `YYYY-MM-DD` form. */
export function exportDate(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  return value.slice(0, 10);
}

/** Full `YYYY-MM-DD HH:mm` timestamp, for reporting columns. */
export function exportDateTime(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 16).replace('T', ' ');
  }
  const pad = (part: number): string => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Numeric export for money columns. Values are already in ETB; the number is
 * exported bare so Excel can total it, with `(ETB)` carried in the header.
 */
export function exportEtb(
  value: number | string | null | undefined,
): number | string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const num = Number(value);
  return Number.isFinite(num) ? Number(num.toFixed(2)) : String(value);
}

/** Numeric export that keeps blanks blank rather than turning them into 0. */
export function exportNumber(
  value: number | string | null | undefined,
): number | string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : String(value);
}

/** `SEAL_ISSUED` → `Seal Issued`. Used for every exported enum column. */
export function exportEnumLabel(
  value: string | null | undefined,
): string {
  if (!value) {
    return '';
  }
  return value
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

/** `Yes` / `No`, blank when unknown. */
export function exportBoolean(value: boolean | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  return value ? 'Yes' : 'No';
}

/** `Abebe Kebede` from a user summary, falling back to the email. */
export function exportPersonName(
  person:
    | {
        firstName?: string | null;
        middleName?: string | null;
        lastName?: string | null;
        email?: string | null;
      }
    | null
    | undefined,
): string {
  if (!person) {
    return '';
  }
  const name = [person.firstName, person.middleName, person.lastName]
    .filter((part) => Boolean(part?.trim()))
    .join(' ')
    .trim();
  return name || person.email || '';
}

/** `vehicle-applications_crcc-international-consulting_2026-09-07.xlsx` */
export function buildHrExportFileName(
  prefix: string,
  companyName: string,
): string {
  const safeCompany =
    companyName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'company';
  const date = new Date().toISOString().slice(0, 10);
  return `${prefix}_${safeCompany}_${date}.xlsx`;
}
