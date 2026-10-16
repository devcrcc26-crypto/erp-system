/**
 * Seed dated overtime entries from HR's August 2026 salary sheet (local DB).
 * For two-row (salary-change) employees: old-row OT → a date in the old
 * contract's August window; new-row OT → a date in the new window.
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/seed-ot-entries-from-august-2026.ts
 *   npx ts-node --transpile-only scripts/seed-ot-entries-from-august-2026.ts --apply
 */
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import { PrismaClient } from '@prisma/client';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';
const MONTH = 8;
const YEAR = 2026;
const SHEET_PATH = join(__dirname, '..', 'data', 'private', 'August_2026_Salary.xlsx');
const REPORT_PATH = join(
  __dirname,
  '..',
  'data',
  'private',
  'ot-entry-seed-report.md',
);

const NAME_ALIASES: Readonly<Record<string, string>> = {
  'Lakew Gulema Urge': 'CC-0037',
  'Tesfaye Tsega Beyin': 'CC-0073',
  'Tewodros Desye Sisay': 'CC-0076',
  'Tsebaot Minda Tadesse': 'CC-0077',
  'Samuel H/mariam': 'CC-0059',
  'Haile Micheal Mulugeta': 'CC-0026',
};

const COL = {
  sn: 4,
  name: 5,
  workedDays: 9,
  normalHr: 13,
  eveningHr: 15,
  sundayHr: 17,
  holidayHr: 19,
} as const;

interface SheetRow {
  sn: number | null;
  name: string;
  workedDays: number;
  normalHours: number;
  eveningHours: number;
  sundayHours: number;
  holidayHours: number;
}

