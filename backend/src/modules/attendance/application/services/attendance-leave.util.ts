import { Logger } from '@nestjs/common';
import type { LeaveType, Prisma, PrismaClient } from '@prisma/client';

/** Prisma client or transaction client. */
export type AttendanceLeavePrisma = PrismaClient | Prisma.TransactionClient;

/** Mirrors Prisma LeaveDayPortion - local until client regenerate. */
export type LeaveCoverageDayPortion = 'FULL' | 'MORNING' | 'AFTERNOON';

export interface LeaveCoverageDailyLog {
  date: Date;
  isHoliday: boolean;
  isWeekend: boolean;
  wasPresent: boolean;
  /** Schedule half-day (e.g. Saturday). Informational for payroll notes. */
  isHalfDay?: boolean;
  /**
   * Payroll absence weight for this date. When omitted:
   * non-working → 0, fully absent → 1, present → 0.
   * Pass 0.5 for a partly attended day.
   */
  payrollAbsenceWeight?: number;
}

export interface LeaveCoveragePeriod {
  startDate: Date;
  endDate: Date;
  days: number;
  dayPortion?: LeaveCoverageDayPortion;
}

export interface LeaveCoverageLeave {
  id: string;
  leaveType: LeaveType;
  periods: LeaveCoveragePeriod[];
}

export interface LeaveCoveredAbsencesResult {
  /** Sum of restored days: Σ min(absenceWeight, leaveWeight). */
  coveredDays: number;
  coveredDates: string[];
  /** Leave weight per covered date (after combining periods, before abs cap). */
  leaveWeightsByDate: Map<string, number>;
  /** Absence weight per covered date. */
  absenceWeightsByDate: Map<string, number>;
  /** Restored amount per covered date. */
  restoredByDate: Map<string, number>;
  leaves: Array<{
    id: string;
    leaveType: LeaveType;
    periods: Array<{
      startDate: string;
      endDate: string;
      days: number;
      dayPortion: LeaveCoverageDayPortion;
    }>;
  }>;
}

const leaveCoverageLogger = new Logger('AttendanceLeaveCoverage');

/**
 * Formats a @db.Date value as YYYY-MM-DD using UTC calendar parts (no timezone drift).
 */
export function dateToYyyyMmDd(value: Date): string {
  const year = value.getUTCFullYear();
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  const day = String(value.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function monthBoundsYyyyMmDd(
  month: number,
  year: number,
): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end };
}

function monthOverlapDateRange(
  month: number,
  year: number,
): { monthStart: Date; monthEnd: Date } {
  return {
    monthStart: new Date(Date.UTC(year, month - 1, 1)),
    monthEnd: new Date(Date.UTC(year, month, 0)),
  };
}

