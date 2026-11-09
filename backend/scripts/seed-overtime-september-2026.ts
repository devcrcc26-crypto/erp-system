/**
 * Seed September 2026 overtime as dated daily entries that follow OT rules
 * (schedule + public holidays + site-assignment days), then mark sheets
 * APPROVED via supervisor → HR Manager.
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'
 *   $env:DRY_RUN='true'   # default: log only
 *   npx ts-node --transpile-only scripts/seed-overtime-september-2026.ts
 *
 *   $env:DRY_RUN='false'
 *   npx ts-node --transpile-only scripts/seed-overtime-september-2026.ts --apply
 */
import { randomUUID } from 'crypto';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  LeaveRequestStatus,
  OvertimeSheetStatus,
  Prisma,
  PrismaClient,
  SiteAssignmentStatus,
} from '@prisma/client';
import { normaliseAttendanceName } from '../src/modules/attendance/application/services/attendance-matching.service';
import {
  calculateOvertimeHoursDetailed,
  type OvertimeDayContext,
} from '../src/modules/overtime/application/utils/overtime-hours.util';
import {
  computeSelectableOvertimeWindows,
  isIntervalInsideSelectableWindows,
} from '../src/modules/overtime/application/utils/overtime-selectable-windows.util';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

const COMPANY_ID = '00000000-0000-4000-8000-000000000001';
const ACTOR_ID = '16040ab7-b923-4fe4-87cf-cc3a916c7325'; // Samuel
const MONTH = 9;
const YEAR = 2026;
const MONTH_START = utcDate(YEAR, MONTH, 1);
const MONTH_END = utcDate(YEAR, MONTH, 30);
const TASK = 'Seeded September 2026 overtime (HR targets)';

/** Sheet name → employeeId when DB name differs. */
const NAME_ALIASES: Readonly<Record<string, string>> = {
  'Abireham Yishak': 'CC-0004', // Abraham Yisehak
  'Abraham Yishak': 'CC-0004',
  'Abraham Yisehak': 'CC-0004',
  'Teferi Dabele': 'CC-0071', // Terefe Dabele
  'Terefe Dabele': 'CC-0071',
  'Lakew Gulema Urge': 'CC-0037',
  'Tesfaye Tsega Beyin': 'CC-0073',
  'Tewodros Desye Sisay': 'CC-0076',
  'Haile Micheal Mulugeta': 'CC-0026',
};

/**
 * Target OT hours (Normal / Evening / Sunday / Holiday) for September 2026.
 * - Normal  = regular band OT (outside night / weekend / holiday)
 * - Evening = night band (22:00–06:00) on working days
 * - Sunday  = weekend OT window: Sat 12:30 → Sun 24:00 (half-day morning ends 12:30;
 *             full Sunday 00:00–24:00). Not calendar-Sunday-only.
 * - Holiday = public-holiday day (Sep 11 Enkutatash)
 */
