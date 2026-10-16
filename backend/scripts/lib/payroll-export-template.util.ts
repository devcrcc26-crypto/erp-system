import type * as ExcelJS from 'exceljs';
import * as path from 'path';

/** Source design workbook (read-only). */
export const PAYROLL_TEMPLATE_SOURCE = path.join(
  __dirname,
  '../../data/private/design-fzy-2026.9-salary sheet-外账个税.xlsx',
);

export const PAYROLL_EXPORT_TEMPLATE_OUTPUT = path.join(
  __dirname,
  '../../assets/templates/payroll-export-template.xlsx',
);

export const DATA_SHEET = 'Data';
export const PAYROLL_SHEET = 'Payroll';

export const DATA_FIRST_EMP_ROW = 5;
export const DATA_LAST_EMP_ROW = 102;
export const DATA_TOTALS_ROW = 103;
/** Columns D–AD (1-based). */
export const DATA_FIRST_COL = 4;
export const DATA_LAST_COL = 30;

export const PAYROLL_FIRST_EMP_ROW = 11;
export const PAYROLL_LAST_EMP_ROW = 108;
export const PAYROLL_TOTALS_ROW = 109;
export const PAYROLL_FIRST_COL = 1;
export const PAYROLL_LAST_COL = 15;

/** Data totals row - clear numeric/formula cells H–AB (8–28). */
export const DATA_TOTALS_FIRST_COL = 8;
export const DATA_TOTALS_LAST_COL = 28;

/** Payroll totals row - clear E–O (5–15). */
export const PAYROLL_TOTALS_FIRST_COL = 5;
export const PAYROLL_TOTALS_LAST_COL = 15;

/** OT rate cells preserved on Data sheet. */
export const DATA_ALLOWED_OT_CELLS = ['N4', 'P4', 'R4', 'T4'] as const;

/** Header numeric cells on Payroll (form refs / month indices). */
export const PAYROLL_ALLOWED_HEADER_NUMERIC = [
  'F7',
  'J7',
  'A8',
  'B8',
  'C8',
  'D8',
  'E8',
  'F8',
  'G8',
  'H8',
  'I8',
  'J8',
  'K8',
  'L8',
  'M8',
  'N8',
  'O8',
] as const;

/** Summary line prefix numbers in footer block. */
export const PAYROLL_ALLOWED_FOOTER_LINE_NUMBERS = ['A111', 'A112', 'A113'] as const;

export function columnLetters(col: number): string {
  let n = col;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function cellAddress(row: number, col: number): string {
  return `${columnLetters(col)}${row}`;
}

export function parseMergeRange(
  range: string,
): { c1: number; r1: number; c2: number; r2: number } | null {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  if (!match) return null;
  const colToNum = (letters: string): number => {
    let n = 0;
    for (let i = 0; i < letters.length; i += 1) {
      n = n * 26 + (letters.charCodeAt(i) - 64);
    }
    return n;
  };
  return {
    c1: colToNum(match[1]),
    r1: Number(match[2]),
    c2: colToNum(match[3]),
    r2: Number(match[4]),
  };
}

export function clearCellValue(cell: ExcelJS.Cell): void {
  cell.value = null;
}

export function extractComparableValue(value: unknown): string | number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  if (typeof value === 'object' && value !== null) {
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as { result?: unknown }).result;
      if (result != null) return extractComparableValue(result);
      return null;
    }
    if ('richText' in value) {
      const parts = (value as { richText: Array<{ text: string }> }).richText;
      const t = parts.map((p) => p.text).join('').trim();
      return t.length > 0 ? t : null;
    }
    if ('text' in value && typeof (value as { text: unknown }).text === 'string') {
      const t = (value as { text: string }).text.trim();
      return t.length > 0 ? t : null;
    }
  }
  return null;
}

export function isNumericCellValue(value: unknown): boolean {
  const v = extractComparableValue(value);
  return typeof v === 'number' && Number.isFinite(v);
}
