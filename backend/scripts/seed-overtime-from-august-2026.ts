/**
 * Seed August 2026 overtime from HR's salary sheet as approved sheets with
 * dated entries (local DB only). Default is dry-run; stop after report review.
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/seed-overtime-from-august-2026.ts
 *   npx ts-node --transpile-only scripts/seed-overtime-from-august-2026.ts --apply
 *
 * Salary amounts appear only in data/private/overtime-seed-report.md.
 */
import { randomUUID } from 'crypto';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import ExcelJS from 'exceljs';
import {
  AttendanceDayStatus,
  LeaveRequestStatus,
  OvertimeSheetStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { normaliseAttendanceName } from '../src/modules/attendance/application/services/attendance-matching.service';
import {
  calculateOvertimeHours,
  type OvertimeDayContext,
} from '../src/modules/overtime/application/utils/overtime-hours.util';
import {
  computeSelectableOvertimeWindows,
  isIntervalInsideSelectableWindows,
} from '../src/modules/overtime/application/utils/overtime-selectable-windows.util';
import {
  assignOvertimeToSalaryPeriods,
  calculateOvertimePay,
  type DatedOvertimeEntry,
  type SalaryPeriodWindow,
} from '../src/modules/payroll/application/utils/payroll-overtime.util';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325';
const MONTH = 8;
const YEAR = 2026;
const MONTH_START = utcDate(YEAR, MONTH, 1);
const MONTH_END = utcDate(YEAR, MONTH, 31);
const TASK =
  'Imported from HR August 2026 salary sheet';
/** HR sheet hours exceed the short old contract window - spillover + exclude from pay compare. */
const EXCLUDE_FROM_HR_COMPARE = new Set(['CC-0024']); // Habtamu Gizaw
const SHEET_PATH = join(
  __dirname,
  '..',
  'data',
  'private',
  'August_2026_Salary.xlsx',
);
const REPORT_PATH = join(
  __dirname,
  '..',
  'data',
  'private',
  'overtime-seed-report.md',
);

/** Same aliases as seed-contracts-from-august-2026.ts */
const NAME_ALIASES: Readonly<Record<string, string>> = {
  'Lakew Gulema Urge': 'CC-0037',
  'Tesfaye Tsega Beyin': 'CC-0073',
  'Tewodros Desye Sisay': 'CC-0076',
  'Tsebaot Minda Tadesse': 'CC-0077',
  'Samuel H/mariam': 'CC-0059',
  'Haile Micheal Mulugeta': 'CC-0026',
};

const COL = {
  sn: 4, // D
  name: 5, // E
  normalHr: 13, // M
  normalPay: 14, // N
  eveningHr: 15, // O
  eveningPay: 16, // P
  sundayHr: 17, // Q
  sundayPay: 18, // R
  holidayHr: 19, // S
  holidayPay: 20, // T
} as const;

/**
 * Absences do not block OT (may be worked from home). Only approved full-day
 * leave is blocked (via leaveDates). Prefer present days when spreading.
 */
const PREFERRED_ATTENDANCE = new Set<AttendanceDayStatus>([
  AttendanceDayStatus.PRESENT,
  AttendanceDayStatus.WORK_FROM_HOME,
  AttendanceDayStatus.ON_SITE,
  AttendanceDayStatus.HALF_ABSENT,
  AttendanceDayStatus.HOLIDAY,
  AttendanceDayStatus.SUNDAY,
]);

const WD: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: true,
  isHalfDay: false,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: '13:30',
  afternoonEnd: '17:30',
};

const HALF: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: true,
  isHalfDay: true,
  morningStart: '08:30',
  morningEnd: '12:30',
  afternoonStart: null,
  afternoonEnd: null,
};

const OFF: OvertimeDayContext = {
  isHoliday: false,
  isWorkingDay: false,
  isHalfDay: false,
  morningStart: null,
  morningEnd: null,
  afternoonStart: null,
  afternoonEnd: null,
};

type OtCategory = 'normal' | 'night' | 'weekend' | 'holiday';

interface SheetRow {
  excelRow: number;
  sn: number | null;
  name: string;
  normalHours: number;
  eveningHours: number;
  sundayHours: number;
  holidayHours: number;
  normalPay: number;
  eveningPay: number;
  sundayPay: number;
  holidayPay: number;
}

interface UserMatch {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeId: string | null;
  employmentDate: Date | null;
}

interface PlannedEntry {
  date: Date;
  startTime: string;
  endTime: string;
  endsAtEndOfDay: boolean;
  isHoliday: boolean;
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
}

interface SlotSpec {
  start: string;
  end: string;
  capacityHours: number;
}

interface DaySlot {
  date: Date;
  start: string;
  end: string;
  capacityHours: number;
  preferred: boolean;
}

interface PlaceFailure {
  employeeId: string | null;
  name: string;
  category: OtCategory;
  hoursNeeded: number;
  capacityAvailable: number;
  reason: string;
}

interface MovedHours {
  employeeId: string | null;
  name: string;
  category: OtCategory;
  hoursMoved: number;
  fromLabel: string;
  toLabel: string;
}

interface EmployeePlan {
  user: UserMatch;
  rows: SheetRow[];
  windows: Array<{
    row: SheetRow;
    windowStart: Date;
    windowEnd: Date;
    label: string;
  }>;
  entries: PlannedEntry[];
  withoutAttendance: string[];
  excludeFromHrCompare: boolean;
  payCompare: {
    computed: ReturnType<typeof calculateOvertimePay>;
    hr: {
      normalPay: number;
      eveningPay: number;
      sundayPay: number;
      holidayPay: number;
    };
    diffs: string[];
  } | null;
}

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const next = new Date(d.getTime());
  next.setUTCDate(next.getUTCDate() + n);
  return next;
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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

