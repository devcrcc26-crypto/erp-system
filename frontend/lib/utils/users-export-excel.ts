import ExcelJS from 'exceljs';
import type { EmergencyContact, User } from '@/lib/api/types';
import { formatUserDisciplineLabel } from '@/lib/constants/user-discipline';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/utils/date-format';

/** Column headers match the import template so exports can be re-used as imports. */
export interface UsersExportLabels {
  sheetName: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  chineseName: string;
  role: string;
  phone: string;
  discipline: string;
  gender: string;
  department: string;
  position: string;
  employeeId: string;
  nationality: string;
  employeeType: string;
  dateOfBirth: string;
  nationalId: string;
  educationLevel: string;
  fieldOfStudy: string;
  yearsOfExperienceAsOf: string;
  yearsOfExperience: string;
  addressCountry: string;
  addressRegion: string;
  addressCity: string;
  addressSubcity: string;
  addressWoreda: string;
  addressHouseNumber: string;
  leavePolicy: string;
  emergencyContacts: string;
  status: string;
  lastLogin: string;
}

export interface UsersExportRow {
  email: string;
  firstName: string;
  lastName: string;
  middleName: string;
  chineseName: string;
  role: string;
  phone: string;
  discipline: string;
  gender: string;
  department: string;
  position: string;
  employeeId: string;
  nationality: string;
  employeeType: string;
  dateOfBirth: string;
  nationalId: string;
  educationLevel: string;
  fieldOfStudy: string;
  yearsOfExperienceAsOf: string;
  yearsOfExperience: string;
  addressCountry: string;
  addressRegion: string;
  addressCity: string;
  addressSubcity: string;
  addressWoreda: string;
  addressHouseNumber: string;
  leavePolicy: string;
  emergencyContacts: string;
  status: string;
  lastLogin: string;
}

function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  return String(value);
}

function formatExportDiscipline(user: User): string {
  const engineering = user.engineeringDiscipline;
  if (engineering?.name) {
    const nameZh = engineering.nameZh?.trim();
    return nameZh ? `${engineering.name} / ${nameZh}` : engineering.name;
  }
  if (user.discipline) {
    return formatUserDisciplineLabel(user.discipline);
  }
  return '';
}

function formatEmergencyContacts(contacts: EmergencyContact[] | null | undefined): string {
  if (!contacts || contacts.length === 0) {
    return '';
  }
  return contacts
    .map((contact) => {
      const name = [contact.firstName, contact.middleName, contact.lastName]
        .filter(Boolean)
        .join(' ')
        .trim();
      const parts = [name, contact.phone, contact.email].filter(Boolean);
      return parts.join(' | ');
    })
    .join('; ');
}

function formatLastLogin(value: string | null): string {
  if (!value) {
    return '';
  }
  return formatDisplayDateTime(value);
}

function formatDateOnly(value: string | null | undefined): string {
  if (!value) {
    return '';
  }
  const iso = value.slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return iso;
  }
  return formatDisplayDate(value) === '-' ? '' : iso;
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
  statusLabel: (user: User) => string,
): UsersExportRow[] {
  return sortUsers(users).map((user) => {
    const role = formatUserRoles(user);
    return {
    email: cell(user.email),
    firstName: cell(user.firstName),
    lastName: cell(user.lastName),
    middleName: cell(user.middleName),
    chineseName: cell(user.chineseName),
    role: role === '-' ? '' : role,
    phone: cell(user.phone),
    discipline: formatExportDiscipline(user),
    gender: cell(user.gender),
    department: cell(user.department?.name),
    position: cell(user.position?.title),
    employeeId: cell(user.employeeId),
    nationality: cell(user.nationality),
    employeeType: cell(user.employeeType),
    dateOfBirth: formatDateOnly(user.dateOfBirth),
    nationalId: cell(user.nationalId),
    educationLevel: cell(user.educationLevel),
    fieldOfStudy: cell(user.fieldOfStudy),
    yearsOfExperienceAsOf: formatDateOnly(user.yearsOfExperienceAsOf),
    yearsOfExperience:
      user.yearsOfExperience === null || user.yearsOfExperience === undefined
        ? ''
        : String(user.yearsOfExperience),
    addressCountry: cell(user.addressCountry),
    addressRegion: cell(user.addressRegion),
    addressCity: cell(user.addressCity),
    addressSubcity: cell(user.addressSubcity),
    addressWoreda: cell(user.addressWoreda),
    addressHouseNumber: cell(user.addressHouseNumber),
    leavePolicy: cell(user.leavePolicy?.name),
    emergencyContacts: formatEmergencyContacts(user.emergencyContacts),
    status: statusLabel(user),
    lastLogin: formatLastLogin(user.lastLogin),
  };
  });
}

interface UsersExportExcelInput {
  companyName: string;
  generatedAt: string;
  labels: UsersExportLabels;
  users: User[];
  formatUserRoles: (user: User) => string;
  statusLabel: (user: User) => string;
}

const COLUMN_KEYS: Array<keyof UsersExportRow> = [
  'email',
  'firstName',
  'lastName',
  'middleName',
  'chineseName',
  'role',
  'phone',
  'discipline',
  'gender',
  'department',
  'position',
  'employeeId',
  'nationality',
  'employeeType',
  'dateOfBirth',
  'nationalId',
  'educationLevel',
  'fieldOfStudy',
  'yearsOfExperienceAsOf',
  'yearsOfExperience',
  'addressCountry',
  'addressRegion',
  'addressCity',
  'addressSubcity',
  'addressWoreda',
  'addressHouseNumber',
  'leavePolicy',
  'emergencyContacts',
  'status',
  'lastLogin',
];

const COLUMN_WIDTHS: Record<keyof UsersExportRow, number> = {
  email: 32,
  firstName: 16,
  lastName: 16,
  middleName: 16,
  chineseName: 16,
  role: 24,
  phone: 14,
  discipline: 24,
  gender: 10,
  department: 20,
  position: 20,
  employeeId: 14,
  nationality: 12,
  employeeType: 14,
  dateOfBirth: 14,
  nationalId: 16,
  educationLevel: 14,
  fieldOfStudy: 18,
  yearsOfExperienceAsOf: 18,
  yearsOfExperience: 12,
  addressCountry: 14,
  addressRegion: 14,
  addressCity: 14,
  addressSubcity: 14,
  addressWoreda: 14,
  addressHouseNumber: 16,
  leavePolicy: 18,
  emergencyContacts: 40,
  status: 14,
  lastLogin: 22,
};

/**
 * Downloads a full user directory spreadsheet (all profile columns).
 */
export async function exportUsersExcel(input: UsersExportExcelInput): Promise<void> {
  const { companyName, generatedAt, labels, users, formatUserRoles, statusLabel } =
    input;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Construction ERP';
  workbook.created = new Date(generatedAt);

  const sheet = workbook.addWorksheet(labels.sheetName);
  sheet.columns = COLUMN_KEYS.map((key) => ({
    header: labels[key],
    key,
    width: COLUMN_WIDTHS[key],
  }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: 'middle', wrapText: true };

  const rows = buildUsersExportRows(users, formatUserRoles, statusLabel);
  if (rows.length > 0) {
    sheet.addRows(rows);
  }

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }
    row.getCell('emergencyContacts').alignment = {
      wrapText: true,
      vertical: 'top',
    };
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
