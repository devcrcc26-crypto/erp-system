/**
 * Seed employment dates + yearly anniversary contracts from HR's August 2026
 * salary sheet (local DB only).
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/seed-contracts-from-august-2026.ts
 *   npx ts-node --transpile-only scripts/seed-contracts-from-august-2026.ts --apply
 *
 * Default is --dry-run. Salary amounts are written only to
 * data/private/contract-seed-report.md - never to the console.
 */
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import * as XLSX from 'xlsx';
import {
  EmployeeContractStatus,
  EmployeeContractType,
  EmployeeType,
  Prisma,
  PrismaClient,
  SupportedCurrency,
} from '@prisma/client';
import { normaliseAttendanceName } from '../src/modules/attendance/application/services/attendance-matching.service';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';
const REFERENCE = utcDate(2026, 8, 31);
const SHEET_PATH = join(__dirname, '..', 'data', 'private', 'August_2026_Salary.xlsx');
const DIRECTORY_PATH = join(
  __dirname,
  '..',
  'data',
  'private',
  'Employee_Directory_2026.xls',
);
const REPORT_PATH = join(
  __dirname,
  '..',
  'data',
  'private',
  'contract-seed-report.md',
);
const SEED_NOTE =
  'Seeded from August 2026 salary sheet - dates derived from employment anniversary.';

/** Confirmed sheet-name → employeeId aliases (dry-run resolutions). */
const NAME_ALIASES: Readonly<Record<string, string>> = {
  'Lakew Gulema Urge': 'CC-0037',
  'Tesfaye Tsega Beyin': 'CC-0073',
  'Tewodros Desye Sisay': 'CC-0076',
  'Tsebaot Minda Tadesse': 'CC-0077',
  'Samuel H/mariam': 'CC-0059',
  'Haile Micheal Mulugeta': 'CC-0026',
};

const MONTH_NAMES: Readonly<Record<string, number>> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const COL = {
  sn: 4, // D
  name: 5, // E
  position: 6, // F
  employmentDate: 7, // G
  basic: 8, // H
  workedDays: 9, // I
  earned: 10, // J
  transport: 11, // K
  totalOt: 21, // U
  bonus: 22, // V
  totalDeduction: 27, // AA
  netPay: 28, // AB
  notes: 29, // AC (header says SIGN; HR notes live here)
} as const;

interface SheetRow {
  excelRow: number;
  sn: number | null;
  name: string;
  position: string;
  employmentRaw: unknown;
  basic: number;
  workedDays: number;
  earned: number;
  transport: number;
  totalOt: number;
  bonus: number;
  totalDeduction: number;
  netPay: number;
  notes: string;
}

interface UserMatch {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeId: string | null;
  employeeType: EmployeeType | null;
  employmentDate: Date | null;
}

interface PlannedContract {
  employeeUserId: string;
  employeeName: string;
  employeeCode: string | null;
  contractNumber: string;
  status: EmployeeContractStatus;
  contractType: EmployeeContractType;
  startDate: Date;
  endDate: Date;
  signedAt: Date;
  basic: number;
  transport: number;
  bonus: number;
  pensionApplicable: boolean;
  sheetTransport: number;
  sheetBonus: number;
  workedDays: number;
}

interface ReportData {
  mode: 'dry-run' | 'apply';
  sheetRows: number;
  employeesMatched: number;
  contractsToCreateActive: number;
  contractsToCreateSuperseded: number;
  contractsSoftDeleted: number;
  employmentDateField: string;
  fuzzyCandidates: Array<{ sheetName: string; candidates: string[] }>;
  unmatchedNames: string[];
  correctedDates: Array<{ name: string; raw: string; corrected: string }>;
  missingDates: string[];
  derivedAmounts: Array<{
    name: string;
    workedDays: number;
    sheetTransport: number;
    storedTransport: number;
    sheetBonus: number;
    storedBonus: number;
  }>;
  salaryChanges: Array<{
    name: string;
    changeDay: number;
    oldBasic: number;
    newBasic: number;
    oldStart: string;
    oldEnd: string;
    newStart: string;
    newEnd: string;
  }>;
  midYearSalaryChanges: Array<{
    name: string;
    changeDay: number;
    anniversary: string;
    oldBasic: number;
    newBasic: number;
    oldStart: string;
    oldEnd: string;
    newStart: string;
    newEnd: string;
  }>;
  dateDisagreements: Array<{
    name: string;
    directoryDate: string;
    salaryDate: string;
    used: string;
    dayMonthSwap: boolean;
  }>;
  augustAnniversaryNoChange: string[];
  renewalMismatches: Array<{ name: string; detail: string }>;
  skippedEmployees: Array<{ name: string; reason: string }>;
  contracts: PlannedContract[];
  expiringWithin90Days: Array<{
    name: string;
    contractNumber: string;
    endDate: string;
  }>;
}

function utcDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

function toDateOnly(value: Date): Date {
  return utcDate(
    value.getUTCFullYear(),
    value.getUTCMonth() + 1,
    value.getUTCDate(),
  );
}

