import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import * as ExcelJS from 'exceljs';

export type LoginCredentialSheetRow = {
  employeeId: string | null;
  fullName: string;
  department: string;
  temporaryPassword: string;
};

const TITLE =
  'PWF ERP - Login credentials (temporary, change at first login)';
const SLIPS_PER_PAGE = 8;
const PAPER_A4 = 9;

const thinBorder: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' },
  left: { style: 'thin' },
  bottom: { style: 'thin' },
  right: { style: 'thin' },
};

/**
 * Writes Credentials, Slips, and Instructions sheets. Never logs passwords.
 */
export async function writeLoginCredentialsWorkbook(
  filePath: string,
  rows: LoginCredentialSheetRow[],
  appUrl: string,
): Promise<void> {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'PWF ERP';
  workbook.created = new Date();

  buildCredentialsSheet(workbook, rows);
  buildSlipsSheet(workbook, rows, appUrl);
  buildInstructionsSheet(workbook);

  await workbook.xlsx.writeFile(filePath);
}

function buildCredentialsSheet(
  workbook: ExcelJS.Workbook,
  rows: LoginCredentialSheetRow[],
): void {
  const sheet = workbook.addWorksheet('Credentials', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: {
      paperSize: PAPER_A4,
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '2:2',
    },
  });

  sheet.mergeCells('A1:G1');
  const titleCell = sheet.getCell('A1');
  titleCell.value = TITLE;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  sheet.getRow(1).height = 22;

  const headers = [
    'No',
    'Employee ID',
    'Full name (login name)',
    'Department',
    'Temporary password',
    'Received (signature)',
    'Date',
  ];
  const headerRow = sheet.getRow(2);
  headers.forEach((text, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = text;
    cell.font = { bold: true };
    cell.border = thinBorder;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });
  headerRow.height = 20;

  rows.forEach((row, index) => {
    const excelRow = sheet.getRow(index + 3);
    const values: Array<string | number> = [
      index + 1,
      row.employeeId ?? '',
      row.fullName,
      row.department,
      row.temporaryPassword,
      '',
      '',
    ];
    values.forEach((value, i) => {
      const cell = excelRow.getCell(i + 1);
      cell.value = value;
      cell.border = thinBorder;
      cell.alignment = { vertical: 'middle', wrapText: true };
      if (i === 4) {
        cell.font = { name: 'Consolas', size: 11 };
      }
    });
  });

  const widths = [6, 14, 28, 22, 18, 22, 12];
  for (let col = 1; col <= widths.length; col += 1) {
    let max = widths[col - 1]!;
    for (let r = 2; r <= rows.length + 2; r += 1) {
      const v = sheet.getRow(r).getCell(col).value;
      const len = v == null ? 0 : String(v).length;
      if (len + 2 > max) max = Math.min(len + 2, 48);
    }
    sheet.getColumn(col).width = max;
  }
}

function buildSlipsSheet(
  workbook: ExcelJS.Workbook,
  rows: LoginCredentialSheetRow[],
  appUrl: string,
): void {
  const sheet = workbook.addWorksheet('Slips', {
    pageSetup: {
      paperSize: PAPER_A4,
      orientation: 'portrait',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
    },
  });
  sheet.getColumn(1).width = 72;

  let excelRow = 1;
  rows.forEach((row, index) => {
    const destination = appUrl || '(ask HR for the app URL)';
    const lines = [
      `Login name: ${row.fullName}`,
      `Temporary password: ${row.temporaryPassword}`,
      `Go to ${destination}, log in with your full name and this password, then choose a new password.`,
    ];
    for (const line of lines) {
      const cell = sheet.getRow(excelRow).getCell(1);
      cell.value = line;
      cell.font =
        line.startsWith('Temporary password:')
          ? { name: 'Consolas', size: 11 }
          : { size: 11 };
      cell.alignment = { wrapText: true };
      sheet.getRow(excelRow).height = 18;
      excelRow += 1;
    }

    const sep = sheet.getRow(excelRow);
    sep.getCell(1).value = '────────────────────────────────────────';
    sep.getCell(1).font = { color: { argb: 'FF888888' } };
    excelRow += 1;

    if ((index + 1) % SLIPS_PER_PAGE === 0 && index < rows.length - 1) {
      sheet.getRow(excelRow - 1).addPageBreak();
    }
  });
}

function buildInstructionsSheet(workbook: ExcelJS.Workbook): void {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.getColumn(1).width = 90;
  const steps = [
    'HR instructions - login credentials hand-out',
    '',
    '1. Print the Credentials sheet (landscape) and collect a signature + date when each person receives their slip.',
    '2. Hand out slips in person only - do not email, chat, or post passwords.',
    '3. Use the Slips sheet to cut individual blocks for each person.',
    '4. After everyone has signed and received their password, delete this Excel file from disk and from any shared drives.',
    '5. If someone loses their temporary password, use Reset password in the ERP (do not re-share this file).',
    '6. Recipients must change the temporary password at first login.',
  ];
  steps.forEach((line, i) => {
    const cell = sheet.getRow(i + 1).getCell(1);
    cell.value = line;
    cell.font = i === 0 ? { bold: true, size: 13 } : { size: 11 };
    cell.alignment = { wrapText: true };
  });
}
