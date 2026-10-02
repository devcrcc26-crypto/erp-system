import { Logger } from '@nestjs/common';
import type { LeaveType, Prisma, PrismaClient } from '@prisma/client';

/** Prisma client or transaction client. */
export type AttendanceLeavePrisma = PrismaClient | Prisma.TransactionClient;

export interface LeaveCoverageDailyLog {
  date: Date;
  isHoliday: boolean;
  isWeekend: boolean;
  wasPresent: boolean;
}

export interface LeaveCoveragePeriod {
  startDate: Date;
  endDate: Date;
  days: number;
}

export interface LeaveCoverageLeave {
  id: string;
  leaveType: LeaveType;
  periods: LeaveCoveragePeriod[];
}

export interface LeaveCoveredAbsencesResult {
  coveredDays: number;
  coveredDates: string[];
  leaves: Array<{
    id: string;
    leaveType: LeaveType;
    periods: Array<{ startDate: string; endDate: string; days: number }>;
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

function isScheduledWorkingDay(log: LeaveCoverageDailyLog): boolean {
  return !log.isHoliday && !log.isWeekend;
}

function isAbsentWorkingDay(log: LeaveCoverageDailyLog): boolean {
  return isScheduledWorkingDay(log) && !log.wasPresent;
}

function isDateCoveredByLeave(
  dateStr: string,
  leaves: LeaveCoverageLeave[],
): boolean {
  for (const leave of leaves) {
    for (const period of leave.periods) {
      const start = dateToYyyyMmDd(period.startDate);
      const end = dateToYyyyMmDd(period.endDate);
      if (dateStr >= start && dateStr <= end) {
        return true;
      }
    }
  }
  return false;
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
    })),
  }));
}

/**
 * Day-by-day leave coverage from daily logs and approved leave periods.
 * Present days never count; holidays and weekends never count.
 */
export function computeLeaveCoveredAbsences(
  dailyLogs: LeaveCoverageDailyLog[],
  approvedLeaves: LeaveCoverageLeave[],
  month: number,
  year: number,
): LeaveCoveredAbsencesResult {
  const { start: monthStart, end: monthEnd } = monthBoundsYyyyMmDd(month, year);
  const coveredDates: string[] = [];

  for (const log of dailyLogs) {
    const dateStr = dateToYyyyMmDd(log.date);
    if (dateStr < monthStart || dateStr > monthEnd) {
      continue;
    }
    if (!isAbsentWorkingDay(log)) {
      continue;
    }
    if (!isDateCoveredByLeave(dateStr, approvedLeaves)) {
      continue;
    }
    coveredDates.push(dateStr);
  }

  coveredDates.sort();

  return {
    coveredDays: coveredDates.length,
    coveredDates,
    leaves: mapLeavesForResponse(approvedLeaves),
  };
}

async function fetchApprovedLeavesForMonth(
  prisma: AttendanceLeavePrisma,
  companyId: string,
  employeeIds: string[],
  month: number,
  year: number,
): Promise<Map<string, LeaveCoverageLeave[]>> {
  const { monthStart, monthEnd } = monthOverlapDateRange(month, year);

  const rows = await prisma.leaveRequest.findMany({
    where: {
      companyId,
      employeeId: { in: employeeIds },
      status: 'APPROVED',
      deletedAt: null,
      periods: {
        some: {
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
      },
    },
    select: {
      id: true,
      employeeId: true,
      leaveType: true,
      periods: {
        where: {
          startDate: { lte: monthEnd },
          endDate: { gte: monthStart },
        },
        select: {
          startDate: true,
          endDate: true,
          days: true,
        },
      },
    },
  });

  const byEmployee = new Map<string, LeaveCoverageLeave[]>();
  for (const row of rows) {
    const entry: LeaveCoverageLeave = {
      id: row.id,
      leaveType: row.leaveType,
      periods: row.periods.map((period) => ({
        startDate: period.startDate,
        endDate: period.endDate,
        days: Number(period.days),
      })),
    };
    const list = byEmployee.get(row.employeeId) ?? [];
    list.push(entry);
    byEmployee.set(row.employeeId, list);
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

const emptyCoverage = (): LeaveCoveredAbsencesResult => ({
  coveredDays: 0,
  coveredDates: [],
  leaves: [],
});

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
 * Bulk leave coverage for many employees — two queries regardless of headcount.
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