function addDays(value: Date, days: number): Date {
  const next = toDateOnly(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function iso(value: Date): string {
  return toDateOnly(value).toISOString().slice(0, 10);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Anniversary of employment in a given year (29 Feb → 28 Feb in non-leap years). */
function anniversaryInYear(employment: Date, year: number): Date {
  const month = employment.getUTCMonth() + 1;
  let day = employment.getUTCDate();
  if (month === 2 && day === 29 && !isLeapYear(year)) {
    day = 28;
  }
  return utcDate(year, month, day);
}

function cellNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellNumber((value as { result: unknown }).result);
  }
  const cleaned = String(value).replace(/,/g, '').trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellText((value as { result: unknown }).result);
  }
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String((value as { text: unknown }).text ?? '').trim();
  }
  if (value instanceof Date) return iso(value);
  return String(value).trim();
}

function excelSerialToUtcDate(serial: number): Date {
  // Excel's epoch with the 1900 leap-year bug: day 0 = 1899-12-30.
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  return toDateOnly(new Date(ms));
}

function parseEmploymentDate(
  raw: unknown,
  reference: Date,
): { date: Date | null; corrected: boolean; rawLabel: string } {
  const rawLabel = cellText(raw);
  if (raw == null || rawLabel === '') {
    return { date: null, corrected: false, rawLabel: '' };
  }

  let date: Date | null = null;
  if (raw instanceof Date) {
    date = toDateOnly(raw);
  } else if (typeof raw === 'number' && Number.isFinite(raw)) {
    date = excelSerialToUtcDate(raw);
  } else {
    const text = rawLabel.replace(/\./g, '/').replace(/-/g, '/');
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (m) {
      date = utcDate(Number(m[3]), Number(m[2]), Number(m[1]));
    } else {
      const parsed = new Date(rawLabel);
      if (!Number.isNaN(parsed.getTime())) {
        date = toDateOnly(parsed);
      }
    }
  }

  if (!date) {
    return { date: null, corrected: false, rawLabel };
  }

  // Date after 31 Aug 2026 with day ≤ 12 → swapped day/month.
  if (date.getTime() > reference.getTime() && date.getUTCDate() <= 12) {
    const swapped = utcDate(
      date.getUTCFullYear(),
      date.getUTCDate(),
      date.getUTCMonth() + 1,
    );
    return { date: swapped, corrected: true, rawLabel: rawLabel || iso(date) };
  }

  return { date, corrected: false, rawLabel: rawLabel || iso(date) };
}

/**
 * Parse directory employment dates: "Mon DD,YYYY", "August, 17, 2026",
 * Excel serials, and Date objects. No day/month swap (directory is source of truth).
 */
function parseDirectoryDate(raw: unknown): Date | null {
  if (raw == null || raw === '') return null;
  if (raw instanceof Date) return toDateOnly(raw);
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return excelSerialToUtcDate(raw);
  }
  const text = String(raw).trim();
  if (!text) return null;

  const named =
    /^(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s*,?\s*(\d{1,2})\s*,\s*(\d{4})$/i.exec(
      text,
    );
  if (named) {
    const month = MONTH_NAMES[named[1].toLowerCase()];
    if (month) {
      return utcDate(Number(named[3]), month, Number(named[2]));
    }
  }

  const slash = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(
    text.replace(/\./g, '/').replace(/-/g, '/'),
  );
  if (slash) {
    return utcDate(Number(slash[3]), Number(slash[2]), Number(slash[1]));
  }

  const asNumber = Number(text);
  if (Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 60000) {
    return excelSerialToUtcDate(asNumber);
  }

  const fallback = new Date(text);
  if (!Number.isNaN(fallback.getTime())) {
    return toDateOnly(fallback);
  }
  return null;
}