function hasOt(row: SheetRow): boolean {
  return (
    row.normalHours > 0 ||
    row.eveningHours > 0 ||
    row.sundayHours > 0 ||
    row.holidayHours > 0
  );
}

function nameKeys(first: string, middle: string | null, last: string): string[] {
  const parts = [first, middle, last]
    .map((p) => (p ? normaliseAttendanceName(p).toLowerCase() : ''))
    .filter((p) => p.length > 0);
  const keys = new Set<string>();
  if (parts.length >= 2) {
    keys.add(normaliseAttendanceName(parts.join(' ')));
    keys.add(normaliseAttendanceName([...parts].reverse().join(' ')));
    if (parts.length === 3) {
      keys.add(normaliseAttendanceName(`${parts[0]} ${parts[2]}`));
      keys.add(normaliseAttendanceName(`${parts[2]} ${parts[0]}`));
      keys.add(normaliseAttendanceName(`${parts[0]} ${parts[1]}`));
      keys.add(normaliseAttendanceName(`${parts[1]} ${parts[0]}`));
    }
  }
  return [...keys];
}

function compactName(name: string): string {
  return normaliseAttendanceName(name).toLowerCase().replace(/\s+/g, '');
}

function uniqueUsers(users: UserMatch[]): UserMatch[] {
  const map = new Map<string, UserMatch>();
  for (const u of users) map.set(u.id, u);
  return [...map.values()];
}

function parseHhMm(value: string): number {
  if (value === '24:00') return 24 * 60;
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

function formatHhMm(minutes: number): string {
  if (minutes >= 24 * 60) return '24:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function eachDate(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    out.push(d);
  }
  return out;
}

function dayContext(date: Date, holidayKeys: Set<string>): OvertimeDayContext {
  if (holidayKeys.has(iso(date))) {
    return { ...WD, isHoliday: true };
  }
  const dow = date.getUTCDay();
  if (dow === 0) return OFF;
  if (dow === 6) return HALF;
  return WD;
}

function selectableInput(ctx: OvertimeDayContext) {
  return {
    isHoliday: ctx.isHoliday,
    isWorkingDay: ctx.isWorkingDay,
    isHalfDay: ctx.isHalfDay,
    morningStart: ctx.morningStart,
    morningEnd: ctx.morningEnd,
    afternoonStart: ctx.afternoonStart,
    afternoonEnd: ctx.afternoonEnd,
    leaveExcludedWindows: [] as Array<{ start: string; end: string }>,
    hasFullDayLeave: false,
  };
}

function categorySlots(category: OtCategory, date: Date, holidayKeys: Set<string>): SlotSpec[] {
  const key = iso(date);
  const isHol = holidayKeys.has(key);
  const dow = date.getUTCDay(); // 0 Sun … 6 Sat

  if (category === 'holiday') {
    if (!isHol) return [];
    return [{ start: '08:00', end: '24:00', capacityHours: 16 }];
  }
  if (isHol) return [];

  if (category === 'normal') {
    if (dow >= 1 && dow <= 5) {
      return [
        { start: '17:30', end: '22:00', capacityHours: 4.5 },
        { start: '06:00', end: '08:30', capacityHours: 2.5 },
      ];
    }
    return [];
  }
  if (category === 'night') {
    if (dow >= 1 && dow <= 5) {
      return [
        { start: '22:00', end: '24:00', capacityHours: 2 },
        { start: '00:00', end: '06:00', capacityHours: 6 },
      ];
    }
    return [];
  }
  // weekend
  if (dow === 6) {
    return [{ start: '12:30', end: '24:00', capacityHours: 11.5 }];
  }
  if (dow === 0) {
    return [{ start: '00:00', end: '24:00', capacityHours: 24 }];
  }
  return [];
}

function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

function minutesToHours(minutes: number): number {
  return round2(minutes / 60);
}

/**
 * Spread hours across day-slots (prefer present). Places as many minutes as
 * fit; returns unplacedHours for spillover to the next contract period.
 * Approved leave days are skipped; absences are allowed.
 */
