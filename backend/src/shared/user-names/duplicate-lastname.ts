import { normaliseName } from '../org-import/name-normalise';

/**
 * Helpers for scripts/clear-duplicate-lastname.ts: users whose lastName only repeats
 * middleName (the unknown grandfather's name was filled with the father's name).
 */

export type LastNameBackupRow = {
  userId: string;
  employeeId: string;
  lastName: string;
};

const BACKUP_HEADER = 'userId,employeeId,lastName';

/** Case- and space-insensitive form used for the lastName = middleName check. */
export function nameCompareKey(value: string | null | undefined): string {
  return normaliseName(value).toLowerCase();
}

export function lastNameRepeatsMiddle(user: {
  middleName: string | null;
  lastName: string;
}): boolean {
  const middle = nameCompareKey(user.middleName);
  return middle.length > 0 && middle === nameCompareKey(user.lastName);
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toLastNameBackupCsv(rows: readonly LastNameBackupRow[]): string {
  return (
    [
      BACKUP_HEADER,
      ...rows.map((r) => [r.userId, r.employeeId, r.lastName].map(csvCell).join(',')),
    ].join('\n') + '\n'
  );
}

export function parseLastNameBackupCsv(text: string): LastNameBackupRow[] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  const [header, ...body] = records.filter((r) => r.some((cell) => cell.length > 0));
  if (header?.join(',') !== BACKUP_HEADER) {
    throw new Error(`Backup CSV header must be ${BACKUP_HEADER}`);
  }
  return body.map((r) => ({
    userId: r[0] ?? '',
    employeeId: r[1] ?? '',
    lastName: r[2] ?? '',
  }));
}