function compactName(name: string): string {
  return normaliseAttendanceName(name).toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface DirectoryEntry {
  name: string;
  date: Date;
  rawLabel: string;
}

/**
 * Read employment dates from Employee_Directory_2026.xls / August 2026.
 * Columns: A S/N, B Names, C Position, D Date of Employment - ignore Salary/Phone.
 */
function readDirectoryEntries(): DirectoryEntry[] {
  const wb = XLSX.readFile(DIRECTORY_PATH);
  const sheetName =
    wb.SheetNames.find((n) => /^august\s*2026$/i.test(n.trim())) ?? null;
  if (!sheetName) {
    throw new Error(
      `Sheet "August 2026" not found in Employee_Directory_2026.xls (have: ${wb.SheetNames.join(', ')})`,
    );
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];

  const entries: DirectoryEntry[] = [];
  for (const row of rows) {
    if (!row || row.length < 4) continue;
    const sn = row[0];
    const name = cellText(row[1]);
    if (!name) continue;
    if (typeof sn !== 'number' && !/^\d+$/.test(cellText(sn))) continue;
    const raw = row[3];
    const date = parseDirectoryDate(raw);
    if (!date) continue;
    entries.push({
      name,
      date,
      rawLabel: cellText(raw) || iso(date),
    });
  }
  return entries;
}

/**
 * Current contract start on the anniversary rule (reference = 31 Aug 2026).
 */
function currentContractStart(employment: Date, reference: Date): Date {
  const oneYearBefore = utcDate(
    reference.getUTCFullYear() - 1,
    reference.getUTCMonth() + 1,
    reference.getUTCDate(),
  );
  if (employment.getTime() > oneYearBefore.getTime()) {
    return employment;
  }
  const thisYear = anniversaryInYear(employment, reference.getUTCFullYear());
  if (thisYear.getTime() <= reference.getTime()) {
    return thisYear;
  }
  return anniversaryInYear(employment, reference.getUTCFullYear() - 1);
}

function contractEndFromStart(start: Date, employment: Date): Date {
  // End = next anniversary after start − 1 day.
  let next = anniversaryInYear(employment, start.getUTCFullYear());
  if (next.getTime() <= start.getTime()) {
    next = anniversaryInYear(employment, start.getUTCFullYear() + 1);
  }
  return addDays(next, -1);
}

function fullMonthlyAmount(sheetValue: number, workedDays: number): number {
  if (workedDays <= 0) return round2(sheetValue);
  if (workedDays >= 30) return round2(sheetValue);
  return round2((sheetValue * 30) / workedDays);
}

/**
 * Build lookup keys for ERP users. Many CCECC employees are stored as
 * firstName + middleName with an empty lastName (Ethiopian naming).
 * Never emit single-token keys - they collide across employees.
 */
function nameKeys(first: string, middle: string | null, last: string): string[] {
  const parts = [first, middle, last]
    .map((p) => (p ? normaliseAttendanceName(p).toLowerCase() : ''))
    .filter((p) => p.length > 0);
  const keys = new Set<string>();
  if (parts.length >= 2) {
    keys.add(normaliseAttendanceName(parts.join(' ')));
    keys.add(normaliseAttendanceName([...parts].reverse().join(' ')));
    // first + last (skip middle) when three parts
    if (parts.length === 3) {
      keys.add(normaliseAttendanceName(`${parts[0]} ${parts[2]}`));
      keys.add(normaliseAttendanceName(`${parts[2]} ${parts[0]}`));
      // first + middle (common sheet form when last is unused in DB)
      keys.add(normaliseAttendanceName(`${parts[0]} ${parts[1]}`));
      keys.add(normaliseAttendanceName(`${parts[1]} ${parts[0]}`));
    }
  }
  return [...keys];
}

function uniqueUsers(users: UserMatch[]): UserMatch[] {
  const map = new Map<string, UserMatch>();
  for (const u of users) {
    map.set(u.id, u);
  }
  return [...map.values()];
}

/** True when the two dates are the same year with day/month swapped. */
function isDayMonthSwap(a: Date, b: Date): boolean {
  return (
    a.getUTCFullYear() === b.getUTCFullYear() &&
    a.getUTCMonth() + 1 === b.getUTCDate() &&
    a.getUTCDate() === b.getUTCMonth() + 1 &&
    a.getTime() !== b.getTime()
  );
}

/**
 * Most recent employment anniversary on or before `onOrBefore`
 * (used for mid-year salary-change old-contract start).
 */
function mostRecentAnniversaryOnOrBefore(
  employment: Date,
  onOrBefore: Date,
): Date {
  const thisYear = anniversaryInYear(employment, onOrBefore.getUTCFullYear());
  if (thisYear.getTime() <= onOrBefore.getTime()) {
    return thisYear.getTime() < employment.getTime() ? employment : thisYear;
  }
  const lastYear = anniversaryInYear(
    employment,
    onOrBefore.getUTCFullYear() - 1,
  );
  return lastYear.getTime() < employment.getTime() ? employment : lastYear;
}

function tokenSet(name: string): Set<string> {
  return new Set(
    normaliseAttendanceName(name)
      .toLowerCase()
      .split(' ')
      .filter((t) => t.length > 0),
  );
}

function fuzzyScore(a: string, b: string): number {
  const sa = tokenSet(a);
  const sb = tokenSet(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) {
    if (sb.has(t)) inter += 1;
  }
  return inter / Math.max(sa.size, sb.size);
}

async function readSheetRows(): Promise<SheetRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SHEET_PATH);
  const sheet = wb.getWorksheet('Data');
  if (!sheet) {
    throw new Error('Sheet "Data" not found in August_2026_Salary.xlsx');
  }

  const rows: SheetRow[] = [];
  for (let r = 5; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const name = cellText(row.getCell(COL.name).value);
    const snRaw = row.getCell(COL.sn).value;
    const snText = cellText(snRaw).toUpperCase();
    if (snText === 'TOTAL' || name.toUpperCase() === 'TOTAL') {
      break;
    }
    // Trailing SUM row with no name.
    if (!name && (snRaw == null || cellText(snRaw) === '')) {
      const days = row.getCell(COL.workedDays).value;
      if (
        days &&
        typeof days === 'object' &&
        'formula' in (days as object)
      ) {
        break;
      }
      if (!cellText(row.getCell(COL.basic).value)) {
        continue;
      }
    }
    if (!name) {
      continue;
    }

    const snNum =
      snRaw == null || cellText(snRaw) === ''
        ? null
        : Number(cellText(snRaw));

    rows.push({
      excelRow: r,
      sn: Number.isFinite(snNum as number) ? (snNum as number) : null,
      name,
      position: cellText(row.getCell(COL.position).value),
      employmentRaw: row.getCell(COL.employmentDate).value,
      basic: cellNumber(row.getCell(COL.basic).value),
      workedDays: cellNumber(row.getCell(COL.workedDays).value),
      earned: cellNumber(row.getCell(COL.earned).value),
      transport: cellNumber(row.getCell(COL.transport).value),
      totalOt: cellNumber(row.getCell(COL.totalOt).value),
      bonus: cellNumber(row.getCell(COL.bonus).value),
      totalDeduction: cellNumber(row.getCell(COL.totalDeduction).value),
      netPay: cellNumber(row.getCell(COL.netPay).value),
      notes: cellText(row.getCell(COL.notes).value),
    });
  }
  return rows;
}

