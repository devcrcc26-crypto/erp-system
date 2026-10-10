import type { Prisma, PrismaClient } from '@prisma/client';
import {
  holidayAppliesToNationality,
  holidayFallsOnDate,
} from '../../../work-schedule/application/services/work-schedule.dates';
import { dateToYyyyMmDd } from '../services/attendance-leave.util';
import { siteNameForDate as resolveSiteNameForDate } from '../../../site-assignment/application/utils/site-assignment.util';
import {
  type DayDeductionContext,
  type DayDeductionDayInput,
  type FieldMovementCoverage,
} from './day-deduction.util';
import {
  fieldMovementCoverageFromEntryStatus,
  mergeFieldMovementCoverage,
} from './field-movement-entry-status.util';

type Db = PrismaClient | Prisma.TransactionClient;

export interface EmployeeDeductionProfile {
  id: string;
  departmentId: string | null;
  nationality: string | null;
  attendanceMode?: string | null;
}

interface LoadedDeductionData {
  holidays: Array<{
    name: string;
    date: Date;
    isRecurring: boolean;
    appliesToNationality: string;
  }>;
  wfhDays: Array<{
    date: Date;
    scope: string;
    departmentIds: string[];
    employeeIds: string[];
  }>;
  /** Approved paid leave dates (excludes UNPAID). */
  leaveDateKeys: Set<string>;
  /** Approved UNPAID leave dates — absence, not coverage. */
  unpaidLeaveDateKeys: Set<string>;
  fieldMovementByDate: Map<string, FieldMovementCoverage>;
  /** FIELD_VISIT / EARLY_LEAVE only — used for early-departure waiver. */
  earlyDepartureWaiverByDate: Map<string, FieldMovementCoverage>;
  siteAssignments: Array<{
    startDate: Date;
    endDate: Date;
    siteName: string;
  }>;
}

/**
 * Loads holidays, WFH, leave, and field movement coverage for a payroll month.
 */
