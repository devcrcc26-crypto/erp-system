import ExcelJS from 'exceljs';
import type { User } from '@/lib/api/types';
import { formatUserDisciplineLabel } from '@/lib/constants/user-discipline';

export interface UsersExportLabels {
  sheetName: string;
  name: string;
  position: string;
  discipline: string;
  department: string;
  role: string;
  lastLogin: string;
}

export interface UsersExportRow {
  name: string;
  position: string;
  discipline: string;
  department: string;
  role: string;
  lastLogin: string;
}

function formatExportName(user: User): string {
  const latinName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  const chineseName = user.chineseName?.trim();
  if (latinName && chineseName) {
    return `${latinName}\n${chineseName}`;
  }
  return latinName || chineseName || '-';
}

function formatExportDiscipline(user: User): string {
  const engineering = user.engineeringDiscipline;
  if (engineering?.name) {
    const nameZh = engineering.nameZh?.trim();
    return nameZh ? `${engineering.name}\n${nameZh}` : engineering.name;
  }
  if (user.discipline) {
    return formatUserDisciplineLabel(user.discipline);
  }
  return '-';
}

function formatLastLogin(value: string | null): string {
  if (!value) {
    return '-';
  }
  return new Date(value).toLocaleString();
}

function sortUsers(users: User[]): User[] {
  return [...users].sort((a, b) => {
    const last = a.lastName.localeCompare(b.lastName);
    if (last !== 0) {
      return last;
    }
    return a.firstName.localeCompare(b.firstName);
  });
}

export function buildUsersExportRows(
  users: User[],
  formatUserRoles: (user: User) => string,
): UsersExportRow[] {
  return sortUsers(users).map((user) => ({
    name: formatExportName(user),
    position: user.position?.title?.trim() || '-',
    discipline: formatExportDiscipline(user),
    department: user.department?.name?.trim() || '-',
    role: formatUserRoles(user),
    lastLogin: formatLastLogin(user.lastLogin),
  }));
}

interface UsersExportExcelInput {
  companyName: string;
  generatedAt: string;
  labels: UsersExportLabels;
  users: User[];
  formatUserRoles: (user: User) => string;
}

/**
 * Downloads a user directory spreadsheet with name, org, and access columns.
 */
export async function exportUsersExcel(input: UsersExportExcelInput): Promise<void> {
  const { companyName, generatedAt, labels, users, formatUserRoles } = input;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Construction ERP';
  workbook.created = new Date(generatedAt);

  const sheet = workbook.addWorksheet(labels.sheetName);
  sheet.columns = [
    { header: labels.name, key: 'name', width: 32 },
    { header: labels.position, key: 'position', width: 24 },
    { header: labels.discipline, key: 'discipline', width: 28 },
    { header: labels.department, key: 'department', width: 28 },
    { header: labels.role, key: 'role', width: 32 },
    { header: labels.lastLogin, key: 'lastLogin', width: 22 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle' };

  const rows = buildUsersExportRows(users, formatUserRoles);
  if (rows.length > 0) {
    sheet.addRows(rows);
  }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    row.getCell('name').alignment = { wrapText: true, vertical: 'top' };
    row.getCell('discipline').alignment = { wrapText: true, vertical: 'top' };
    row.getCell('role').alignment = { wrapText: true, vertical: 'top' };
  });

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const dateStamp = new Date(generatedAt).toISOString().slice(0, 10);
  const safeCompany = companyName.replace(/[^a-zA-Z0-9-_]/g, '_');
  link.download = `users_${safeCompany}_${dateStamp}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}