function placeCategoryHours(input: {
  neededHours: number;
  category: OtCategory;
  windowStart: Date;
  windowEnd: Date;
  holidayKeys: Set<string>;
  attendanceByDate: Map<string, AttendanceDayStatus | 'PRESENT_FLAG' | 'UNKNOWN'>;
  leaveDates: Set<string>;
  occupied: Map<string, Array<{ start: number; end: number }>>;
}): {
  entries: PlannedEntry[];
  withoutAttendance: string[];
  failure: PlaceFailure | null;
  capacityAvailable: number;
  placedHours: number;
  unplacedHours: number;
} {
  const neededMin = hoursToMinutes(input.neededHours);
  if (neededMin <= 0) {
    return {
      entries: [],
      withoutAttendance: [],
      failure: null,
      capacityAvailable: 0,
      placedHours: 0,
      unplacedHours: 0,
    };
  }

  const daySlots: DaySlot[] = [];
  for (const date of eachDate(input.windowStart, input.windowEnd)) {
    const key = iso(date);
    if (input.leaveDates.has(key)) continue;
    const status = input.attendanceByDate.get(key);
    // Absences are allowed (OT may be from home). Leave already skipped above.
    const preferred =
      status === 'PRESENT_FLAG' ||
      (status != null &&
        status !== 'UNKNOWN' &&
        PREFERRED_ATTENDANCE.has(status as AttendanceDayStatus));

    for (const slot of categorySlots(input.category, date, input.holidayKeys)) {
      const ctx = dayContext(date, input.holidayKeys);
      const windows = computeSelectableOvertimeWindows(selectableInput(ctx));
      if (
        !isIntervalInsideSelectableWindows(slot.start, slot.end, windows.windows)
      ) {
        continue;
      }
      // Remaining free capacity after occupied intervals.
      const occ = input.occupied.get(key) ?? [];
      const slotStart = parseHhMm(slot.start);
      const slotEnd = parseHhMm(slot.end);
      let free = slotEnd - slotStart;
      for (const w of occ) {
        const overlap = Math.max(
          0,
          Math.min(slotEnd, w.end) - Math.max(slotStart, w.start),
        );
        free -= overlap;
      }
      if (free < 1) continue;
      daySlots.push({
        date,
        start: slot.start,
        end: slot.end,
        capacityHours: minutesToHours(free),
        preferred,
      });
    }
  }

  daySlots.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    const da = a.date.getTime() - b.date.getTime();
    if (da !== 0) return da;
    return parseHhMm(a.start) - parseHhMm(b.start);
  });

  const capacityAvailable = round2(
    daySlots.reduce((sum, s) => sum + s.capacityHours, 0),
  );
  const placeMin = Math.min(neededMin, hoursToMinutes(capacityAvailable));
  const unplacedMin = neededMin - placeMin;

  if (placeMin <= 0) {
    return {
      entries: [],
      withoutAttendance: [],
      failure: null,
      capacityAvailable,
      placedHours: 0,
      unplacedHours: minutesToHours(unplacedMin),
    };
  }

  const preferredSlots = daySlots.filter((s) => s.preferred);
  const pool = preferredSlots.length > 0 ? preferredSlots : daySlots;
  let uniqueDays = [...new Set(pool.map((s) => iso(s.date)))];
  const remainingBySlot = new Map<string, number>();
  for (const s of daySlots) {
    remainingBySlot.set(
      `${iso(s.date)}|${s.start}`,
      hoursToMinutes(s.capacityHours),
    );
  }

  const allocMinBySlot = new Map<string, number>();
  let remaining = placeMin;

  const tryAllocate = (chunk: number, days: string[]): boolean => {
    for (const dayKey of days) {
      if (remaining < chunk) return false;
      const slotsForDay = daySlots.filter((s) => iso(s.date) === dayKey);
      for (const slot of slotsForDay) {
        const id = `${iso(slot.date)}|${slot.start}`;
        const left = remainingBySlot.get(id) ?? 0;
        if (left < chunk) continue;
        remainingBySlot.set(id, left - chunk);
        allocMinBySlot.set(id, (allocMinBySlot.get(id) ?? 0) + chunk);
        remaining -= chunk;
        return true;
      }
    }
    return false;
  };

  for (const chunk of [60, 15, 1]) {
    let progress = true;
    while (remaining >= chunk && progress) {
      progress = tryAllocate(chunk, uniqueDays);
      if (!progress && preferredSlots.length > 0) {
        uniqueDays = [...new Set(daySlots.map((s) => iso(s.date)))];
        progress = tryAllocate(chunk, uniqueDays);
      }
    }
  }

  if (remaining > 0) {
    return {
      entries: [],
      withoutAttendance: [],
      failure: {
        employeeId: null,
        name: '',
        category: input.category,
        hoursNeeded: input.neededHours,
        capacityAvailable,
        reason: `Could not distribute ${minutesToHours(remaining)} h after slot fill`,
      },
      capacityAvailable,
      placedHours: 0,
      unplacedHours: input.neededHours,
    };
  }

  const withoutAttendance: string[] = [];
  const entries: PlannedEntry[] = [];

  for (const slot of daySlots) {
    const id = `${iso(slot.date)}|${slot.start}`;
    const alloc = allocMinBySlot.get(id) ?? 0;
    if (alloc <= 0) continue;

    const slotStart = parseHhMm(slot.start);
    const slotEnd = parseHhMm(slot.end);
    const occupied = input.occupied.get(iso(slot.date)) ?? [];
    const startMin = firstFreeStart(slotStart, slotEnd, occupied, alloc);
    if (startMin == null) {
      return {
        entries: [],
        withoutAttendance: [],
        capacityAvailable,
        failure: {
          employeeId: null,
          name: '',
          category: input.category,
          hoursNeeded: input.neededHours,
          capacityAvailable,
          reason: `No free contiguous ${alloc}m in ${iso(slot.date)} ${slot.start}–${slot.end}`,
        },
        placedHours: 0,
        unplacedHours: input.neededHours,
      };
    }
    const endMin = startMin + alloc;
    const startTime = formatHhMm(startMin);
    const endTime = formatHhMm(endMin);
    const endsAtEndOfDay = endTime === '24:00';

    const ctx = dayContext(slot.date, input.holidayKeys);
    const windows = computeSelectableOvertimeWindows(selectableInput(ctx));
    if (!isIntervalInsideSelectableWindows(startTime, endTime, windows.windows)) {
      return {
        entries: [],
        withoutAttendance: [],
        capacityAvailable,
        failure: {
          employeeId: null,
          name: '',
          category: input.category,
          hoursNeeded: input.neededHours,
          capacityAvailable,
          reason: `Interval ${startTime}–${endTime} on ${iso(slot.date)} outside selectable windows`,
        },
        placedHours: 0,
        unplacedHours: input.neededHours,
      };
    }

    const classified = calculateOvertimeHours(
      slot.date,
      startTime,
      endTime,
      ctx,
      false,
    );
    const hours = minutesToHours(alloc);
    const expected: Record<OtCategory, number> = {
      normal: classified.regularHours,
      night: classified.nightHours,
      weekend: classified.weekendHours,
      holiday: classified.holidayHours,
    };
    if (Math.abs(expected[input.category] - hours) > 0.01) {
      return {
        entries: [],
        withoutAttendance: [],
        capacityAvailable,
        failure: {
          employeeId: null,
          name: '',
          category: input.category,
          hoursNeeded: input.neededHours,
          capacityAvailable,
          reason: `Classification mismatch on ${iso(slot.date)} ${startTime}–${endTime}: wanted ${hours} ${input.category}, got N=${classified.regularHours} E=${classified.nightHours} W=${classified.weekendHours} H=${classified.holidayHours}`,
        },
        placedHours: 0,
        unplacedHours: input.neededHours,
      };
    }

    const att = input.attendanceByDate.get(iso(slot.date));
    const hasAttendanceImport = input.attendanceByDate.size > 0;
    const isPresent =
      att === 'PRESENT_FLAG' ||
      (att != null &&
        att !== 'UNKNOWN' &&
        PREFERRED_ATTENDANCE.has(att as AttendanceDayStatus));
    if (hasAttendanceImport && !isPresent) {
      withoutAttendance.push(
        `${iso(slot.date)} ${startTime}–${endTime} (${input.category} ${hours}h)`,
      );
    }

    occupied.push({ start: startMin, end: endMin });
    input.occupied.set(iso(slot.date), occupied);

    entries.push({
      date: slot.date,
      startTime,
      endTime,
      endsAtEndOfDay,
      isHoliday: input.category === 'holiday' || ctx.isHoliday,
      regularHours: classified.regularHours,
      nightHours: classified.nightHours,
      weekendHours: classified.weekendHours,
      holidayHours: classified.holidayHours,
    });
  }

  return {
    entries,
    withoutAttendance,
    failure: null,
    capacityAvailable,
    placedHours: minutesToHours(placeMin),
    unplacedHours: minutesToHours(unplacedMin),
  };
}