function roundDays(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Leave coverage weight for one period on one calendar date.
 * FULL covers the whole day (1), including Saturday half-day schedules.
 * MORNING / AFTERNOON cover 0.5 each.
 */
export function leavePortionWeight(
  dayPortion: LeaveCoverageDayPortion | null | undefined,
): number {
  if (dayPortion === 'MORNING' || dayPortion === 'AFTERNOON') {
    return 0.5;
  }
  return 1;
}

/**
 * Payroll absence weight for a daily log.
 * Fully missed duty day (WORKING or HALF_DAY Saturday) = 1.
 */
export function payrollAbsenceWeightForLog(
  log: LeaveCoverageDailyLog,
): number {
  if (log.payrollAbsenceWeight != null) {
    return log.payrollAbsenceWeight;
  }
  if (log.isHoliday || log.isWeekend) {
    return 0;
  }
  if (!log.wasPresent) {
    return 1;
  }
  return 0;
}

/**
 * Combined leave weight for a date across all approved leave periods (capped at 1).
 */
export function combinedLeaveWeightForDate(
  dateStr: string,
  leaves: ReadonlyArray<LeaveCoverageLeave>,
): number {
  let total = 0;
  for (const leave of leaves) {
    for (const period of leave.periods) {
      const start = dateToYyyyMmDd(period.startDate);
      const end = dateToYyyyMmDd(period.endDate);
      if (dateStr >= start && dateStr <= end) {
        total += leavePortionWeight(period.dayPortion);
      }
    }
  }
  return roundDays(Math.min(1, total));
}

function mapLeavesForResponse(
  leaves: LeaveCoverageLeave[],
): LeaveCoveredAbsencesResult['leaves'] {
  return leaves.map((leave) => ({
    id: leave.id,
    leaveType: leave.leaveType,
    periods: leave.periods.map((period) => ({
      startDate: dateToYyyyMmDd(period.startDate),
      endDate: dateToYyyyMmDd(period.endDate),
      days: period.days,
      dayPortion: period.dayPortion ?? 'FULL',
    })),
  }));
}

/** Approved leave rows for attendance list / HR table (includes total days per request). */
export type AttendanceApprovedLeaveSummary = {
  id: string;
  leaveType: LeaveType;
  days: number;
  periods: LeaveCoveredAbsencesResult['leaves'][number]['periods'];
};

export function formatApprovedLeavesForAttendanceList(
  leaves: LeaveCoverageLeave[],
): AttendanceApprovedLeaveSummary[] {
  return mapLeavesForResponse(leaves).map((leave) => ({
    id: leave.id,
    leaveType: leave.leaveType,
    days: leave.periods.reduce((sum, period) => sum + period.days, 0),
    periods: leave.periods,
  }));
}

/**
 * Approved leave requests overlapping a month - for list views (independent of daily logs).
 */
export async function getApprovedLeaveSummariesForEmployees(
  prisma: AttendanceLeavePrisma,
  companyId: string,
  employeeIds: string[],
  month: number,
  year: number,
): Promise<Map<string, AttendanceApprovedLeaveSummary[]>> {
  const byEmployee = await fetchApprovedLeavesForMonth(
    prisma,
    companyId,
    employeeIds,
    month,
    year,
  );
  const result = new Map<string, AttendanceApprovedLeaveSummary[]>();
  for (const [employeeId, leaves] of byEmployee) {
    result.set(employeeId, formatApprovedLeavesForAttendanceList(leaves));
  }
  return result;
}

const emptyCoverage = (): LeaveCoveredAbsencesResult => ({
  coveredDays: 0,
  coveredDates: [],
  leaveWeightsByDate: new Map(),
  absenceWeightsByDate: new Map(),
  restoredByDate: new Map(),
  leaves: [],
});

/**
 * Day-by-day leave coverage for payroll (and attendance views).
 * Restored per date = min(payroll absence weight, combined leave weight).
 * Multiple leaves on the same date are combined, capped at 1 before the abs min.
 */
export function computeLeaveCoveredAbsences(
  dailyLogs: LeaveCoverageDailyLog[],
  approvedLeaves: LeaveCoverageLeave[],
  month: number,
  year: number,
): LeaveCoveredAbsencesResult {
  const { start: monthStart, end: monthEnd } = monthBoundsYyyyMmDd(month, year);
  const coveredDates: string[] = [];
  const leaveWeightsByDate = new Map<string, number>();
  const absenceWeightsByDate = new Map<string, number>();
  const restoredByDate = new Map<string, number>();
  let coveredDays = 0;

  for (const log of dailyLogs) {
    const dateStr = dateToYyyyMmDd(log.date);
    if (dateStr < monthStart || dateStr > monthEnd) {
      continue;
    }

    const absenceWeight = payrollAbsenceWeightForLog(log);
    if (absenceWeight <= 0) {
      continue;
    }

    const leaveWeight = combinedLeaveWeightForDate(dateStr, approvedLeaves);
    if (leaveWeight <= 0) {
      continue;
    }

    const restored = roundDays(Math.min(absenceWeight, leaveWeight));
    if (restored <= 0) {
      continue;
    }

    coveredDates.push(dateStr);
    absenceWeightsByDate.set(dateStr, absenceWeight);
    leaveWeightsByDate.set(dateStr, leaveWeight);
    restoredByDate.set(dateStr, restored);
    coveredDays += restored;
  }

  coveredDates.sort();

  return {
    coveredDays: roundDays(coveredDays),
    coveredDates,
    leaveWeightsByDate,
    absenceWeightsByDate,
    restoredByDate,
    leaves: mapLeavesForResponse(approvedLeaves),
  };
}

/**
 * Net unpaid absence after leave restore for unit-test convenience.
 */
export function netAbsenceAfterLeave(
  absenceWeight: number,
  leaveWeight: number,
): number {
  return roundDays(
    Math.max(0, absenceWeight - Math.min(absenceWeight, leaveWeight)),
  );
}

async function fetchApprovedLeavesForMonth(
  prisma: AttendanceLeavePrisma,
  companyId: string,
  employeeIds: string[],
  month: number,
  year: number,
): Promise<Map<string, LeaveCoverageLeave[]>> {
  const { monthStart, monthEnd } = monthOverlapDateRange(month, year);

  if (employeeIds.length === 0) {
    return new Map();
  }

  // Raw SQL so day_portion is available even before prisma generate refreshes types.
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      employee_id: string;
      leave_type: LeaveType;
      start_date: Date;
      end_date: Date;
      days: number | string;
      day_portion: string | null;
    }>
  >(
    `
    SELECT
      lr.id,
      lr.employee_id,
      lr.leave_type,
      lrp.start_date,
      lrp.end_date,
      lrp.days,
      lrp.day_portion
    FROM leave_request lr
    INNER JOIN leave_request_period lrp ON lrp.leave_request_id = lr.id
    WHERE lr.company_id = $1
      AND lr.employee_id = ANY($2::text[])
      AND lr.status = 'APPROVED'
      AND lr.deleted_at IS NULL
      AND lrp.start_date <= $3::date
      AND lrp.end_date >= $4::date
    `,
    companyId,
    employeeIds,
    monthEnd,
    monthStart,
  );

  const byEmployee = new Map<string, LeaveCoverageLeave[]>();
  for (const row of rows) {
    const dayPortion = (row.day_portion ?? 'FULL') as LeaveCoverageDayPortion;
    const period = {
      startDate: new Date(row.start_date),
      endDate: new Date(row.end_date),
      days: Number(row.days),
      dayPortion,
    };
    const list = byEmployee.get(row.employee_id) ?? [];
    const existing = list.find((leave) => leave.id === row.id);
    if (existing) {
      existing.periods.push(period);
    } else {
      list.push({
        id: row.id,
        leaveType: row.leave_type,
        periods: [period],
      });
      byEmployee.set(row.employee_id, list);
    }
  }

  return byEmployee;
}