/** Group primary + continuation rows (same S/N, or empty S/N after a named row). */
function groupEmployees(rows: SheetRow[]): SheetRow[][] {
  const groups: SheetRow[][] = [];
  for (const row of rows) {
    const prev = groups[groups.length - 1];
    if (!prev) {
      groups.push([row]);
      continue;
    }
    const primary = prev[0];
    const sameSn =
      row.sn != null && primary.sn != null && row.sn === primary.sn;
    const emptySnContinuation =
      row.sn == null &&
      normaliseAttendanceName(row.name).toLowerCase() ===
        normaliseAttendanceName(primary.name).toLowerCase();
    if (sameSn || emptySnContinuation) {
      prev.push(row);
    } else {
      groups.push([row]);
    }
  }
  return groups;
}

async function nextContractNumber(
  tx: Prisma.TransactionClient | PrismaClient,
  counter: { value: number },
): Promise<string> {
  if (counter.value <= 0) {
    const result = await tx.$queryRaw<Array<{ nextval: bigint }>>`
      SELECT nextval('employee_contract_number_seq')
    `;
    counter.value = Number(result[0].nextval);
  } else {
    counter.value += 1;
    await tx.$executeRawUnsafe(
      `SELECT setval('employee_contract_number_seq', ${counter.value}, true)`,
    );
  }
  return `EC-${String(counter.value).padStart(4, '0')}`;
}