/** First minute in [slotStart, slotEnd) with `alloc` contiguous free minutes. */
function firstFreeStart(
  slotStart: number,
  slotEnd: number,
  occupied: Array<{ start: number; end: number }>,
  alloc: number,
): number | null {
  let cursor = slotStart;
  const sorted = [...occupied].sort((a, b) => a.start - b.start);
  for (const w of sorted) {
    if (w.end <= cursor) continue;
    if (w.start > cursor && w.start - cursor >= alloc) {
      return cursor;
    }
    cursor = Math.max(cursor, w.end);
  }
  if (slotEnd - cursor >= alloc) return cursor;
  return null;
}

function timeUtc(hhmm: string): Date {
  if (hhmm === '24:00') {
    return new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
  }
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const { host, database } = assertLocalhostSeedGuards();
  console.log(
    `[ot-seed] ${apply ? 'APPLY' : 'dry-run'} against ${host}/${database}`,
  );

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
      excelRow: r,
      sn: Number.isFinite(snNum as number) ? (snNum as number) : null,
      name,
      normalHours: cellNumber(row.getCell(COL.normalHr).value),
      eveningHours: cellNumber(row.getCell(COL.eveningHr).value),
      sundayHours: cellNumber(row.getCell(COL.sundayHr).value),
      holidayHours: cellNumber(row.getCell(COL.holidayHr).value),
      normalPay: cellNumber(row.getCell(COL.normalPay).value),
      eveningPay: cellNumber(row.getCell(COL.eveningPay).value),
      sundayPay: cellNumber(row.getCell(COL.sundayPay).value),
      holidayPay: cellNumber(row.getCell(COL.holidayPay).value),
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
    } else if (next && next.sn === primary.sn && next.name === primary.name) {
      group.push(next);
      i += 1;
    }
    groups.push(group);
  }

  const prisma = new PrismaClient();
  const report: string[] = [
    '# Overtime seed from August 2026 salary sheet',
    '',
    `Mode: **${apply ? 'apply' : 'dry-run'}**`,
    `Database: \`${host}/${database}\``,
    '',
  ];

  try {
    const contractCount = await prisma.employeeContract.count({
      where: {
        companyId: COMPANY_ID,
        deletedAt: null,
        startDate: { lte: MONTH_END },
        OR: [{ endDate: null }, { endDate: { gte: MONTH_START } }],
      },
    });
    if (contractCount === 0) {
      console.error(
        'Precondition failed: no employee contracts overlap August 2026. Run seed-contracts-from-august-2026.ts --apply first.',
      );
      process.exit(1);
    }
    report.push(`## Preconditions`);
    report.push('');
    report.push(`- August-overlapping contracts: **${contractCount}**`);

    const holidays = await prisma.publicHoliday.findMany({
      where: {
        companyId: COMPANY_ID,
        deletedAt: null,
        isActive: true,
        date: { gte: MONTH_START, lte: MONTH_END },
      },
      select: { date: true, name: true },
      orderBy: { date: 'asc' },
    });
    const holidayKeys = new Set(holidays.map((h) => iso(h.date)));
    const totalHolidayHours = rows.reduce((s, r) => s + r.holidayHours, 0);
    if (totalHolidayHours > 0 && holidays.length === 0) {
      console.error(
        'Precondition failed: salary sheet has holiday OT hours but no public holiday exists in August 2026. Add Mawlid (or the HR holiday date) first.',
      );
      process.exit(1);
    }
    report.push(
      `- August public holidays: ${
        holidays.length === 0
          ? '_none_'
          : holidays.map((h) => `**${iso(h.date)}** (${h.name})`).join(', ')
      }`,
    );
    report.push('');

    const users = await prisma.user.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null, isActive: true },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
        employmentDate: true,
      },
    });

    const byEmployeeId = new Map<string, UserMatch>();
    const byKey = new Map<string, UserMatch[]>();
    const byCompact = new Map<string, UserMatch[]>();
    for (const user of users) {
      if (user.employeeId) byEmployeeId.set(user.employeeId, user);
      for (const key of nameKeys(user.firstName, user.middleName, user.lastName)) {
        const list = byKey.get(key) ?? [];
        list.push(user);
        byKey.set(key, list);
      }
      const compact = compactName(
        [user.firstName, user.middleName, user.lastName].filter(Boolean).join(' '),
      );
      if (compact) {
        const list = byCompact.get(compact) ?? [];
        list.push(user);
        byCompact.set(compact, list);
      }
    }

    const resolveUserByName = (name: string): UserMatch | undefined => {
      const aliasId = NAME_ALIASES[name];
      if (aliasId) return byEmployeeId.get(aliasId);
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

    const couldNotPlace: PlaceFailure[] = [];
    const movedHoursList: MovedHours[] = [];
    const classificationMismatches: string[] = [];
    const dualRowNotes: string[] = [];
    const unmatched: string[] = [];
    const plans: EmployeePlan[] = [];
    const allWithoutAttendance: string[] = [];
    const excludedFromCompare: string[] = [];

    for (const group of groups) {
      if (!group.some(hasOt)) continue;
      const primary = group[0]!;
      const user = resolveUserByName(primary.name);
      if (!user) {
        unmatched.push(primary.name);
        continue;
      }

      const contracts = await prisma.employeeContract.findMany({
        where: {
          companyId: COMPANY_ID,
          employeeId: user.id,
          deletedAt: null,
          startDate: { lte: MONTH_END },
          OR: [{ endDate: null }, { endDate: { gte: MONTH_START } }],
        },
        orderBy: { startDate: 'asc' },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          basicSalary: true,
          status: true,
        },
      });

      if (contracts.length === 0) {
        couldNotPlace.push({
          employeeId: user.employeeId,
          name: primary.name,
          category: 'normal',
          hoursNeeded: 0,
          capacityAvailable: 0,
          reason: 'No August-overlapping contract',
        });
        continue;
      }

      const employment =
        user.employmentDate ?? contracts[0]!.startDate;
      const windows: EmployeePlan['windows'] = [];

      if (group.length === 1) {
        windows.push({
          row: group[0]!,
          windowStart: maxDate(MONTH_START, employment),
          windowEnd: MONTH_END,
          label: 'single-row',
        });
      } else {
        const oldContract = contracts[0]!;
        const newContract = contracts[contracts.length - 1]!;
        const oldEnd = oldContract.endDate
          ? minDate(oldContract.endDate, MONTH_END)
          : MONTH_END;
        const oldStart = maxDate(MONTH_START, oldContract.startDate);
        const newStart = maxDate(MONTH_START, newContract.startDate);
        const newEnd = newContract.endDate
          ? minDate(newContract.endDate, MONTH_END)
          : MONTH_END;
        windows.push({
          row: group[0]!,
          windowStart: oldStart,
          windowEnd: oldEnd,
          label: `old-contract ${iso(oldStart)}–${iso(oldEnd)}`,
        });
        windows.push({
          row: group[1]!,
          windowStart: newStart,
          windowEnd: newEnd,
          label: `new-contract ${iso(newStart)}–${iso(newEnd)}`,
        });
        dualRowNotes.push(
          `- **${primary.name}** (${user.employeeId}): row1 → ${iso(oldStart)}–${iso(oldEnd)}; row2 → ${iso(newStart)}–${iso(newEnd)}` +
            ` | row1 N/E/W/H ${group[0]!.normalHours}/${group[0]!.eveningHours}/${group[0]!.sundayHours}/${group[0]!.holidayHours}` +
            ` | row2 ${group[1]!.normalHours}/${group[1]!.eveningHours}/${group[1]!.sundayHours}/${group[1]!.holidayHours}`,
        );
      }

      const attendanceRecord = await prisma.attendanceRecord.findFirst({
        where: {
          companyId: COMPANY_ID,
          employeeId: user.id,
          month: MONTH,
          year: YEAR,
        },
        select: { id: true },
      });
      const attendanceByDate = new Map<
        string,
        AttendanceDayStatus | 'PRESENT_FLAG' | 'UNKNOWN'
      >();
      if (attendanceRecord) {
        const logs = await prisma.attendanceDailyLog.findMany({
          where: { attendanceRecordId: attendanceRecord.id },
          select: { date: true, dayStatus: true, wasPresent: true },
        });
        for (const log of logs) {
          attendanceByDate.set(
            iso(log.date),
            log.wasPresent ? 'PRESENT_FLAG' : log.dayStatus,
          );
        }
      }

      const leavePeriods = await prisma.leaveRequestPeriod.findMany({
        where: {
          startDate: { lte: MONTH_END },
          endDate: { gte: MONTH_START },
          leaveRequest: {
            companyId: COMPANY_ID,
            employeeId: user.id,
            status: LeaveRequestStatus.APPROVED,
            deletedAt: null,
          },
        },
        select: { startDate: true, endDate: true, dayPortion: true },
      });
      const leaveDates = new Set<string>();
      for (const period of leavePeriods) {
        if (period.dayPortion !== 'FULL') continue;
        for (const d of eachDate(
          maxDate(period.startDate, MONTH_START),
          minDate(period.endDate, MONTH_END),
        )) {
          leaveDates.add(iso(d));
        }
      }

      const occupied = new Map<string, Array<{ start: number; end: number }>>();
      const allEntries: PlannedEntry[] = [];
      const withoutAttendance: string[] = [];
      let failed = false;

      const categories: Array<{
        key: OtCategory;
        hours: (row: SheetRow) => number;
      }> = [
        { key: 'holiday', hours: (r) => r.holidayHours },
        { key: 'weekend', hours: (r) => r.sundayHours },
        { key: 'night', hours: (r) => r.eveningHours },
        { key: 'normal', hours: (r) => r.normalHours },
      ];

      for (let wi = 0; wi < windows.length; wi += 1) {
        const w = windows[wi]!;
        if (!hasOt(w.row)) continue;
        if (w.windowStart.getTime() > w.windowEnd.getTime()) {
          couldNotPlace.push({
            employeeId: user.employeeId,
            name: primary.name,
            category: 'normal',
            hoursNeeded:
              w.row.normalHours +
              w.row.eveningHours +
              w.row.sundayHours +
              w.row.holidayHours,
            capacityAvailable: 0,
            reason: `Empty date window (${w.label})`,
          });
          failed = true;
          break;
        }

        for (const cat of categories) {
          let remaining = cat.hours(w.row);
          if (remaining <= 0) continue;

          let periodIndex = wi;
          while (remaining > 0.009 && periodIndex < windows.length) {
            const target = windows[periodIndex]!;
            const placed = placeCategoryHours({
              neededHours: remaining,
              category: cat.key,
              windowStart: target.windowStart,
              windowEnd: target.windowEnd,
              holidayKeys,
              attendanceByDate,
              leaveDates,
              occupied,
            });
            if (placed.failure) {
              couldNotPlace.push({
                ...placed.failure,
                employeeId: user.employeeId,
                name: primary.name,
                reason: `${target.label}: ${placed.failure.reason}`,
              });
              failed = true;
              break;
            }
            allEntries.push(...placed.entries);
            withoutAttendance.push(...placed.withoutAttendance);
            if (periodIndex > wi && placed.placedHours > 0.009) {
              movedHoursList.push({
                employeeId: user.employeeId,
                name: primary.name,
                category: cat.key,
                hoursMoved: placed.placedHours,
                fromLabel: w.label,
                toLabel: target.label,
              });
            }
            remaining = round2(placed.unplacedHours);
            if (remaining > 0.009) {
              if (periodIndex + 1 >= windows.length) {
                couldNotPlace.push({
                  employeeId: user.employeeId,
                  name: primary.name,
                  category: cat.key,
                  hoursNeeded: remaining,
                  capacityAvailable: placed.capacityAvailable,
                  reason: `Unplaced ${remaining} h after ${target.label} (no further contract period)`,
                });
                failed = true;
                break;
              }
              periodIndex += 1;
            } else {
              break;
            }
          }
          if (failed) break;
        }
        if (failed) break;
      }

      if (failed) continue;

      // Verify totals vs sheet (±0.01)
      const sheetTotals = {
        normal: round2(group.reduce((s, r) => s + r.normalHours, 0)),
        night: round2(group.reduce((s, r) => s + r.eveningHours, 0)),
        weekend: round2(group.reduce((s, r) => s + r.sundayHours, 0)),
        holiday: round2(group.reduce((s, r) => s + r.holidayHours, 0)),
      };
      const entryTotals = {
        normal: round2(allEntries.reduce((s, e) => s + e.regularHours, 0)),
        night: round2(allEntries.reduce((s, e) => s + e.nightHours, 0)),
        weekend: round2(allEntries.reduce((s, e) => s + e.weekendHours, 0)),
        holiday: round2(allEntries.reduce((s, e) => s + e.holidayHours, 0)),
      };
      const mismatchCats: string[] = [];
      for (const k of ['normal', 'night', 'weekend', 'holiday'] as const) {
        if (Math.abs(sheetTotals[k] - entryTotals[k]) > 0.01) {
          mismatchCats.push(
            `${k}: sheet ${sheetTotals[k]} vs placed ${entryTotals[k]}`,
          );
        }
      }
      if (mismatchCats.length > 0) {
        classificationMismatches.push(
          `- **${primary.name}** (${user.employeeId}): ${mismatchCats.join('; ')}`,
        );
        continue;
      }

      const excludeFromHrCompare = Boolean(
        user.employeeId && EXCLUDE_FROM_HR_COMPARE.has(user.employeeId),
      );
      if (excludeFromHrCompare) {
        excludedFromCompare.push(
          `- **${primary.name}** (${user.employeeId}): Excluded: hours exceed what the old contract period allows`,
        );
      }

      // Pay comparison (amounts only in report); skipped for excluded employees.
      let payCompare: EmployeePlan['payCompare'] = null;
      if (!excludeFromHrCompare) {
        const periods: SalaryPeriodWindow[] = contracts.map((c) => ({
          contractId: c.id,
          periodStart: maxDate(c.startDate, MONTH_START),
          periodEnd: c.endDate ? minDate(c.endDate, MONTH_END) : MONTH_END,
          basicSalary: Number(c.basicSalary),
        }));
        // Unrounded minute-precise hours so fractional Excel values match HR pay.
        const dated: DatedOvertimeEntry[] = allEntries.map((e) => {
          const raw = calculateOvertimeHours(
            e.date,
            e.startTime,
            e.endTime,
            dayContext(e.date, holidayKeys),
            false,
            undefined,
            { round: false },
          );
          return {
            date: e.date,
            isOvernight: false,
            normalHours: raw.regularHours,
            eveningHours: raw.nightHours,
            sundayHours: raw.weekendHours,
            holidayHours: raw.holidayHours,
          };
        });
        const monthEndBasic = Number(
          contracts[contracts.length - 1]!.basicSalary,
        );
        const assigned = assignOvertimeToSalaryPeriods({
          entries: dated,
          periods,
          monthEndBasic,
        });
        const hr = {
          normalPay: round2(group.reduce((s, r) => s + r.normalPay, 0)),
          eveningPay: round2(group.reduce((s, r) => s + r.eveningPay, 0)),
          sundayPay: round2(group.reduce((s, r) => s + r.sundayPay, 0)),
          holidayPay: round2(group.reduce((s, r) => s + r.holidayPay, 0)),
        };
        const diffs: string[] = [];
        const pairs: Array<[string, number, number]> = [
          ['Normal', assigned.totals.normalOtPay, hr.normalPay],
          ['Evening', assigned.totals.eveningOtPay, hr.eveningPay],
          ['Weekend', assigned.totals.sundayOtPay, hr.sundayPay],
          ['Holiday', assigned.totals.holidayOtPay, hr.holidayPay],
        ];
        for (const [label, computed, hrAmt] of pairs) {
          if (Math.abs(computed - hrAmt) > 0.05) {
            diffs.push(
              `${label}: computed ${computed.toFixed(2)} vs HR ${hrAmt.toFixed(2)} (Δ ${(computed - hrAmt).toFixed(2)})`,
            );
          }
        }
        payCompare = {
          computed: {
            normalOtPay: assigned.totals.normalOtPay,
            eveningOtPay: assigned.totals.eveningOtPay,
            sundayOtPay: assigned.totals.sundayOtPay,
            holidayOtPay: assigned.totals.holidayOtPay,
            totalOtPay: assigned.totals.totalOtPay,
          },
          hr,
          diffs,
        };
      }

      plans.push({
        user,
        rows: group,
        windows,
        entries: allEntries,
        withoutAttendance,
        excludeFromHrCompare,
        payCompare,
      });
      for (const line of withoutAttendance) {
        allWithoutAttendance.push(`- **${primary.name}**: ${line}`);
      }
    }

    // Existing sheets to delete
    const matchedIds = plans.map((p) => p.user.id);
    const existingSheets = await prisma.overtimeSheet.findMany({
      where: {
        companyId: COMPANY_ID,
        month: MONTH,
        year: YEAR,
        employeeId: { in: matchedIds },
      },
      select: { id: true, employeeId: true, deletedAt: true },
    });

    let deletedSheets = 0;
    if (apply && plans.length > 0) {
      await prisma.$transaction(async (tx) => {
        if (existingSheets.length > 0) {
          await tx.overtimeEntry.deleteMany({
            where: { sheetId: { in: existingSheets.map((s) => s.id) } },
          });
          await tx.overtimeSheet.deleteMany({
            where: { id: { in: existingSheets.map((s) => s.id) } },
          });
          deletedSheets = existingSheets.length;
        }

        for (const plan of plans) {
          const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
            SELECT nextval('overtime_sheet_number_seq')
          `;
          const sheetNumber = `OT-${String(Number(seq[0]!.nextval)).padStart(4, '0')}`;
          const sheetId = randomUUID();
          const totR = round2(plan.entries.reduce((s, e) => s + e.regularHours, 0));
          const totN = round2(plan.entries.reduce((s, e) => s + e.nightHours, 0));
          const totW = round2(plan.entries.reduce((s, e) => s + e.weekendHours, 0));
          const totH = round2(plan.entries.reduce((s, e) => s + e.holidayHours, 0));

          await tx.overtimeSheet.create({
            data: {
              id: sheetId,
              companyId: COMPANY_ID,
              sheetNumber,
              employeeId: plan.user.id,
              month: MONTH,
              year: YEAR,
              status: OvertimeSheetStatus.APPROVED,
              totalRegularHours: new Prisma.Decimal(totR),
              totalNightHours: new Prisma.Decimal(totN),
              totalWeekendHours: new Prisma.Decimal(totW),
              totalHolidayHours: new Prisma.Decimal(totH),
              submittedAt: MONTH_END,
              completedAt: MONTH_END,
              createdBy: ACTOR_ID,
              updatedBy: ACTOR_ID,
            },
          });

          for (const entry of plan.entries) {
            const entryId = randomUUID();
            await tx.overtimeEntry.create({
              data: {
                id: entryId,
                sheetId,
                date: entry.date,
                startTime: timeUtc(entry.startTime),
                endTime: timeUtc(entry.endTime),
                isHoliday: entry.isHoliday,
                isOvernight: false,
                regularHours: new Prisma.Decimal(entry.regularHours),
                nightHours: new Prisma.Decimal(entry.nightHours),
                weekendHours: new Prisma.Decimal(entry.weekendHours),
                holidayHours: new Prisma.Decimal(entry.holidayHours),
                taskDescription: TASK,
              },
            });
            await tx.$executeRaw`
              UPDATE overtime_entry
              SET ends_at_end_of_day = ${entry.endsAtEndOfDay}
              WHERE id = ${entryId}
            `;
          }
        }
      });
    } else {
      deletedSheets = existingSheets.length;
    }

    // Report
    const totalEntries = plans.reduce((s, p) => s + p.entries.length, 0);
    const sumCat = {
      normal: round2(plans.reduce((s, p) => s + p.entries.reduce((a, e) => a + e.regularHours, 0), 0)),
      night: round2(plans.reduce((s, p) => s + p.entries.reduce((a, e) => a + e.nightHours, 0), 0)),
      weekend: round2(plans.reduce((s, p) => s + p.entries.reduce((a, e) => a + e.weekendHours, 0), 0)),
      holiday: round2(plans.reduce((s, p) => s + p.entries.reduce((a, e) => a + e.holidayHours, 0), 0)),
    };

    report.push('## Summary');
    report.push('');
    report.push(`- Employees with OT planned: **${plans.length}**`);
    report.push(`- Sheets ${apply ? 'written' : 'to write'}: **${plans.length}**`);
    report.push(`- Entries ${apply ? 'written' : 'planned'}: **${totalEntries}**`);
    report.push(
      `- Hours Normal / Evening / Weekend / Holiday: **${sumCat.normal}** / **${sumCat.night}** / **${sumCat.weekend}** / **${sumCat.holiday}**`,
    );
    report.push(
      `- Existing August sheets for matched employees ${apply ? 'deleted' : 'would delete'}: **${deletedSheets}**`,
    );
    report.push(`- Unmatched sheet names with OT: **${unmatched.length}**`);
    report.push('');

    if (unmatched.length > 0) {
      report.push('## Unmatched');
      report.push('');
      for (const n of unmatched) report.push(`- ${n}`);
      report.push('');
    }

    report.push('## Two-row employees');
    report.push('');
    if (dualRowNotes.length === 0) report.push('_None_');
    else report.push(...dualRowNotes);
    report.push('');

    report.push('## Could not place');
    report.push('');
    if (couldNotPlace.length === 0) {
      report.push('_None_');
    } else {
      for (const f of couldNotPlace) {
        report.push(
          `- **${f.name}** (${f.employeeId ?? '-'}) · ${f.category}: need ${f.hoursNeeded} h, capacity ${f.capacityAvailable} h - ${f.reason}`,
        );
      }
    }
    report.push('');

    report.push('## Moved to the next contract period');
    report.push('');
    if (movedHoursList.length === 0) {
      report.push('_None_');
    } else {
      for (const m of movedHoursList) {
        report.push(
          `- **${m.name}** (${m.employeeId ?? '-'}) · ${m.category}: **${m.hoursMoved} h** moved from ${m.fromLabel} → ${m.toLabel}`,
        );
      }
    }
    report.push('');

    report.push('## Excluded from HR OT comparison');
    report.push('');
    if (excludedFromCompare.length === 0) report.push('_None_');
    else report.push(...excludedFromCompare);
    report.push('');

    report.push('## Classification mismatches');
    report.push('');
    if (classificationMismatches.length === 0) report.push('_None_');
    else report.push(...classificationMismatches);
    report.push('');

    report.push('## Placed on days without attendance');
    report.push('');
    if (allWithoutAttendance.length === 0) report.push('_None_');
    else report.push(...allWithoutAttendance.slice(0, 200));
    if (allWithoutAttendance.length > 200) {
      report.push(`- _…and ${allWithoutAttendance.length - 200} more_`);
    }
    report.push('');

    report.push('## API / form attendance check');
    report.push('');
    report.push(
      '- Overtime **save/preview reject only approved full-day leave** (`FULL_DAY_LEAVE_MESSAGE`). Absences are **not** rejected.',
    );
    report.push(
      '- Attendance mismatches produce a **non-blocking warning** (`buildAttendanceWarning`) only.',
    );
    report.push(
      '- Entry form selectable windows come from the server; leave blocks times, absence does not.',
    );
    report.push('');

    report.push('## OT pay comparison (computed vs HR)');
    report.push('');
    report.push(
      '| Employee | ID | Comp N | HR N | Comp E | HR E | Comp W | HR W | Comp H | HR H | Diffs |',
    );
    report.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');
    const compared = plans.filter((p) => p.payCompare != null);
    for (const plan of compared) {
      const pc = plan.payCompare!;
      const name = [plan.user.firstName, plan.user.middleName, plan.user.lastName]
        .filter(Boolean)
        .join(' ');
      report.push(
        `| ${name} | ${plan.user.employeeId ?? '-'} | ${pc.computed.normalOtPay.toFixed(2)} | ${pc.hr.normalPay.toFixed(2)} | ${pc.computed.eveningOtPay.toFixed(2)} | ${pc.hr.eveningPay.toFixed(2)} | ${pc.computed.sundayOtPay.toFixed(2)} | ${pc.hr.sundayPay.toFixed(2)} | ${pc.computed.holidayOtPay.toFixed(2)} | ${pc.hr.holidayPay.toFixed(2)} | ${pc.diffs.length === 0 ? 'OK' : pc.diffs.join('; ')} |`,
      );
    }
    report.push('');

    const payOk = compared.filter((p) => (p.payCompare?.diffs.length ?? 0) === 0)
      .length;
    report.push(
      `Pay matches (±0.05): **${payOk}** / **${compared.length}** compared (excluded ${plans.length - compared.length}).`,
    );
    report.push('');
    report.push('_Dry-run complete - review before `--apply`._');

    mkdirSync(join(__dirname, '..', 'data', 'private'), { recursive: true });
    writeFileSync(REPORT_PATH, report.join('\n'), 'utf8');

    console.log(`[ot-seed] Report: ${REPORT_PATH}`);
    console.log(
      `[ot-seed] Planned ${plans.length} sheets / ${totalEntries} entries; could-not-place ${couldNotPlace.length}; moved ${movedHoursList.length}; pay OK ${payOk}/${compared.length}; holiday ${[...holidayKeys].join(',') || 'none'}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
