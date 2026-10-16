import { join } from 'path';
import * as XLSX from 'xlsx';

/** Columns on sheet "August 2026" (0-based). Only these fields may be read from the HR file. */
export const DIRECTORY_SHEET_PATH = join(
  __dirname,
  '..',
  '..',
  '..',
  'data',
  'private',
  'employee-directory-2026-08.xls',
);
export const DIRECTORY_SHEET_NAME = 'August 2026';

export interface DirectoryOrgRow {
  rowIndex: number;
  name: string;
  position: string | null;
  postZh: string | null;
  reportToRaw: string | null;
  deptRaw: string | null;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return String(value).trim();
}

/**
 * Loads org fields from the August 2026 employee directory sheet.
 * Never reads salary, phone, degree, experience or employment date columns.
 */
export function readDirectoryOrgRows(
  filePath: string = DIRECTORY_SHEET_PATH,
): DirectoryOrgRow[] {
  const wb = XLSX.readFile(filePath);
  const sheetName =
    wb.SheetNames.find((n) => /^august\s*2026$/i.test(n.trim())) ?? null;
  if (!sheetName) {
    throw new Error(
      `Sheet "${DIRECTORY_SHEET_NAME}" not found in ${filePath} (have: ${wb.SheetNames.join(', ')})`,
    );
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  const entries: DirectoryOrgRow[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const sn = row[0];
    const name = cellText(row[1]);
    if (!name) continue;
    if (typeof sn !== 'number' && !/^\d+$/.test(cellText(sn))) continue;
    entries.push({
      rowIndex: i + 1,
      name,
      position: cellText(row[2]) || null,
      postZh: cellText(row[9]) || null,
      reportToRaw: cellText(row[10]) || null,
      deptRaw: cellText(row[11]) || null,
    });
  }
  return entries;
}
