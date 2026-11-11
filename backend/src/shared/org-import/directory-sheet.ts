import { join } from 'path';
import * as XLSX from 'xlsx';

/**
 * Sheet "August 2026". Org fields: A (S/N), B (name), C, J, K, L. HR profile
 * fields: E (seniority), H (phone), I (secondary phone), M (education).
 * No other column (salary, experience, employment date) may be read.
 */
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

function readDirectoryRows(filePath: string): unknown[][] {
  const wb = XLSX.readFile(filePath);
  const sheetName =
    wb.SheetNames.find((n) => /^august\s*2026$/i.test(n.trim())) ?? null;
  if (!sheetName) {
    throw new Error(
      `Sheet "${DIRECTORY_SHEET_NAME}" not found in ${filePath} (have: ${wb.SheetNames.join(', ')})`,
    );
  }
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];
}

/** Employee data rows: a numbered S/N in A and a name in B. */
function isEmployeeRow(row: unknown[] | undefined): row is unknown[] {
  if (!row || row.length < 2 || !cellText(row[1])) return false;
  const sn = row[0];
  return typeof sn === 'number' || /^\d+$/.test(cellText(sn));
}

export interface DirectoryHrFieldRow {
  /** Same 1-based row index as DirectoryOrgRow.rowIndex. */
  rowIndex: number;
  seniorityRaw: string | null;
  phoneRaw: string | null;
  secondaryPhoneRaw: string | null;
  educationRaw: string | null;
}

/** Loads only E, H, I and M (A and B only to find employee rows). */
export function readDirectoryHrFieldRows(
  filePath: string = DIRECTORY_SHEET_PATH,
): DirectoryHrFieldRow[] {
  const rows = readDirectoryRows(filePath);
  const entries: DirectoryHrFieldRow[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isEmployeeRow(row)) continue;
    entries.push({
      rowIndex: i + 1,
      seniorityRaw: cellText(row[4]) || null,
      phoneRaw: cellText(row[7]) || null,
      secondaryPhoneRaw: cellText(row[8]) || null,
      educationRaw: cellText(row[12]) || null,
    });
  }
  return entries;
}

/** Loads org fields (B, C, J, K, L) from the August 2026 directory sheet. */
export function readDirectoryOrgRows(
  filePath: string = DIRECTORY_SHEET_PATH,
): DirectoryOrgRow[] {
  const rows = readDirectoryRows(filePath);
  const entries: DirectoryOrgRow[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isEmployeeRow(row)) continue;
    const name = cellText(row[1]);
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