function buildReportMarkdown(report: ReportData): string {
  const lines: string[] = [];
  lines.push('# Contract seed report - August 2026 salary sheet');
  lines.push('');
  lines.push(`Mode: **${report.mode}**`);
  lines.push(`Employment date field: **${report.employmentDateField}**`);
  lines.push(`Reference date: **${iso(REFERENCE)}**`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push(`- Sheet employee rows (incl. salary-change continuations): ${report.sheetRows}`);
  lines.push(`- Employees matched (exact): ${report.employeesMatched}`);
  lines.push(`- Contracts to create (ACTIVE): ${report.contractsToCreateActive}`);
  lines.push(
    `- Contracts to create (SUPERSEDED): ${report.contractsToCreateSuperseded}`,
  );
  lines.push(`- Existing contracts soft-deleted: ${report.contractsSoftDeleted}`);
  lines.push('');

  lines.push('## Fuzzy candidates');
  lines.push('');
  if (report.fuzzyCandidates.length === 0) {
    lines.push('_None_');
  } else {
    for (const row of report.fuzzyCandidates) {
      lines.push(`- **${row.sheetName}** → ${row.candidates.join('; ')}`);
    }
  }
  lines.push('');

  lines.push('## Unmatched names');
  lines.push('');
  if (report.unmatchedNames.length === 0) {
    lines.push('_None_');
  } else {
    for (const name of report.unmatchedNames) {
      lines.push(`- ${name}`);
    }
  }
  lines.push('');

  lines.push('## Corrected dates (day/month swap on salary sheet)');
  lines.push('');
  if (report.correctedDates.length === 0) {
    lines.push('_None_');
  } else {
    for (const row of report.correctedDates) {
      lines.push(`- ${row.name}: raw \`${row.raw}\` → **${row.corrected}**`);
    }
  }
  lines.push('');

  lines.push('## Employment date disagreements (directory vs salary sheet)');
  lines.push('');
  if (report.dateDisagreements.length === 0) {
    lines.push('_None_');
  } else {
    lines.push(
      '| Employee | Directory | Salary sheet | Used | Day/month swap |',
    );
    lines.push('|---|---|---|---|---|');
    for (const row of report.dateDisagreements) {
      lines.push(
        `| ${row.name} | ${row.directoryDate} | ${row.salaryDate} | **${row.used}** | ${row.dayMonthSwap ? 'yes' : 'no'} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Missing dates (skipped)');
  lines.push('');
  if (report.missingDates.length === 0) {
    lines.push('_None_');
  } else {
    for (const name of report.missingDates) {
      lines.push(`- ${name}`);
    }
  }
  lines.push('');

  lines.push('## Contracts');
  lines.push('');
  lines.push(
    '| Employee | Contract # | Start | End | Status | Basic | Transport | Bonus |',
  );
  lines.push('|---|---|---|---|---|---:|---:|---:|');
  for (const c of report.contracts) {
    lines.push(
      `| ${c.employeeName} | ${c.contractNumber} | ${iso(c.startDate)} | ${iso(c.endDate)} | ${c.status} | ${c.basic.toFixed(2)} | ${c.transport.toFixed(2)} | ${c.bonus.toFixed(2)} |`,
    );
  }
  lines.push('');

  lines.push('## Derived full transport / bonus');
  lines.push('');
  lines.push(
    '| Employee | Worked days | Sheet transport → stored | Sheet bonus → stored |',
  );
  lines.push('|---|---:|---|---|');
  for (const row of report.derivedAmounts) {
    lines.push(
      `| ${row.name} | ${row.workedDays} | ${row.sheetTransport.toFixed(2)} → **${row.storedTransport.toFixed(2)}** | ${row.sheetBonus.toFixed(2)} → **${row.storedBonus.toFixed(2)}** |`,
    );
  }
  lines.push('');

  lines.push('## Anniversary renewals (salary change on anniversary)');
  lines.push('');
  if (report.salaryChanges.length === 0) {
    lines.push('_None_');
  } else {
    lines.push(
      '| Employee | Change day | Old basic | New basic | Old contract | New contract |',
    );
    lines.push('|---|---:|---:|---:|---|---|');
    for (const row of report.salaryChanges) {
      lines.push(
        `| ${row.name} | Aug ${row.changeDay} | ${row.oldBasic.toFixed(2)} | ${row.newBasic.toFixed(2)} | ${row.oldStart} → ${row.oldEnd} | ${row.newStart} → ${row.newEnd} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Mid-year salary changes');
  lines.push('');
  if (report.midYearSalaryChanges.length === 0) {
    lines.push('_None_');
  } else {
    lines.push(
      '| Employee | Change day | Anniversary | Old basic | New basic | Old contract | New contract |',
    );
    lines.push('|---|---:|---|---:|---:|---|---|');
    for (const row of report.midYearSalaryChanges) {
      lines.push(
        `| ${row.name} | Aug ${row.changeDay} | ${row.anniversary} | ${row.oldBasic.toFixed(2)} | ${row.newBasic.toFixed(2)} | ${row.oldStart} → ${row.oldEnd} | ${row.newStart} → ${row.newEnd} |`,
      );
    }
  }
  lines.push('');

  lines.push('## August anniversary, no salary change (extra previous contract)');
  lines.push('');
  if (report.augustAnniversaryNoChange.length === 0) {
    lines.push('_None_');
  } else {
    for (const name of report.augustAnniversaryNoChange) {
      lines.push(`- ${name}`);
    }
  }
  lines.push('');

  lines.push('## Skipped employees');
  lines.push('');
  if (report.skippedEmployees.length === 0) {
    lines.push('_None_');
  } else {
    for (const row of report.skippedEmployees) {
      lines.push(`- **${row.name}**: ${row.reason}`);
    }
  }
  lines.push('');

  lines.push('## Contracts expiring within 90 days of 31 Aug 2026');
  lines.push('');
  if (report.expiringWithin90Days.length === 0) {
    lines.push('_None_');
  } else {
    for (const row of report.expiringWithin90Days) {
      lines.push(
        `- ${row.name} (${row.contractNumber}) ends **${row.endDate}**`,
      );
    }
  }
  lines.push('');
  lines.push('_Salaries appear only in this report file._');
  lines.push('');
  return lines.join('\n');
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const mode = apply ? 'apply' : 'dry-run';

  const { host, database } = assertLocalhostSeedGuards();
  console.log(`[seed] ${mode} against ${host}/${database}`);
  console.log(`[seed] Input: ${SHEET_PATH}`);
  console.log(`[seed] Directory: ${DIRECTORY_PATH}`);
  console.log(`[seed] Employment date field: User.employmentDate`);

  const sheetRows = await readSheetRows();
  const groups = groupEmployees(sheetRows);
  const directoryEntries = readDirectoryEntries();
  console.log(
    `[seed] Sheet data rows: ${sheetRows.length}; employee groups: ${groups.length}; directory dates: ${directoryEntries.length}`,
  );

  const prisma = new PrismaClient();
  const report: ReportData = {
    mode,
    sheetRows: sheetRows.length,
    employeesMatched: 0,
    contractsToCreateActive: 0,
    contractsToCreateSuperseded: 0,
    contractsSoftDeleted: 0,
    employmentDateField: 'User.employmentDate',
    fuzzyCandidates: [],
    unmatchedNames: [],
    correctedDates: [],
    missingDates: [],
    derivedAmounts: [],
    salaryChanges: [],
    midYearSalaryChanges: [],
    dateDisagreements: [],
    augustAnniversaryNoChange: [],
    renewalMismatches: [],
    skippedEmployees: [],
    contracts: [],
    expiringWithin90Days: [],
  };

  try {
    const users = await prisma.user.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null, isActive: true },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
        employeeType: true,
        employmentDate: true,
      },
    });

    const byEmployeeId = new Map<string, UserMatch>();
    for (const user of users) {
      if (user.employeeId) {
        byEmployeeId.set(user.employeeId, user);
      }
    }

    const byKey = new Map<string, UserMatch[]>();
    const byCompact = new Map<string, UserMatch[]>();
    for (const user of users) {
      for (const key of nameKeys(user.firstName, user.middleName, user.lastName)) {
        const list = byKey.get(key) ?? [];
        list.push(user);
        byKey.set(key, list);
      }
      const compact = compactName(
        [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
      );
      if (compact.length > 0) {
        const list = byCompact.get(compact) ?? [];
        list.push(user);
        byCompact.set(compact, list);
      }
    }

    const resolveUserByName = (name: string): UserMatch | undefined => {
      const aliasId = NAME_ALIASES[name];
      if (aliasId) {
        return byEmployeeId.get(aliasId);
      }
      const sheetNameKey = normaliseAttendanceName(name).toLowerCase();
      const reversedKey = normaliseAttendanceName(
        name.split(/\s+/).reverse().join(' '),
      ).toLowerCase();
      const exact = uniqueUsers(
        byKey.get(sheetNameKey) ?? byKey.get(reversedKey) ?? [],
      );
      if (exact.length === 1) return exact[0];
      if (exact.length > 1) return undefined;
      const compactHits = uniqueUsers(byCompact.get(compactName(name)) ?? []);
      if (compactHits.length === 1) return compactHits[0];
      return undefined;
    };

    // Map directory dates onto ERP users (same matching + aliases + compact).
    const directoryByUserId = new Map<
      string,
      { date: Date; rawLabel: string; directoryName: string }
    >();
    for (const entry of directoryEntries) {
      const matched = resolveUserByName(entry.name);
      if (!matched) continue;
      if (!directoryByUserId.has(matched.id)) {
        directoryByUserId.set(matched.id, {
          date: entry.date,
          rawLabel: entry.rawLabel,
          directoryName: entry.name,
        });
      }
    }

    const plannedByEmployee = new Map<
      string,
      { user: UserMatch; employment: Date; contracts: Omit<PlannedContract, 'contractNumber'>[] }
    >();

    for (const group of groups) {
      const primary = group[0];

      let user: UserMatch | undefined = resolveUserByName(primary.name);
      if (!user) {
        const sheetNameKey = normaliseAttendanceName(primary.name).toLowerCase();
        const reversedKey = normaliseAttendanceName(
          primary.name.split(/\s+/).reverse().join(' '),
        ).toLowerCase();
        const exact = uniqueUsers(
          byKey.get(sheetNameKey) ?? byKey.get(reversedKey) ?? [],
        );
        if (exact.length > 1) {
          report.fuzzyCandidates.push({
            sheetName: primary.name,
            candidates: exact.map(
              (u) =>
                `${u.firstName} ${u.middleName ?? ''} ${u.lastName} (${u.employeeId ?? u.id})`.replace(
                  /\s+/g,
                  ' ',
                ),
            ),
          });
          report.skippedEmployees.push({
            name: primary.name,
            reason: 'Multiple exact key matches',
          });
          continue;
        }
        const scored = users
          .map((u) => {
            const full = [u.firstName, u.middleName, u.lastName]
              .filter(Boolean)
              .join(' ');
            const fl = [u.firstName, u.lastName].filter(Boolean).join(' ');
            const fm = [u.firstName, u.middleName].filter(Boolean).join(' ');
            return {
              user: u,
              score: Math.max(
                fuzzyScore(primary.name, full),
                fuzzyScore(primary.name, fl),
                fuzzyScore(primary.name, fm),
                fuzzyScore(primary.name, `${u.lastName} ${u.firstName}`),
                fuzzyScore(primary.name, `${u.middleName ?? ''} ${u.firstName}`),
              ),
            };
          })
          .filter((s) => s.score >= 0.5)
          .sort((a, b) => b.score - a.score)
          .slice(0, 5);
        if (scored.length > 0) {
          report.fuzzyCandidates.push({
            sheetName: primary.name,
            candidates: scored.map(
              (s) =>
                `${s.user.firstName} ${s.user.middleName ?? ''} ${s.user.lastName} (${s.user.employeeId ?? s.user.id}, score=${s.score.toFixed(2)})`.replace(
                  /\s+/g,
                  ' ',
                ),
            ),
          });
        }
        report.unmatchedNames.push(primary.name);
        continue;
      }

      const salaryParsed = parseEmploymentDate(primary.employmentRaw, REFERENCE);
      if (salaryParsed.corrected && salaryParsed.date) {
        report.correctedDates.push({
          name: primary.name,
          raw: salaryParsed.rawLabel,
          corrected: iso(salaryParsed.date),
        });
      }

      const directoryHit = directoryByUserId.get(user.id);
      let employment: Date | null = null;
      let usedSource: 'directory' | 'salary' | null = null;

      if (directoryHit) {
        employment = directoryHit.date;
        usedSource = 'directory';
      } else if (salaryParsed.date) {
        employment = salaryParsed.date;
        usedSource = 'salary';
      }

      if (
        directoryHit &&
        salaryParsed.date &&
        directoryHit.date.getTime() !== salaryParsed.date.getTime()
      ) {
        report.dateDisagreements.push({
          name: primary.name,
          directoryDate: iso(directoryHit.date),
          salaryDate: iso(salaryParsed.date),
          used: 'directory',
          dayMonthSwap: isDayMonthSwap(directoryHit.date, salaryParsed.date),
        });
      }

      if (!employment) {
        report.missingDates.push(primary.name);
        report.skippedEmployees.push({
          name: primary.name,
          reason: 'Missing employment date (directory and salary sheet)',
        });
        continue;
      }
      void usedSource;

      // Freelancers always pay pension.
      const pensionApplicable = true;
      const contracts: Omit<PlannedContract, 'contractNumber'>[] = [];

      if (group.length === 1) {
        const row = group[0];
        const storedTransport = fullMonthlyAmount(row.transport, row.workedDays);
        const storedBonus = fullMonthlyAmount(row.bonus, row.workedDays);
        if (row.workedDays < 30) {
          report.derivedAmounts.push({
            name: primary.name,
            workedDays: row.workedDays,
            sheetTransport: row.transport,
            storedTransport,
            sheetBonus: row.bonus,
            storedBonus,
          });
        }

        const start = currentContractStart(employment, REFERENCE);
        const end = contractEndFromStart(start, employment);
        contracts.push({
          employeeUserId: user.id,
          employeeName: primary.name,
          employeeCode: user.employeeId,
          status: EmployeeContractStatus.ACTIVE,
          contractType: EmployeeContractType.FIXED_TERM,
          startDate: start,
          endDate: end,
          signedAt: start,
          basic: round2(row.basic),
          transport: storedTransport,
          bonus: storedBonus,
          pensionApplicable,
          sheetTransport: row.transport,
          sheetBonus: row.bonus,
          workedDays: row.workedDays,
        });

        const startDay = start.getUTCDate();
        const isAugustStart =
          start.getUTCFullYear() === 2026 &&
          start.getUTCMonth() === 7 &&
          startDay >= 2 &&
          startDay <= 31;
        const isRenewalNotJoiner = employment.getTime() < start.getTime();
        if (isAugustStart && isRenewalNotJoiner) {
          const prevStartCandidate = anniversaryInYear(
            employment,
            start.getUTCFullYear() - 1,
          );
          const prevStart =
            prevStartCandidate.getTime() < employment.getTime()
              ? employment
              : prevStartCandidate;
          const prevEnd = addDays(start, -1);
          contracts.unshift({
            employeeUserId: user.id,
            employeeName: primary.name,
            employeeCode: user.employeeId,
            status: EmployeeContractStatus.SUPERSEDED,
            contractType: EmployeeContractType.FIXED_TERM,
            startDate: prevStart,
            endDate: prevEnd,
            signedAt: prevStart,
            basic: round2(row.basic),
            transport: storedTransport,
            bonus: storedBonus,
            pensionApplicable,
            sheetTransport: row.transport,
            sheetBonus: row.bonus,
            workedDays: row.workedDays,
          });
          report.augustAnniversaryNoChange.push(primary.name);
        }
      } else if (group.length === 2) {
        const [row1, row2] = group;
        const d = row1.workedDays;
        const renewalDay = d + 1;
        if (d + row2.workedDays !== 31) {
          report.skippedEmployees.push({
            name: primary.name,
            reason: `Worked days ${d} + ${row2.workedDays} ≠ 31`,
          });
          continue;
        }
        const thisYearAnniv = anniversaryInYear(employment, 2026);
        const renewalDate = utcDate(2026, 8, renewalDay);
        const isAnniversaryRenewal =
          thisYearAnniv.getTime() === renewalDate.getTime();

        const storedTransport1 = fullMonthlyAmount(row1.transport, row1.workedDays);
        const storedBonus1 = fullMonthlyAmount(row1.bonus, row1.workedDays);
        const storedTransport2 = fullMonthlyAmount(row2.transport, row2.workedDays);
        const storedBonus2 = fullMonthlyAmount(row2.bonus, row2.workedDays);
        report.derivedAmounts.push({
          name: `${primary.name} (old)`,
          workedDays: row1.workedDays,
          sheetTransport: row1.transport,
          storedTransport: storedTransport1,
          sheetBonus: row1.bonus,
          storedBonus: storedBonus1,
        });
        report.derivedAmounts.push({
          name: `${primary.name} (new)`,
          workedDays: row2.workedDays,
          sheetTransport: row2.transport,
          storedTransport: storedTransport2,
          sheetBonus: row2.bonus,
          storedBonus: storedBonus2,
        });

        const oldEnd = utcDate(2026, 8, d);
        const newStart = renewalDate;
        const newEnd = contractEndFromStart(newStart, employment);
        // Anniversary renewals: previous year's anniversary.
        // Mid-year changes: most recent anniversary on or before the change.
        const lastYearAnniv = anniversaryInYear(employment, 2025);
        const oldStart = isAnniversaryRenewal
          ? lastYearAnniv.getTime() < employment.getTime()
            ? employment
            : lastYearAnniv
          : mostRecentAnniversaryOnOrBefore(employment, oldEnd);
        // No AMENDMENT enum - mid-year changes use RENEWAL.
        const newType = EmployeeContractType.RENEWAL;

        contracts.push(
          {
            employeeUserId: user.id,
            employeeName: primary.name,
            employeeCode: user.employeeId,
            status: EmployeeContractStatus.SUPERSEDED,
            contractType: EmployeeContractType.FIXED_TERM,
            startDate: oldStart,
            endDate: oldEnd,
            signedAt: oldStart,
            basic: round2(row1.basic),
            transport: storedTransport1,
            bonus: storedBonus1,
            pensionApplicable,
            sheetTransport: row1.transport,
            sheetBonus: row1.bonus,
            workedDays: row1.workedDays,
          },
          {
            employeeUserId: user.id,
            employeeName: primary.name,
            employeeCode: user.employeeId,
            status: EmployeeContractStatus.ACTIVE,
            contractType: newType,
            startDate: newStart,
            endDate: newEnd,
            signedAt: newStart,
            basic: round2(row2.basic),
            transport: storedTransport2,
            bonus: storedBonus2,
            pensionApplicable,
            sheetTransport: row2.transport,
            sheetBonus: row2.bonus,
            workedDays: row2.workedDays,
          },
        );

        if (isAnniversaryRenewal) {
          report.salaryChanges.push({
            name: primary.name,
            changeDay: renewalDay,
            oldBasic: round2(row1.basic),
            newBasic: round2(row2.basic),
            oldStart: iso(oldStart),
            oldEnd: iso(oldEnd),
            newStart: iso(newStart),
            newEnd: iso(newEnd),
          });
        } else {
          report.midYearSalaryChanges.push({
            name: primary.name,
            changeDay: renewalDay,
            anniversary: iso(thisYearAnniv),
            oldBasic: round2(row1.basic),
            newBasic: round2(row2.basic),
            oldStart: iso(oldStart),
            oldEnd: iso(oldEnd),
            newStart: iso(newStart),
            newEnd: iso(newEnd),
          });
        }
      } else {
        report.skippedEmployees.push({
          name: primary.name,
          reason: `Unexpected ${group.length} sheet rows`,
        });
        continue;
      }

      plannedByEmployee.set(user.id, { user, employment, contracts });
      report.employeesMatched += 1;
    }

    // Assign contract numbers (dry-run peeks sequence without advancing permanently
    // unless --apply). For dry-run we simulate numbers from current sequence value.
    const seqPeek = await prisma.$queryRaw<Array<{ last_value: bigint; is_called: boolean }>>`
      SELECT last_value, is_called FROM employee_contract_number_seq
    `;
    let nextSeq = Number(seqPeek[0].last_value) + (seqPeek[0].is_called ? 1 : 0);

    const allPlanned: PlannedContract[] = [];
    for (const entry of plannedByEmployee.values()) {
      for (const c of entry.contracts) {
        const contractNumber = `EC-${String(nextSeq).padStart(4, '0')}`;
        nextSeq += 1;
        const planned: PlannedContract = { ...c, contractNumber };
        allPlanned.push(planned);
        if (c.status === EmployeeContractStatus.ACTIVE) {
          report.contractsToCreateActive += 1;
        } else {
          report.contractsToCreateSuperseded += 1;
        }
      }
    }
    report.contracts = allPlanned;

    const expiryCutoff = addDays(REFERENCE, 90);
    for (const c of allPlanned) {
      if (
        c.status === EmployeeContractStatus.ACTIVE &&
        c.endDate.getTime() <= expiryCutoff.getTime()
      ) {
        report.expiringWithin90Days.push({
          name: c.employeeName,
          contractNumber: c.contractNumber,
          endDate: iso(c.endDate),
        });
      }
    }

    const matchedIds = [...plannedByEmployee.keys()];
    const existingCount =
      matchedIds.length === 0
        ? 0
        : await prisma.employeeContract.count({
            where: {
              companyId: COMPANY_ID,
              employeeId: { in: matchedIds },
              deletedAt: null,
            },
          });
    report.contractsSoftDeleted = existingCount;

    if (apply) {
      const counter = { value: 0 };
      await prisma.$transaction(async (tx) => {
        const now = new Date();
        if (matchedIds.length > 0) {
          await tx.employeeContract.updateMany({
            where: {
              companyId: COMPANY_ID,
              employeeId: { in: matchedIds },
              deletedAt: null,
            },
            data: {
              deletedAt: now,
              deletedBy: ACTOR_ID,
              updatedBy: ACTOR_ID,
            },
          });
        }

        for (const entry of plannedByEmployee.values()) {
          await tx.user.update({
            where: { id: entry.user.id },
            data: {
              employmentDate: entry.employment,
              updatedBy: ACTOR_ID,
            },
          });

          for (const c of entry.contracts) {
            const contractNumber = await nextContractNumber(tx, counter);
            await tx.employeeContract.create({
              data: {
                id: randomUUID(),
                companyId: COMPANY_ID,
                contractNumber,
                employeeId: entry.user.id,
                contractType: c.contractType,
                status: c.status,
                signedAt: c.signedAt,
                startDate: c.startDate,
                endDate: c.endDate,
                currency: SupportedCurrency.ETB,
                pensionApplicable: c.pensionApplicable,
                taxApplicable: true,
                basicSalary: new Prisma.Decimal(c.basic.toFixed(2)),
                transportationAllowance: new Prisma.Decimal(
                  c.transport.toFixed(2),
                ),
                monthlyBonus: new Prisma.Decimal(c.bonus.toFixed(2)),
                monthlyNetBonus: new Prisma.Decimal('0'),
                notes: SEED_NOTE,
                createdBy: ACTOR_ID,
                updatedBy: ACTOR_ID,
              },
            });
          }
        }
      });
      console.log('[seed] Apply transaction committed.');
    } else {
      console.log('[seed] Dry run only - no database writes.');
    }

    mkdirSync(join(__dirname, '..', 'data', 'private'), { recursive: true });
    writeFileSync(REPORT_PATH, buildReportMarkdown(report), 'utf8');
    console.log(`[seed] Report written: ${REPORT_PATH}`);
    console.log(
      `[seed] Matched ${report.employeesMatched}; active ${report.contractsToCreateActive}; superseded ${report.contractsToCreateSuperseded}; soft-delete ${report.contractsSoftDeleted}`,
    );
    console.log(
      `[seed] Fuzzy ${report.fuzzyCandidates.length}; unmatched ${report.unmatchedNames.length}; missing dates ${report.missingDates.length}; date disagreements ${report.dateDisagreements.length}`,
    );
    console.log(
      `[seed] Anniversary renewals ${report.salaryChanges.length}; mid-year changes ${report.midYearSalaryChanges.length}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('seed-contracts-from-august-2026 failed:', error);
  process.exit(1);
});