export async function loadDeductionDataForMonth(
  db: Db,
  companyId: string,
  employee: EmployeeDeductionProfile,
  month: number,
  year: number,
  dailyLogIdsByDate: Map<string, string>,
): Promise<LoadedDeductionData> {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));

  const holidays = await db.publicHoliday.findMany({
    where: {
      companyId,
      isActive: true,
      deletedAt: null,
    },
    select: {
      name: true,
      date: true,
      isRecurring: true,
      appliesToNationality: true,
    },
  });

  const wfhDays = await db.workFromHomeDay.findMany({
    where: {
      companyId,
      deletedAt: null,
      date: { gte: monthStart, lte: monthEnd },
    },
    select: {
      date: true,
      scope: true,
      departmentIds: true,
      employeeIds: true,
    },
  });

  const leaveRows = await db.leaveRequest.findMany({
    where: {
      companyId,
      employeeId: employee.id,
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
      leaveType: true,
      periods: {
        select: { startDate: true, endDate: true },
      },
    },
  });

  const leaveDateKeys = new Set<string>();
  const unpaidLeaveDateKeys = new Set<string>();
  for (const leave of leaveRows) {
    const target =
      leave.leaveType === 'UNPAID' ? unpaidLeaveDateKeys : leaveDateKeys;
    for (const period of leave.periods) {
      const cursor = new Date(
        Math.max(period.startDate.getTime(), monthStart.getTime()),
      );
      const end = Math.min(period.endDate.getTime(), monthEnd.getTime());
      while (cursor.getTime() <= end) {
        target.add(dateToYyyyMmDd(cursor));
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
  }

  const dailyLogIds = [...dailyLogIdsByDate.values()];
  const fieldMovementByDate = new Map<string, FieldMovementCoverage>();
  const earlyDepartureWaiverByDate = new Map<string, FieldMovementCoverage>();
  if (dailyLogIds.length > 0) {
    const entries = await db.fieldMovementEntry.findMany({
      where: { dailyLogId: { in: dailyLogIds } },
      select: {
        dailyLogId: true,
        reason: true,
        status: true,
        log: { select: { status: true } },
      },
    });
    for (const [dateKey, logId] of dailyLogIdsByDate.entries()) {
      const related = entries.filter((e) => e.dailyLogId === logId);
      let coverage: FieldMovementCoverage = 'NONE';
      let waiver: FieldMovementCoverage = 'NONE';
      for (const entry of related) {
        const entryStatus = entry.status ?? entry.log.status;
        const next = fieldMovementCoverageFromEntryStatus(entryStatus);
        coverage = mergeFieldMovementCoverage(coverage, next);
        const isEarlyWaiver =
          entry.reason === 'FIELD_VISIT' || entry.reason === 'EARLY_LEAVE';
        if (isEarlyWaiver) {
          waiver = mergeFieldMovementCoverage(waiver, next);
        }
      }
      fieldMovementByDate.set(dateKey, coverage);
      earlyDepartureWaiverByDate.set(dateKey, waiver);
    }
  }

  const siteRows = await db.siteAssignment.findMany({
    where: {
      companyId,
      employeeId: employee.id,
      status: 'APPROVED',
      deletedAt: null,
      startDate: { lte: monthEnd },
      endDate: { gte: monthStart },
    },
    select: {
      startDate: true,
      endDate: true,
      siteName: true,
    },
  });

  return {
    holidays,
    wfhDays,
    leaveDateKeys,
    unpaidLeaveDateKeys,
    fieldMovementByDate,
    earlyDepartureWaiverByDate,
    siteAssignments: siteRows.map((row) => ({
      startDate: row.startDate,
      endDate: row.endDate,
      siteName: row.siteName,
    })),
  };
}

function wfhAppliesToEmployee(
  row: LoadedDeductionData['wfhDays'][number],
  employee: EmployeeDeductionProfile,
  dateKey: string,
): boolean {
  if (dateToYyyyMmDd(row.date) !== dateKey) {
    return false;
  }
  if (row.employeeIds.includes(employee.id)) {
    return true;
  }
  if (row.scope === 'ALL') {
    return true;
  }
  if (row.scope === 'EMPLOYEES') {
    return false;
  }
  if (row.scope === 'DEPARTMENTS') {
    return (
      employee.departmentId != null &&
      row.departmentIds.includes(employee.departmentId)
    );
  }
  return false;
}

/**
 * Holiday that applies to this employee on the given calendar day, if any.
 */
export function matchedPublicHolidayForEmployee(
  employee: EmployeeDeductionProfile,
  data: LoadedDeductionData,
  date: Date,
): { name: string; date: Date; isRecurring: boolean; appliesToNationality: string } | null {
  return (
    data.holidays.find(
      (holiday) =>
        holidayFallsOnDate(holiday.date, holiday.isRecurring, date) &&
        holidayAppliesToNationality(
          holiday.appliesToNationality as 'ALL' | 'ETHIOPIAN' | 'CHINESE',
          employee.nationality as 'ETHIOPIAN' | 'CHINESE' | null,
        ),
    ) ?? null
  );
}

/**
 * Builds dayDeduction context from preloaded month data.
 */
export function buildDayDeductionContext(
  employee: EmployeeDeductionProfile,
  data: LoadedDeductionData,
): DayDeductionContext {
  return {
    isSunday: (date) => date.getUTCDay() === 0,
    isPublicHoliday: (date) =>
      matchedPublicHolidayForEmployee(employee, data, date) != null,
    isWorkFromHome: (date) => {
      const key = dateToYyyyMmDd(date);
      return data.wfhDays.some((row) => wfhAppliesToEmployee(row, employee, key));
    },
    siteNameForDate: (date) =>
      resolveSiteNameForDate(date, data.siteAssignments),
    isOnApprovedLeave: (date) => data.leaveDateKeys.has(dateToYyyyMmDd(date)),
    isOnUnpaidLeave: (date) =>
      data.unpaidLeaveDateKeys.has(dateToYyyyMmDd(date)),
    fieldMovementCoverage: (date) =>
      data.fieldMovementByDate.get(dateToYyyyMmDd(date)) ?? 'NONE',
    earlyDepartureWaiver: (date) =>
      data.earlyDepartureWaiverByDate.get(dateToYyyyMmDd(date)) ?? 'NONE',
    isAttendanceExempt: () => employee.attendanceMode === 'EXEMPT',
  };
}

export function dailyLogToDeductionInput(log: {
  date: Date;
  clockInLocal: string | null;
  clockOutLocal: string | null;
  correctedClockInLocal: string | null;
  correctedClockOutLocal: string | null;
  isLastExportDay: boolean;
  scheduledEnd?: string | null;
}): DayDeductionDayInput {
  return {
    date: log.date,
    clockIn: log.correctedClockInLocal ?? log.clockInLocal,
    clockOut: log.correctedClockOutLocal ?? log.clockOutLocal,
    isLastExportDay: log.isLastExportDay,
    scheduledEnd: log.scheduledEnd ?? '17:30',
  };
}
