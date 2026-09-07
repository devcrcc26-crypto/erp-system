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

/**
 * Base Excel export builder — takes sheet definitions with their column
 * definitions and row data and downloads the workbook.
 */
export async function downloadHrExcelWorkbook(input: {
  fileName: string;
  sheets: HrExportSheet[];
  generatedAt?: string;
}): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'CRCC International Consulting';
  workbook.created = new Date(input.generatedAt ?? new Date().toISOString());

  for (const sheetDef of input.sheets) {
    const sheet = workbook.addWorksheet(sheetDef.name);
    sheet.columns = sheetDef.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? Math.max(14, column.header.length + 4),
    }));

    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.alignment = { vertical: 'middle', wrapText: true };

    if (sheetDef.rows.length > 0) {
      sheet.addRows(sheetDef.rows);
    }

    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: Math.max(1, sheetDef.columns.length) },
    };
  }

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
    | { firstName?: string | null; lastName?: string | null; email?: string | null }
    | null
    | undefined,
): string {
  if (!person) {
    return '';
  }
  const name = [person.firstName, person.lastName]
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