function cellNumber(value: unknown): number {
  if (value == null || value === '') return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellNumber((value as { result: unknown }).result);
  }
  const n = Number(String(value).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function cellText(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellText((value as { result: unknown }).result);
  }
  return String(value).trim();
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function hasOt(row: SheetRow): boolean {
  return (
    row.normalHours > 0 ||
    row.eveningHours > 0 ||
    row.sundayHours > 0 ||
    row.holidayHours > 0
  );
}

/** Midpoint calendar day of [start, end] clipped to August 2026. */
function pickDateInWindow(start: Date, end: Date): Date {
  const monthStart = utcDate(YEAR, MONTH, 1);
  const monthEnd = utcDate(YEAR, MONTH, 31);
  const lo = new Date(Math.max(start.getTime(), monthStart.getTime()));
  const hi = new Date(Math.min(end.getTime(), monthEnd.getTime()));
  if (lo.getTime() > hi.getTime()) {
    return monthStart;
  }
  const mid = new Date((lo.getTime() + hi.getTime()) / 2);
  return utcDate(mid.getUTCFullYear(), mid.getUTCMonth() + 1, mid.getUTCDate());
}

function timeUtc(hours: number, minutes = 0): Date {
  return new Date(Date.UTC(1970, 0, 1, hours, minutes, 0));
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const { host, database } = assertLocalhostSeedGuards();
  console.log(`[ot-seed] ${apply ? 'apply' : 'dry-run'} against ${host}/${database}`);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SHEET_PATH);
  const sheet = wb.getWorksheet('Data');
  if (!sheet) throw new Error('Sheet "Data" not found');

  const rows: SheetRow[] = [];
  for (let r = 5; r <= sheet.rowCount; r += 1) {
    const row = sheet.getRow(r);
    const name = cellText(row.getCell(COL.name).value);
    const snText = cellText(row.getCell(COL.sn).value).toUpperCase();
    if (snText === 'TOTAL' || name.toUpperCase() === 'TOTAL') break;
    if (!name) continue;
    const snRaw = row.getCell(COL.sn).value;
    const snNum =
      snRaw == null || cellText(snRaw) === ''
        ? null
        : Number(cellText(snRaw));
    rows.push({
      sn: Number.isFinite(snNum as number) ? (snNum as number) : null,
      name,
      workedDays: cellNumber(row.getCell(COL.workedDays).value),
      normalHours: cellNumber(row.getCell(COL.normalHr).value),
      eveningHours: cellNumber(row.getCell(COL.eveningHr).value),
      sundayHours: cellNumber(row.getCell(COL.sundayHr).value),
      holidayHours: cellNumber(row.getCell(COL.holidayHr).value),
    });
  }

  const groups: SheetRow[][] = [];
  for (let i = 0; i < rows.length; i += 1) {
    const primary = rows[i]!;
    if (primary.sn == null) continue;
    const group = [primary];
    const next = rows[i + 1];
    if (next && next.sn == null && next.name === primary.name) {
      group.push(next);
      i += 1;
    } else if (
      next &&
      next.sn === primary.sn &&
      next.name === primary.name
    ) {
      group.push(next);
      i += 1;
    }
    groups.push(group);
  }

  const dualGroups = groups.filter((g) => g.length === 2 && g.some(hasOt));
  const prisma = new PrismaClient();
  const reportLines: string[] = [
    '# OT entry seed from August 2026 salary sheet',
    '',
    `Mode: **${apply ? 'apply' : 'dry-run'}**`,
    '',
    '## Dual-row employees with OT',
    '',
  ];

  try {
    const users = await prisma.user.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null, isActive: true },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
      },
    });
    const byCode = new Map(
      users.filter((u) => u.employeeId).map((u) => [u.employeeId!, u]),
    );
    const byFull = new Map(
      users.map((u) => {
        const full = [u.firstName, u.middleName, u.lastName]
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();
        return [full, u] as const;
      }),
    );

    const resolve = (name: string) => {
      const alias = NAME_ALIASES[name];
      if (alias) return byCode.get(alias);
      return byFull.get(name.toLowerCase());
    };

    let created = 0;
    for (const group of dualGroups) {
      const [oldRow, newRow] = group;
      const user = resolve(oldRow!.name);
      if (!user) {
        reportLines.push(`- **${oldRow!.name}**: unmatched - skipped`);
        continue;
      }

      const monthStart = utcDate(YEAR, MONTH, 1);
      const monthEnd = utcDate(YEAR, MONTH, 31);
      const contracts = await prisma.employeeContract.findMany({
        where: {
          companyId: COMPANY_ID,
          employeeId: user.id,
          deletedAt: null,
          startDate: { lte: monthEnd },
          OR: [{ endDate: null }, { endDate: { gte: monthStart } }],
        },
        orderBy: { startDate: 'asc' },
        select: { id: true, startDate: true, endDate: true, status: true },
      });

      if (contracts.length < 2) {
        reportLines.push(
          `- **${oldRow!.name}** (${user.employeeId}): need ≥2 overlapping contracts, found ${contracts.length}`,
        );
        continue;
      }

      const oldContract = contracts[0]!;
      const newContract = contracts[contracts.length - 1]!;
      const oldEnd = oldContract.endDate ?? utcDate(YEAR, MONTH, oldRow!.workedDays);
      const newStart = newContract.startDate;

      const oldDate = pickDateInWindow(oldContract.startDate, oldEnd);
      const newDate = pickDateInWindow(newStart, newContract.endDate ?? monthEnd);

      reportLines.push(
        `- **${oldRow!.name}** (${user.employeeId}): old OT → **${iso(oldDate)}** (contract ${iso(oldContract.startDate)}–${iso(oldEnd)}); new OT → **${iso(newDate)}** (contract ${iso(newStart)}–${iso(newContract.endDate ?? monthEnd)})`,
      );
      reportLines.push(
        `  - Old hours N/E/S/H: ${oldRow!.normalHours}/${oldRow!.eveningHours}/${oldRow!.sundayHours}/${oldRow!.holidayHours}`,
      );
      reportLines.push(
        `  - New hours N/E/S/H: ${newRow!.normalHours}/${newRow!.eveningHours}/${newRow!.sundayHours}/${newRow!.holidayHours}`,
      );

      if (!apply) continue;

      let otSheet = await prisma.overtimeSheet.findFirst({
        where: {
          companyId: COMPANY_ID,
          employeeId: user.id,
          month: MONTH,
          year: YEAR,
          deletedAt: null,
        },
      });

      if (!otSheet) {
        otSheet = await prisma.overtimeSheet.create({
          data: {
            companyId: COMPANY_ID,
            employeeId: user.id,
            month: MONTH,
            year: YEAR,
            status: 'APPROVED',
            sheetNumber: `OT-SEED-${user.employeeId ?? user.id.slice(0, 8)}-${YEAR}${String(MONTH).padStart(2, '0')}`,
            totalRegularHours: 0,
            totalNightHours: 0,
            totalWeekendHours: 0,
            totalHolidayHours: 0,
            createdBy: ACTOR_ID,
            updatedBy: ACTOR_ID,
          },
        });
      }

      await prisma.overtimeEntry.deleteMany({ where: { sheetId: otSheet.id } });

      const entryRows = [
        { row: oldRow!, date: oldDate, startH: 18, endH: 20 },
        { row: newRow!, date: newDate, startH: 18, endH: 20 },
      ];

      let totN = 0;
      let totE = 0;
      let totS = 0;
      let totH = 0;
      for (const { row, date, startH, endH } of entryRows) {
        if (!hasOt(row)) continue;
        await prisma.overtimeEntry.create({
          data: {
            sheetId: otSheet.id,
            date,
            startTime: timeUtc(startH),
            endTime: timeUtc(endH),
            isHoliday: row.holidayHours > 0,
            isOvernight: false,
            regularHours: row.normalHours,
            nightHours: row.eveningHours,
            weekendHours: row.sundayHours,
            holidayHours: row.holidayHours,
            taskDescription:
              'Seeded from August 2026 salary sheet (dated to contract period)',
          },
        });
        totN += row.normalHours;
        totE += row.eveningHours;
        totS += row.sundayHours;
        totH += row.holidayHours;
        created += 1;
      }

      await prisma.overtimeSheet.update({
        where: { id: otSheet.id },
        data: {
          status: 'APPROVED',
          totalRegularHours: totN,
          totalNightHours: totE,
          totalWeekendHours: totS,
          totalHolidayHours: totH,
          updatedBy: ACTOR_ID,
        },
      });
    }

    reportLines.push('');
    reportLines.push(`Entries ${apply ? 'created' : 'planned'}: ${created || '(see above)'}`);
    mkdirSync(join(__dirname, '..', 'data', 'private'), { recursive: true });
    writeFileSync(REPORT_PATH, reportLines.join('\n'), 'utf8');
    console.log(`[ot-seed] Report: ${REPORT_PATH}`);
    console.log(`[ot-seed] Dual-row groups with OT: ${dualGroups.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