const TARGETS: ReadonlyArray<{
  name: string;
  normal: number;
  evening: number;
  sunday: number;
  holiday: number;
}> = [
  { name: 'Abenezer Tilahun', normal: 8.5, evening: 3.5, sunday: 22, holiday: 0 },
  { name: 'Abireham Yishak', normal: 175, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Aregahegn Tefera', normal: 36, evening: 0, sunday: 48, holiday: 0 },
  { name: 'Agegnehu Gelaw', normal: 153, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Armias Habtu', normal: 12, evening: 2, sunday: 33.5, holiday: 4 },
  { name: 'Beru Yargale', normal: 153, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Birhanu Weldu', normal: 12, evening: 46, sunday: 42, holiday: 0 },
  { name: 'Biruk Alemu', normal: 28.5, evening: 11.5, sunday: 4, holiday: 0 },
  { name: 'Dagmawi Tesfaye', normal: 35.5, evening: 0, sunday: 40.5, holiday: 0 },
  { name: 'Dinberu Alemu', normal: 197, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Efeson Bassa', normal: 153, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Eyob Temesgen', normal: 0, evening: 38, sunday: 25, holiday: 0 },
  { name: 'Hailab Getu', normal: 16.5, evening: 0, sunday: 11, holiday: 8 },
  {
    name: 'Haile Micheal Mulugeta',
    normal: 86.5,
    evening: 19.5,
    sunday: 80.5,
    holiday: 19.5,
  },
  { name: 'Israel Woldetsadik', normal: 40, evening: 2, sunday: 28.5, holiday: 0 },
  { name: 'Kiber Temesgen', normal: 12, evening: 0, sunday: 0, holiday: 0 },
  {
    name: 'Lakew Gulema Urge',
    normal: 105.35,
    evening: 27,
    sunday: 57,
    holiday: 14,
  },
  { name: 'Mesfin Abi Mamuye', normal: 18, evening: 0, sunday: 30, holiday: 0 },
  { name: 'Mizen Beyene', normal: 0, evening: 0, sunday: 44, holiday: 8 },
  { name: 'Muse Asefa', normal: 84.5, evening: 11.5, sunday: 74, holiday: 30.5 },
  { name: 'Nahom Asfaw', normal: 55, evening: 0, sunday: 24, holiday: 0 },
  { name: 'Naod Kiflu', normal: 9.5, evening: 0, sunday: 6.5, holiday: 0 },
  { name: 'Natnael Takele', normal: 24, evening: 0, sunday: 0, holiday: 0 },
  { name: 'Seid Hussen', normal: 153, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Selamawit Beyene', normal: 22.5, evening: 0, sunday: 22, holiday: 0 },
  { name: 'Shimeles Ayele', normal: 127, evening: 0, sunday: 12, holiday: 0 },
  { name: 'Shimelis Bacha', normal: 6, evening: 0, sunday: 17, holiday: 0 },
  { name: 'Sony Aboye', normal: 5, evening: 0, sunday: 1.5, holiday: 0 },
  { name: 'Teferi Dabele', normal: 40, evening: 0, sunday: 48, holiday: 10 },
  { name: 'Tesfaye Tsega Beyin', normal: 0, evening: 38, sunday: 17, holiday: 9 },
  { name: 'Tewodros Desye Sisay', normal: 153, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Tsion Mekonnen', normal: 0, evening: 0, sunday: 8.25, holiday: 0 },
  { name: 'Yemareshet Temesgen', normal: 17.5, evening: 0, sunday: 0, holiday: 0 },
  { name: 'Yonas Bizualem', normal: 34, evening: 0, sunday: 45, holiday: 0 },
  { name: 'Zelalem Sefiw', normal: 153, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Zerihun Lemesa', normal: 40, evening: 0, sunday: 48, holiday: 10 },
  { name: 'Dagim Selemon', normal: 53.5, evening: 0, sunday: 29.5, holiday: 0 },
  { name: 'Henok Tesfaye', normal: 89, evening: 11.5, sunday: 88.5, holiday: 22.5 },
  { name: 'Asaminew Kebede', normal: 10, evening: 0, sunday: 19, holiday: 0 },
  { name: 'Habtu Mulat', normal: 153, evening: 0, sunday: 50, holiday: 0 },
  { name: 'Aderaw Sitotaw', normal: 3, evening: 2, sunday: 32, holiday: 0 },
];

type OtCategory = 'normal' | 'night' | 'weekend' | 'holiday';

interface UserMatch {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  employeeId: string | null;
  reportsToUserId: string | null;
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
  siteAssignmentId: string | null;
  siteWithinScheduleHours: number;
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
  siteAssignmentId: string | null;
}

interface PlaceFailure {
  name: string;
  employeeId: string | null;
  category: OtCategory;
  hoursNeeded: number;
  capacityAvailable: number;
  reason: string;
}

interface EmployeeResult {
  name: string;
  employeeId: string | null;
  daysInserted: number;
  daysUpdated: number;
  daysSkipped: number;
  totalNormal: number;
  totalEvening: number;
  totalSunday: number;
  totalHoliday: number;
  status: 'ok' | 'failed' | 'skipped_plan';
  detail?: string;
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function eachDate(start: Date, end: Date): Date[] {
  const out: Date[] = [];
  for (let d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
    out.push(d);
  }
  return out;
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

function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

function minutesToHours(minutes: number): number {
  return round2(minutes / 60);
}

function displayName(u: UserMatch): string {
  return [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ');
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
    }
  } else if (parts.length === 1) {
    keys.add(parts[0]!);
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

function timeUtc(hhmm: string): Date {
  if (hhmm === '24:00') {
    return new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
  }
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(Date.UTC(1970, 0, 1, h, m, 0));
}

/** CRCC Standard weekday / Saturday half / Sunday off. */
function baseDayContext(
  date: Date,
  holidayKeys: Set<string>,
): OvertimeDayContext {
  if (holidayKeys.has(iso(date))) {
    return {
      isHoliday: true,
      isWorkingDay: true,
      isHalfDay: false,
      morningStart: '08:30',
      morningEnd: '12:30',
      afternoonStart: '13:30',
      afternoonEnd: '17:30',
    };
  }
  const dow = date.getUTCDay();
  if (dow === 0) {
    return {
      isHoliday: false,
      isWorkingDay: false,
      isHalfDay: false,
      morningStart: null,
      morningEnd: null,
      afternoonStart: null,
      afternoonEnd: null,
    };
  }
  if (dow === 6) {
    return {
      isHoliday: false,
      isWorkingDay: true,
      isHalfDay: true,
      morningStart: '08:30',
      morningEnd: '12:30',
      afternoonStart: null,
      afternoonEnd: null,
    };
  }
  return {
    isHoliday: false,
    isWorkingDay: true,
    isHalfDay: false,
    morningStart: '08:30',
    morningEnd: '12:30',
    afternoonStart: '13:30',
    afternoonEnd: '17:30',
  };
}

function dayContext(
  date: Date,
  holidayKeys: Set<string>,
  _siteDay: boolean,
): OvertimeDayContext {
  // Site days use the same outside-schedule rule as office days by default.
  return baseDayContext(date, holidayKeys);
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
    lunchCountsAsOvertime: false,
    scheduledHoursClaimable: Boolean(ctx.scheduledHoursClaimable),
  };
}

/**
 * Category time slots for a calendar day (CRCC Standard).
 * Site and office days both exclude scheduled duty (default policy).
 */
function categorySlots(
  category: OtCategory,
  date: Date,
  holidayKeys: Set<string>,
  _siteDay: boolean,
): SlotSpec[] {
  const key = iso(date);
  const isHol = holidayKeys.has(key);
  const dow = date.getUTCDay();

  if (category === 'holiday') {
    if (!isHol) return [];
    return [{ start: '00:00', end: '24:00', capacityHours: 24 }];
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
    if (dow === 6) {
      // Before morning: night then regular; after morningEnd → weekend (not night).
      return [{ start: '00:00', end: '06:00', capacityHours: 6 }];
    }
    return [];
  }

  // Sheet "Sunday" column = weekend OT: Sat 12:30–24:00 + Sun 00:00–24:00
  if (dow === 6) {
    return [{ start: '12:30', end: '24:00', capacityHours: 11.5 }];
  }
  if (dow === 0) {
    return [{ start: '00:00', end: '24:00', capacityHours: 24 }];
  }
  return [];
}

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

function placeCategoryHours(input: {
  neededHours: number;
  category: OtCategory;
  holidayKeys: Set<string>;
  leaveDates: Set<string>;
  siteByDate: Map<string, string>;
  occupied: Map<string, Array<{ start: number; end: number }>>;
}): {
  entries: PlannedEntry[];
  failure: PlaceFailure | null;
  capacityAvailable: number;
  placedHours: number;
  unplacedHours: number;
} {
  const neededMin = hoursToMinutes(input.neededHours);
  if (neededMin <= 0) {
    return {
      entries: [],
      failure: null,
      capacityAvailable: 0,
      placedHours: 0,
      unplacedHours: 0,
    };
  }

  const daySlots: DaySlot[] = [];
  for (const date of eachDate(MONTH_START, MONTH_END)) {
    const key = iso(date);
    if (input.leaveDates.has(key)) continue;
    const siteAssignmentId = input.siteByDate.get(key) ?? null;
    const siteDay = siteAssignmentId != null;

    for (const slot of categorySlots(
      input.category,
      date,
      input.holidayKeys,
      siteDay,
    )) {
      const ctx = dayContext(date, input.holidayKeys, siteDay);
      const windows = computeSelectableOvertimeWindows(selectableInput(ctx));
      if (
        !isIntervalInsideSelectableWindows(slot.start, slot.end, windows.windows)
      ) {
        continue;
      }
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
        siteAssignmentId,
      });
    }
  }

  daySlots.sort((a, b) => {
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
      failure: null,
      capacityAvailable,
      placedHours: 0,
      unplacedHours: minutesToHours(unplacedMin),
    };
  }

  const remainingBySlot = new Map<string, number>();
  for (const s of daySlots) {
    remainingBySlot.set(
      `${iso(s.date)}|${s.start}`,
      hoursToMinutes(s.capacityHours),
    );
  }

  const allocMinBySlot = new Map<string, number>();
  let remaining = placeMin;
  const uniqueDays = [...new Set(daySlots.map((s) => iso(s.date)))];

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
    }
  }

  if (remaining > 0) {
    return {
      entries: [],
      failure: {
        name: '',
        employeeId: null,
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
        failure: {
          name: '',
          employeeId: null,
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
    const siteDay = slot.siteAssignmentId != null;
    const ctx = dayContext(slot.date, input.holidayKeys, siteDay);
    const windows = computeSelectableOvertimeWindows(selectableInput(ctx));
    if (!isIntervalInsideSelectableWindows(startTime, endTime, windows.windows)) {
      return {
        entries: [],
        failure: {
          name: '',
          employeeId: null,
          category: input.category,
          hoursNeeded: input.neededHours,
          capacityAvailable,
          reason: `Interval ${startTime}–${endTime} on ${iso(slot.date)} outside selectable windows`,
        },
        placedHours: 0,
        unplacedHours: input.neededHours,
      };
    }

    const full = calculateOvertimeHoursDetailed(
      slot.date,
      startTime,
      endTime,
      ctx,
      false,
    );
    const hours = minutesToHours(alloc);
    const expected: Record<OtCategory, number> = {
      normal: full.buckets.regularHours,
      night: full.buckets.nightHours,
      weekend: full.buckets.weekendHours,
      holiday: full.buckets.holidayHours,
    };
    if (Math.abs(expected[input.category] - hours) > 0.01) {
      return {
        entries: [],
        failure: {
          name: '',
          employeeId: null,
          category: input.category,
          hoursNeeded: input.neededHours,
          capacityAvailable,
          reason: `Classification mismatch on ${iso(slot.date)} ${startTime}–${endTime}: wanted ${hours} ${input.category}, got N=${full.buckets.regularHours} E=${full.buckets.nightHours} W=${full.buckets.weekendHours} H=${full.buckets.holidayHours}`,
        },
        placedHours: 0,
        unplacedHours: input.neededHours,
      };
    }

    occupied.push({ start: startMin, end: endMin });
    input.occupied.set(iso(slot.date), occupied);

    entries.push({
      date: slot.date,
      startTime,
      endTime,
      endsAtEndOfDay,
      isHoliday: input.category === 'holiday' || ctx.isHoliday,
      regularHours: full.buckets.regularHours,
      nightHours: full.buckets.nightHours,
      weekendHours: full.buckets.weekendHours,
      holidayHours: full.buckets.holidayHours,
      siteAssignmentId: slot.siteAssignmentId,
      siteWithinScheduleHours: full.withinScheduleHours,
    });
  }

  return {
    entries,
    failure: null,
    capacityAvailable,
    placedHours: minutesToHours(placeMin),
    unplacedHours: minutesToHours(unplacedMin),
  };
}

function entrySignature(e: {
  date: Date | string;
  startTime: string;
  endTime: string;
  endsAtEndOfDay: boolean;
  regularHours: number;
  nightHours: number;
  weekendHours: number;
  holidayHours: number;
}): string {
  const d = typeof e.date === 'string' ? e.date : iso(e.date);
  return [
    d,
    e.startTime,
    e.endTime,
    e.endsAtEndOfDay ? '1' : '0',
    round2(e.regularHours),
    round2(e.nightHours),
    round2(e.weekendHours),
    round2(e.holidayHours),
  ].join('|');
}

function storedTimeHhMm(value: Date, endsAtEndOfDay: boolean): string {
  if (endsAtEndOfDay) return '24:00';
  const h = value.getUTCHours();
  const m = value.getUTCMinutes();
  if (h === 0 && m === 0) {
    // Ambiguous without endsAtEndOfDay — treat as 00:00
    return '00:00';
  }
  return formatHhMm(h * 60 + m);
}

async function main(): Promise<void> {
  const apply =
    process.argv.includes('--apply') ||
    process.env.DRY_RUN === 'false' ||
    process.env.DRY_RUN === '0';
  const dryRun = !apply;
  const { host, database } = assertLocalhostSeedGuards();
  console.log(
    `[sept-ot] ${dryRun ? 'DRY_RUN' : 'APPLY'} against ${host}/${database}`,
  );

  const prisma = new PrismaClient();
  const results: EmployeeResult[] = [];
  const failures: PlaceFailure[] = [];
  const unmatched: string[] = [];

  try {
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
    console.log(
      `[sept-ot] Public holidays: ${
        holidays.length === 0
          ? '(none)'
          : holidays.map((h) => `${iso(h.date)} ${h.name}`).join(', ')
      }`,
    );
    if (TARGETS.some((t) => t.holiday > 0) && holidayKeys.size === 0) {
      console.error(
        'Precondition failed: targets include holiday OT but no active September public holiday.',
      );
      process.exit(1);
    }

    const otCategory = await prisma.approvalCategory.findFirst({
      where: {
        companyId: COMPANY_ID,
        code: 'OVERTIME_APPLICATION',
        deletedAt: null,
      },
      select: { id: true, numberPrefix: true },
    });
    if (!otCategory) {
      console.error('Precondition failed: OVERTIME_APPLICATION category missing.');
      process.exit(1);
    }

    const hrManager = await prisma.user.findFirst({
      where: {
        companyId: COMPANY_ID,
        deletedAt: null,
        isActive: true,
        userRoles: {
          some: { role: { name: 'HR Manager', deletedAt: null } },
        },
      },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!hrManager) {
      console.error('Precondition failed: no active HR Manager user.');
      process.exit(1);
    }
    console.log(
      `[sept-ot] HR Manager: ${hrManager.firstName} ${hrManager.lastName} (${hrManager.id})`,
    );

    const users = await prisma.user.findMany({
      where: { companyId: COMPANY_ID, deletedAt: null, isActive: true },
      select: {
        id: true,
        firstName: true,
        middleName: true,
        lastName: true,
        employeeId: true,
        reportsToUserId: true,
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
        [user.firstName, user.middleName, user.lastName]
          .filter(Boolean)
          .join(' '),
      );
      if (compact) {
        const list = byCompact.get(compact) ?? [];
        list.push(user);
        byCompact.set(compact, list);
      }
    }

    const resolveUser = (name: string): UserMatch | undefined => {
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
      // Fuzzy: all name parts present
      const parts = normaliseAttendanceName(name)
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const fuzzy = users.filter((u) => {
        const full = normaliseAttendanceName(
          [u.firstName, u.middleName, u.lastName].filter(Boolean).join(' '),
        ).toLowerCase();
        return parts.every((p) => full.includes(p));
      });
      if (fuzzy.length === 1) return fuzzy[0];
      return undefined;
    };

    type Plan = {
      target: (typeof TARGETS)[number];
      user: UserMatch;
      entries: PlannedEntry[];
    };
    const plans: Plan[] = [];

    for (const target of TARGETS) {
      const user = resolveUser(target.name);
      if (!user) {
        unmatched.push(target.name);
        results.push({
          name: target.name,
          employeeId: null,
          daysInserted: 0,
          daysUpdated: 0,
          daysSkipped: 0,
          totalNormal: 0,
          totalEvening: 0,
          totalSunday: 0,
          totalHoliday: 0,
          status: 'failed',
          detail: 'unmatched employee',
        });
        continue;
      }

      const sites = await prisma.siteAssignment.findMany({
        where: {
          companyId: COMPANY_ID,
          employeeId: user.id,
          deletedAt: null,
          status: SiteAssignmentStatus.APPROVED,
          startDate: { lte: MONTH_END },
          endDate: { gte: MONTH_START },
        },
        select: { id: true, startDate: true, endDate: true, siteName: true },
      });
      const siteByDate = new Map<string, string>();
      for (const date of eachDate(MONTH_START, MONTH_END)) {
        const key = iso(date);
        const hit = sites.find(
          (s) =>
            s.startDate.getTime() <= date.getTime() &&
            s.endDate.getTime() >= date.getTime(),
        );
        if (hit) siteByDate.set(key, hit.id);
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
          period.startDate.getTime() < MONTH_START.getTime()
            ? MONTH_START
            : period.startDate,
          period.endDate.getTime() > MONTH_END.getTime()
            ? MONTH_END
            : period.endDate,
        )) {
          leaveDates.add(iso(d));
        }
      }

      const occupied = new Map<string, Array<{ start: number; end: number }>>();
      const allEntries: PlannedEntry[] = [];
      let failed = false;

      const categories: Array<{ key: OtCategory; hours: number }> = [
        { key: 'holiday', hours: target.holiday },
        { key: 'weekend', hours: target.sunday },
        { key: 'night', hours: target.evening },
        { key: 'normal', hours: target.normal },
      ];

      for (const cat of categories) {
        if (cat.hours <= 0) continue;
        const placed = placeCategoryHours({
          neededHours: cat.hours,
          category: cat.key,
          holidayKeys,
          leaveDates,
          siteByDate,
          occupied,
        });
        if (placed.failure) {
          failures.push({
            ...placed.failure,
            name: target.name,
            employeeId: user.employeeId,
          });
          failed = true;
          break;
        }
        if (placed.unplacedHours > 0.009) {
          failures.push({
            name: target.name,
            employeeId: user.employeeId,
            category: cat.key,
            hoursNeeded: cat.hours,
            capacityAvailable: placed.capacityAvailable,
            reason: `Unplaced ${placed.unplacedHours} h (capacity ${placed.capacityAvailable} h; siteDays=${siteByDate.size})`,
          });
          failed = true;
          break;
        }
        allEntries.push(...placed.entries);
      }

      if (failed) {
        results.push({
          name: target.name,
          employeeId: user.employeeId,
          daysInserted: 0,
          daysUpdated: 0,
          daysSkipped: 0,
          totalNormal: 0,
          totalEvening: 0,
          totalSunday: 0,
          totalHoliday: 0,
          status: 'failed',
          detail: failures[failures.length - 1]?.reason,
        });
        continue;
      }

      const entryTotals = {
        normal: round2(allEntries.reduce((s, e) => s + e.regularHours, 0)),
        night: round2(allEntries.reduce((s, e) => s + e.nightHours, 0)),
        weekend: round2(allEntries.reduce((s, e) => s + e.weekendHours, 0)),
        holiday: round2(allEntries.reduce((s, e) => s + e.holidayHours, 0)),
      };
      const mismatches: string[] = [];
      if (Math.abs(entryTotals.normal - target.normal) > 0.01) {
        mismatches.push(`N ${target.normal}→${entryTotals.normal}`);
      }
      if (Math.abs(entryTotals.night - target.evening) > 0.01) {
        mismatches.push(`E ${target.evening}→${entryTotals.night}`);
      }
      if (Math.abs(entryTotals.weekend - target.sunday) > 0.01) {
        mismatches.push(`S ${target.sunday}→${entryTotals.weekend}`);
      }
      if (Math.abs(entryTotals.holiday - target.holiday) > 0.01) {
        mismatches.push(`H ${target.holiday}→${entryTotals.holiday}`);
      }
      if (mismatches.length > 0) {
        failures.push({
          name: target.name,
          employeeId: user.employeeId,
          category: 'normal',
          hoursNeeded: target.normal,
          capacityAvailable: 0,
          reason: `Total mismatch: ${mismatches.join('; ')}`,
        });
        results.push({
          name: target.name,
          employeeId: user.employeeId,
          daysInserted: 0,
          daysUpdated: 0,
          daysSkipped: 0,
          totalNormal: entryTotals.normal,
          totalEvening: entryTotals.night,
          totalSunday: entryTotals.weekend,
          totalHoliday: entryTotals.holiday,
          status: 'failed',
          detail: mismatches.join('; '),
        });
        continue;
      }

      plans.push({ target, user, entries: allEntries });
    }

    const targetUserIds = new Set(plans.map((p) => p.user.id));

    // Sheets for employees NOT in the target list → clear
    const extraSheets = await prisma.overtimeSheet.findMany({
      where: {
        companyId: COMPANY_ID,
        month: MONTH,
        year: YEAR,
        deletedAt: null,
        employeeId: { notIn: [...targetUserIds] },
      },
      select: { id: true, employeeId: true, sheetNumber: true, approvalRequestId: true },
    });

    console.log(
      `[sept-ot] Planned ${plans.length}/${TARGETS.length}; unmatched ${unmatched.length}; place-failures ${failures.length}; extra sheets to clear ${extraSheets.length}`,
    );

    if (dryRun) {
      for (const plan of plans) {
        const existing = await prisma.overtimeSheet.findFirst({
          where: {
            companyId: COMPANY_ID,
            employeeId: plan.user.id,
            month: MONTH,
            year: YEAR,
          },
          include: { entries: true },
        });
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        if (!existing) {
          inserted = plan.entries.length;
        } else {
          const existingBySig = new Map<string, boolean>();
          const existingByDate = new Map<string, typeof existing.entries>();
          for (const e of existing.entries) {
            const start = storedTimeHhMm(e.startTime, false);
            const end = storedTimeHhMm(e.endTime, e.endsAtEndOfDay);
            const sig = entrySignature({
              date: e.date,
              startTime: start,
              endTime: end,
              endsAtEndOfDay: e.endsAtEndOfDay,
              regularHours: Number(e.regularHours),
              nightHours: Number(e.nightHours),
              weekendHours: Number(e.weekendHours),
              holidayHours: Number(e.holidayHours),
            });
            existingBySig.set(sig, true);
            const dk = iso(e.date);
            const list = existingByDate.get(dk) ?? [];
            list.push(e);
            existingByDate.set(dk, list);
          }
          for (const e of plan.entries) {
            const sig = entrySignature(e);
            if (existingBySig.has(sig)) {
              skipped += 1;
            } else if (existingByDate.has(iso(e.date))) {
              updated += 1;
            } else {
              inserted += 1;
            }
          }
        }
        results.push({
          name: plan.target.name,
          employeeId: plan.user.employeeId,
          daysInserted: inserted,
          daysUpdated: updated,
          daysSkipped: skipped,
          totalNormal: plan.target.normal,
          totalEvening: plan.target.evening,
          totalSunday: plan.target.sunday,
          totalHoliday: plan.target.holiday,
          status: 'ok',
          detail: `would write ${plan.entries.length} entries; siteDays used; reportsTo=${plan.user.reportsToUserId ? 'yes' : 'FALLBACK'}`,
        });
      }
    } else {
      // Clear non-target September sheets
      if (extraSheets.length > 0) {
        await prisma.$transaction(async (tx) => {
          const ids = extraSheets.map((s) => s.id);
          const approvalIds = extraSheets
            .map((s) => s.approvalRequestId)
            .filter((id): id is string => Boolean(id));
          await tx.overtimeEntry.deleteMany({ where: { sheetId: { in: ids } } });
          await tx.overtimeSheet.updateMany({
            where: { id: { in: ids } },
            data: { approvalRequestId: null },
          });
          await tx.overtimeSheet.deleteMany({ where: { id: { in: ids } } });
          if (approvalIds.length > 0) {
            await tx.approvalTier.deleteMany({
              where: { requestId: { in: approvalIds } },
            });
            await tx.approvalRequest.deleteMany({
              where: { id: { in: approvalIds } },
            });
          }
        });
        console.log(
          `[sept-ot] Cleared ${extraSheets.length} September sheets for non-target employees`,
        );
      }

      for (const plan of plans) {
        const label = `${plan.target.name} (${plan.user.employeeId ?? '-'})`;
        try {
          const stats = await prisma.$transaction(async (tx) => {
            const existing = await tx.overtimeSheet.findFirst({
              where: {
                companyId: COMPANY_ID,
                employeeId: plan.user.id,
                month: MONTH,
                year: YEAR,
              },
              include: { entries: true },
            });

            let daysInserted = 0;
            let daysUpdated = 0;
            let daysSkipped = 0;
            let sheetId: string;

            const totR = round2(
              plan.entries.reduce((s, e) => s + e.regularHours, 0),
            );
            const totN = round2(
              plan.entries.reduce((s, e) => s + e.nightHours, 0),
            );
            const totW = round2(
              plan.entries.reduce((s, e) => s + e.weekendHours, 0),
            );
            const totH = round2(
              plan.entries.reduce((s, e) => s + e.holidayHours, 0),
            );

            const now = new Date();
            const supervisorId = plan.user.reportsToUserId ?? ACTOR_ID;

            // Build / refresh approval (supervisor → HR)
            const ensureApproval = async (
              sheetIdForClear: string | null,
              previousApprovalId: string | null,
            ): Promise<string> => {
              const totalHours = round2(totR + totN + totW + totH);
              const formData = {
                month: MONTH,
                year: YEAR,
                totalHours,
                totalRegularHours: totR,
                totalNightHours: totN,
                totalWeekendHours: totW,
                totalHolidayHours: totH,
                seeded: true,
              };

              if (previousApprovalId) {
                // Detach FK before replace so ApprovalRequest delete is allowed.
                if (sheetIdForClear) {
                  await tx.overtimeSheet.update({
                    where: { id: sheetIdForClear },
                    data: { approvalRequestId: null },
                  });
                }
                await tx.approvalTier.deleteMany({
                  where: { requestId: previousApprovalId },
                });
                await tx.approvalRequest.delete({
                  where: { id: previousApprovalId },
                });
              }

              const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
                SELECT nextval('approval_request_number_seq') as nextval
              `;
              const requestNumber = `${otCategory.numberPrefix}-${String(
                Number(seq[0]!.nextval),
              ).padStart(4, '0')}`;
              const approvalId = randomUUID();
              await tx.approvalRequest.create({
                data: {
                  id: approvalId,
                  companyId: COMPANY_ID,
                  categoryId: otCategory.id,
                  requestNumber,
                  title: `Overtime sheet - ${YEAR}-${String(MONTH).padStart(2, '0')} (${totalHours}h)`,
                  formData,
                  requestedBy: plan.user.id,
                  status: ApprovalRequestStatus.APPROVED,
                  currentTier: 2,
                  matchedRuleName: 'Overtime org chain (seed)',
                  submittedAt: now,
                  completedAt: now,
                  createdBy: ACTOR_ID,
                  updatedBy: ACTOR_ID,
                },
              });
              await tx.approvalTier.createMany({
                data: [
                  {
                    id: randomUUID(),
                    requestId: approvalId,
                    tierOrder: 1,
                    label: 'Reports to',
                    approverId: supervisorId,
                    resolver: 'REPORTS_TO',
                    decision: ApprovalTierDecision.APPROVED,
                    comment: plan.user.reportsToUserId
                      ? 'Seeded supervisor approval'
                      : 'Seeded supervisor approval (fallback: Samuel — no reportsTo)',
                    decidedAt: now,
                  },
                  {
                    id: randomUUID(),
                    requestId: approvalId,
                    tierOrder: 2,
                    label: 'HR Manager',
                    approverId: hrManager.id,
                    resolver: 'ROLE:HR Manager',
                    decision: ApprovalTierDecision.APPROVED,
                    comment: 'Seeded HR approval',
                    decidedAt: now,
                  },
                ],
              });
              return approvalId;
            };

            if (!existing) {
              const seq = await tx.$queryRaw<Array<{ nextval: bigint }>>`
                SELECT nextval('overtime_sheet_number_seq')
              `;
              const sheetNumber = `OT-${String(Number(seq[0]!.nextval)).padStart(4, '0')}`;
              sheetId = randomUUID();
              const approvalId = await ensureApproval(null, null);
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
                  approvalRequestId: approvalId,
                  submittedAt: now,
                  completedAt: now,
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
                    siteAssignmentId: entry.siteAssignmentId,
                    siteWithinScheduleHours: new Prisma.Decimal(
                      entry.siteWithinScheduleHours,
                    ),
                  },
                });
                await tx.$executeRaw`
                  UPDATE overtime_entry
                  SET ends_at_end_of_day = ${entry.endsAtEndOfDay}
                  WHERE id = ${entryId}
                `;
                daysInserted += 1;
              }
            } else {
              sheetId = existing.id;
              // Compare planned vs existing
              const existingSigs = new Map<
                string,
                { id: string; dateKey: string }
              >();
              for (const e of existing.entries) {
                const start = storedTimeHhMm(e.startTime, false);
                const end = storedTimeHhMm(e.endTime, e.endsAtEndOfDay);
                const sig = entrySignature({
                  date: e.date,
                  startTime: start,
                  endTime: end,
                  endsAtEndOfDay: e.endsAtEndOfDay,
                  regularHours: Number(e.regularHours),
                  nightHours: Number(e.nightHours),
                  weekendHours: Number(e.weekendHours),
                  holidayHours: Number(e.holidayHours),
                });
                existingSigs.set(sig, { id: e.id, dateKey: iso(e.date) });
              }

              const plannedSigs = new Set(
                plan.entries.map((e) => entrySignature(e)),
              );
              const matchedExistingIds = new Set<string>();
              for (const e of plan.entries) {
                const sig = entrySignature(e);
                const hit = existingSigs.get(sig);
                if (hit) {
                  daysSkipped += 1;
                  matchedExistingIds.add(hit.id);
                }
              }

              // Rebuild entries that are not exact matches (simpler + correct)
              const needsRebuild =
                matchedExistingIds.size !== plan.entries.length ||
                existing.entries.length !== plan.entries.length ||
                existing.status !== OvertimeSheetStatus.APPROVED ||
                Math.abs(Number(existing.totalRegularHours) - totR) > 0.01 ||
                Math.abs(Number(existing.totalNightHours) - totN) > 0.01 ||
                Math.abs(Number(existing.totalWeekendHours) - totW) > 0.01 ||
                Math.abs(Number(existing.totalHolidayHours) - totH) > 0.01;

              if (!needsRebuild) {
                // Still ensure approval is APPROVED with both tiers
                if (
                  existing.status !== OvertimeSheetStatus.APPROVED ||
                  !existing.approvalRequestId
                ) {
                  const approvalId = await ensureApproval(
                    sheetId,
                    existing.approvalRequestId,
                  );
                  await tx.overtimeSheet.update({
                    where: { id: sheetId },
                    data: {
                      status: OvertimeSheetStatus.APPROVED,
                      approvalRequestId: approvalId,
                      submittedAt: now,
                      completedAt: now,
                      updatedBy: ACTOR_ID,
                    },
                  });
                  daysUpdated = 1;
                }
              } else {
                await tx.overtimeEntry.deleteMany({ where: { sheetId } });
                const approvalId = await ensureApproval(
                  sheetId,
                  existing.approvalRequestId,
                );
                await tx.overtimeSheet.update({
                  where: { id: sheetId },
                  data: {
                    status: OvertimeSheetStatus.APPROVED,
                    totalRegularHours: new Prisma.Decimal(totR),
                    totalNightHours: new Prisma.Decimal(totN),
                    totalWeekendHours: new Prisma.Decimal(totW),
                    totalHolidayHours: new Prisma.Decimal(totH),
                    approvalRequestId: approvalId,
                    submittedAt: now,
                    completedAt: now,
                    updatedBy: ACTOR_ID,
                    deletedAt: null,
                    deletedBy: null,
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
                      siteAssignmentId: entry.siteAssignmentId,
                      siteWithinScheduleHours: new Prisma.Decimal(
                        entry.siteWithinScheduleHours,
                      ),
                    },
                  });
                  await tx.$executeRaw`
                    UPDATE overtime_entry
                    SET ends_at_end_of_day = ${entry.endsAtEndOfDay}
                    WHERE id = ${entryId}
                  `;
                }
                daysUpdated = plan.entries.length;
                daysSkipped = 0;
                daysInserted = 0;
              }
            }

            return { daysInserted, daysUpdated, daysSkipped };
          });

          results.push({
            name: plan.target.name,
            employeeId: plan.user.employeeId,
            daysInserted: stats.daysInserted,
            daysUpdated: stats.daysUpdated,
            daysSkipped: stats.daysSkipped,
            totalNormal: plan.target.normal,
            totalEvening: plan.target.evening,
            totalSunday: plan.target.sunday,
            totalHoliday: plan.target.holiday,
            status: 'ok',
          });
          console.log(`[sept-ot] OK ${label}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[sept-ot] FAIL ${label}: ${message}`);
          results.push({
            name: plan.target.name,
            employeeId: plan.user.employeeId,
            daysInserted: 0,
            daysUpdated: 0,
            daysSkipped: 0,
            totalNormal: 0,
            totalEvening: 0,
            totalSunday: 0,
            totalHoliday: 0,
            status: 'failed',
            detail: message,
          });
        }
      }
    }

    console.log('');
    console.log(
      'name | days_inserted | days_updated | days_skipped | total_normal | total_evening | total_sunday | total_holiday | status',
    );
    for (const r of results) {
      console.log(
        `${r.name} | ${r.daysInserted} | ${r.daysUpdated} | ${r.daysSkipped} | ${r.totalNormal} | ${r.totalEvening} | ${r.totalSunday} | ${r.totalHoliday} | ${r.status}${r.detail ? ` (${r.detail})` : ''}`,
      );
    }

    if (unmatched.length > 0) {
      console.log('\nUnmatched:', unmatched.join(', '));
    }
    if (failures.length > 0) {
      console.log('\nPlacement failures:');
      for (const f of failures) {
        console.log(
          `- ${f.name} (${f.employeeId ?? '-'}) ${f.category}: need ${f.hoursNeeded}, capacity ${f.capacityAvailable} — ${f.reason}`,
        );
      }
    }

    const ok = results.filter((r) => r.status === 'ok').length;
    const failed = results.filter((r) => r.status === 'failed').length;
    console.log(
      `\n[sept-ot] Done (${dryRun ? 'dry-run' : 'apply'}): ok=${ok} failed=${failed}`,
    );
    if (dryRun) {
      console.log('[sept-ot] Re-run with --apply (and DRY_RUN=false) to write.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