async function fetchDailyLogsByEmployee(
  prisma: AttendanceLeavePrisma,
  companyId: string,
  employeeIds: string[],
  month: number,
  year: number,
): Promise<Map<string, LeaveCoverageDailyLog[]>> {
  const records = await prisma.attendanceRecord.findMany({
    where: {
      companyId,
      month,
      year,
      employeeId: { in: employeeIds },
    },
    select: {
      employeeId: true,
      dailyLogs: {
        select: {
          date: true,
          isHoliday: true,
          isWeekend: true,
          wasPresent: true,
          isHalfDay: true,
        },
      },
    },
  });

  const byEmployee = new Map<string, LeaveCoverageDailyLog[]>();
  for (const record of records) {
    byEmployee.set(record.employeeId, record.dailyLogs);
  }
  return byEmployee;
}

/**
 * Leave-covered absences for one employee/month (payroll + attendance detail).
 */
export async function getLeaveCoveredAbsences(
  prisma: AttendanceLeavePrisma,
  companyId: string,
  employeeId: string,
  month: number,
  year: number,
  logger: Logger = leaveCoverageLogger,
): Promise<LeaveCoveredAbsencesResult> {
  const map = await getLeaveCoveredAbsencesForEmployees(
    prisma,
    companyId,
    [employeeId],
    month,
    year,
    logger,
  );
  return map.get(employeeId) ?? emptyCoverage();
}

/**
 * Bulk leave coverage for many employees - two queries regardless of headcount.
 */
export async function getLeaveCoveredAbsencesForEmployees(
  prisma: AttendanceLeavePrisma,
  companyId: string,
  employeeIds: string[],
  month: number,
  year: number,
  logger: Logger = leaveCoverageLogger,
): Promise<Map<string, LeaveCoveredAbsencesResult>> {
  const uniqueIds = [...new Set(employeeIds)];
  const result = new Map<string, LeaveCoveredAbsencesResult>();

  if (uniqueIds.length === 0) {
    return result;
  }

  const [dailyLogsByEmployee, leavesByEmployee] = await Promise.all([
    fetchDailyLogsByEmployee(prisma, companyId, uniqueIds, month, year),
    fetchApprovedLeavesForMonth(prisma, companyId, uniqueIds, month, year),
  ]);

  for (const employeeId of uniqueIds) {
    const dailyLogs = dailyLogsByEmployee.get(employeeId) ?? [];
    if (dailyLogs.length === 0) {
      logger.warn(
        `No daily attendance logs for employee ${employeeId} in ${year}-${String(month).padStart(2, '0')}; leave coverage treated as 0`,
      );
      result.set(employeeId, emptyCoverage());
      continue;
    }

    const approvedLeaves = leavesByEmployee.get(employeeId) ?? [];
    result.set(
      employeeId,
      computeLeaveCoveredAbsences(dailyLogs, approvedLeaves, month, year),
    );
  }

  return result;
}
