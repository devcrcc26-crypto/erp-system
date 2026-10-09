import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Appends login_name,temporary_password rows to the private credentials CSV.
 * Creates the file with a header when missing. Never logs passwords.
 */
export function appendInitialCredentials(
  privateDir: string,
  rows: Array<{ loginName: string; temporaryPassword: string }>,
): string {
  if (!existsSync(privateDir)) {
    mkdirSync(privateDir, { recursive: true });
  }
  const csvPath = join(privateDir, 'initial-credentials.csv');
  const headerNeeded = !existsSync(csvPath);
  const body = rows
    .map(
      (row) =>
        `${csvEscape(row.loginName)},${csvEscape(row.temporaryPassword)}`,
    )
    .join('\n');
  if (headerNeeded) {
    writeFileSync(
      csvPath,
      `login_name,temporary_password\n${body}\n`,
      'utf8',
    );
  } else if (body) {
    appendFileSync(csvPath, `${body}\n`, 'utf8');
  }
  return csvPath;
}
