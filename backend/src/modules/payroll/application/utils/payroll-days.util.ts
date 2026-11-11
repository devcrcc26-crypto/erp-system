/**
 * Company payroll calendar: every month is treated as 30 paid days.
 * Joiner/leaver status uses the employee's employment window (not a
 * mid-month renewal contract start). Absences are applied afterward.
 */

import { POLICY_DEFAULTS } from '../../../../shared/policy/policy-definitions';

/**
 * The monthDays policy, locked at 30: the joiner/leaver/renewal day-split
 * rules below (including the 31st-of-month handling) are built on it.
 * Leaver-allowance mode and absence-reduces-allowances are read per payroll
 * month from policy settings (leaverAllowanceMode, allowancesReducedByAbsence).
 */
export const PAYROLL_MONTH_DAYS = POLICY_DEFAULTS.monthDays;

export interface EmployedPayrollDaysResult {
  days: number;
  startDay: number;
  endDay: number;
}

export interface ContractPeriodAllocation {
  contractId: string;
  startDate: Date;
  endDate: Date | null;
  days: number;
  startDay: number;
  endDay: number;
}

function utcYmdParts(date: Date): { year: number; month: number; day: number } {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function lastCalendarDayOfMonth(month: number, year: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthStartUtc(month: number, year: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function monthEndUtc(month: number, year: number): Date {
  return new Date(Date.UTC(year, month - 1, lastCalendarDayOfMonth(month, year)));
}

/**
 * Maps a calendar end day in this month onto the 30-day payroll scale.
 * Leaving on the calendar last day of the month → 30.
 */
function payrollEndDayForLeaver(
  endDayInMonth: number,
  lastDayOfMonth: number,
): number {
  if (endDayInMonth === lastDayOfMonth) {
    return PAYROLL_MONTH_DAYS;
  }
  return Math.min(endDayInMonth, PAYROLL_MONTH_DAYS);
}

/**
 * Paid days for an employment window within a month (before absences).
 *
 * `employmentEnd` (contract end / terminatedAt / employment-period end) is the
 * inclusive last paid day — e.g. termination on 20 Sep yields 20 days for
 * September (1–20), and earned = basic/30×20.
 *
 * - Full month → 30
 * - Joiner on day d: d ≤ 30 → 30 − (d − 1); d = 31 → 1
 * - Leaver on day d: last calendar day → 30; else min(d, 30)
 * - Joiner and leaver same month → min(end, 30) − start + 1
 *   (start on 31st → 1; minimum 0)
 */
export function employedPayrollDays(
  month: number,
  year: number,
  employmentStart: Date,
  employmentEnd: Date | null,
): EmployedPayrollDaysResult {
  const periodStart = monthStartUtc(month, year);
  const periodEnd = monthEndUtc(month, year);
  const lastDayOfMonth = lastCalendarDayOfMonth(month, year);

  // Normalise to UTC date-only so time-of-day never shifts the paid-day boundary.
  const startParts = utcYmdParts(employmentStart);
  const startDateOnly = new Date(
    Date.UTC(startParts.year, startParts.month - 1, startParts.day),
  );
  const endParts = employmentEnd ? utcYmdParts(employmentEnd) : null;
  const endDateOnly = endParts
    ? new Date(Date.UTC(endParts.year, endParts.month - 1, endParts.day))
    : null;

  if (startDateOnly.getTime() > periodEnd.getTime()) {
    return { days: 0, startDay: 0, endDay: 0 };
  }
  if (endDateOnly && endDateOnly.getTime() < periodStart.getTime()) {
    return { days: 0, startDay: 0, endDay: 0 };
  }

  const joinedThisMonth =
    startParts.year === year &&
    startParts.month === month &&
    startDateOnly.getTime() >= periodStart.getTime();

  // Leaving date falls in this month → inclusive last paid day (calendar parts only).
  const leftThisMonth =
    endParts != null &&
    endParts.year === year &&
    endParts.month === month;

  // Joiner on the 31st only (and still employed / leaves later that day).
  if (joinedThisMonth && startParts.day === 31) {
    if (!leftThisMonth || (endParts != null && endParts.day >= 31)) {
      return { days: 1, startDay: 31, endDay: 31 };
    }
    return { days: 0, startDay: 0, endDay: 0 };
  }

  const startDay = joinedThisMonth ? startParts.day : 1;

  let endDay: number;
  if (!leftThisMonth) {
    endDay = PAYROLL_MONTH_DAYS;
  } else {
    endDay = payrollEndDayForLeaver(endParts!.day, lastDayOfMonth);
  }

  // Inclusive: min(end,30) − start + 1 (termination day is paid).
  if (startDay > PAYROLL_MONTH_DAYS) {
    return { days: 0, startDay: 0, endDay: 0 };
  }

  const days = Math.max(0, endDay - startDay + 1);
  return { days, startDay, endDay };
}

/**
 * Splits the month's employment paid days across contiguous contracts on the
 * 30-day scale. A renewal that starts on day d gives the previous contract
 * (d − 1) days and the new contract the remainder of the employment window.
 *
 * `employmentStart` / `employmentEnd` are the employee's company employment
 * bounds (not a mid-month renewal contract start alone).
 */
export function allocateContractPayrollDays(
  month: number,
  year: number,
  contracts: Array<{
    id: string;
    startDate: Date;
    endDate: Date | null;
  }>,
  employmentStart: Date,
  employmentEnd: Date | null,
): ContractPeriodAllocation[] {
  const employment = employedPayrollDays(
    month,
    year,
    employmentStart,
    employmentEnd,
  );
  if (employment.days <= 0) {
    return [];
  }

  const periodStart = monthStartUtc(month, year);
  const periodEnd = monthEndUtc(month, year);

  const overlapping = contracts
    .filter((contract) => {
      if (contract.startDate.getTime() > periodEnd.getTime()) {
        return false;
      }
      if (
        contract.endDate &&
        contract.endDate.getTime() < periodStart.getTime()
      ) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  if (overlapping.length === 0) {
    return [];
  }

  if (overlapping.length === 1) {
    const only = overlapping[0];
    return [
      {
        contractId: only.id,
        startDate: only.startDate,
        endDate: only.endDate,
        days: employment.days,
        startDay: employment.startDay,
        endDay: employment.endDay,
      },
    ];
  }

  const allocations: ContractPeriodAllocation[] = [];
  let cursorStartDay = employment.startDay;

  for (let i = 0; i < overlapping.length; i += 1) {
    const contract = overlapping[i];
    const isLast = i === overlapping.length - 1;

    let segmentEndDay: number;
    if (isLast) {
      segmentEndDay = employment.endDay;
    } else {
      const nextStart = utcYmdParts(overlapping[i + 1].startDate);
      if (nextStart.year === year && nextStart.month === month) {
        // Renewal on day d → previous contract gets d − 1 on the 30-day scale.
        segmentEndDay =
          nextStart.day >= 31
            ? PAYROLL_MONTH_DAYS
            : Math.min(nextStart.day - 1, PAYROLL_MONTH_DAYS);
      } else {
        segmentEndDay = employment.endDay;
      }
    }

    if (segmentEndDay < cursorStartDay) {
      allocations.push({
        contractId: contract.id,
        startDate: contract.startDate,
        endDate: contract.endDate,
        days: 0,
        startDay: cursorStartDay,
        endDay: cursorStartDay,
      });
      // Next segment may still start on day 31 after a full 1–30 prior period.
      cursorStartDay =
        segmentEndDay >= PAYROLL_MONTH_DAYS && !isLast ? 31 : segmentEndDay + 1;
      continue;
    }

    let days = Math.max(0, segmentEndDay - cursorStartDay + 1);
    // Day-31-only slice for a contract that starts on the 31st.
    if (cursorStartDay === 31) {
      days = employment.endDay >= 31 || employment.endDay === PAYROLL_MONTH_DAYS
        ? 1
        : 0;
      segmentEndDay = 31;
    }

    allocations.push({
      contractId: contract.id,
      startDate: contract.startDate,
      endDate: contract.endDate,
      days,
      startDay: cursorStartDay,
      endDay: segmentEndDay,
    });

    cursorStartDay =
      segmentEndDay >= PAYROLL_MONTH_DAYS && !isLast
        ? 31
        : segmentEndDay + 1;
  }

  return allocations;
}

/**
 * Inclusive UTC date window for counting absences/leave within the employed
 * payroll window for the month (calendar dates, not the abstract day-30).
 */
export function employedCalendarWindow(
  month: number,
  year: number,
  contractStart: Date,
  contractEnd: Date | null,
): { windowStart: Date; windowEnd: Date } | null {
  const employed = employedPayrollDays(month, year, contractStart, contractEnd);
  if (employed.days <= 0) {
    return null;
  }

  const lastDayOfMonth = lastCalendarDayOfMonth(month, year);
  const calendarStartDay =
    employed.startDay >= 31 ? lastDayOfMonth : employed.startDay;
  const windowStart = new Date(Date.UTC(year, month - 1, calendarStartDay));
  const calendarEndDay =
    employed.endDay >= PAYROLL_MONTH_DAYS
      ? lastDayOfMonth
      : Math.min(employed.endDay, lastDayOfMonth);
  const windowEnd = new Date(Date.UTC(year, month - 1, calendarEndDay));

  const start =
    contractStart.getTime() > windowStart.getTime() ? contractStart : windowStart;
  let end = windowEnd;
  if (contractEnd && contractEnd.getTime() < end.getTime()) {
    end = contractEnd;
  }

  return { windowStart: start, windowEnd: end };
}

/**
 * True when [contractStart, contractEnd] overlaps the calendar month.
 */
export function contractOverlapsMonth(
  month: number,
  year: number,
  contractStart: Date,
  contractEnd: Date | null,
): boolean {
  return employedPayrollDays(month, year, contractStart, contractEnd).days > 0;
}

export interface EmploymentSegment {
  startDate: Date;
  endDate: Date | null;
}

/**
 * Segments used for monthly paid/absent windows.
 * When there is no overlapping contract, fall back to employmentDate (+ optional
 * end/termination) instead of assuming the whole month.
 */
export function resolveEmploymentSegmentsForMonth(params: {
  overlappingContracts: ReadonlyArray<EmploymentSegment>;
  employmentDate: Date | null | undefined;
  /** Latest known employment end (contract endDate or terminatedAt), if any. */
  employmentEndDate?: Date | null;
}): EmploymentSegment[] {
  if (params.overlappingContracts.length > 0) {
    return [...params.overlappingContracts];
  }
  if (!params.employmentDate) {
    return [];
  }
  return [
    {
      startDate: params.employmentDate,
      endDate: params.employmentEndDate ?? null,
    },
  ];
}
