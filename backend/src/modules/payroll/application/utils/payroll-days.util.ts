/**
 * Company payroll calendar: every month is treated as 30 paid days.
 * Absences and leave are applied against the employed window within that month.
 */

export const PAYROLL_MONTH_DAYS = 30;

export interface EmployedPayrollDaysResult {
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
  // Day 0 of next month = last day of this month (UTC).
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthStartUtc(month: number, year: number): Date {
  return new Date(Date.UTC(year, month - 1, 1));
}

function monthEndUtc(month: number, year: number): Date {
  return new Date(Date.UTC(year, month - 1, lastCalendarDayOfMonth(month, year)));
}

/**
 * Paid-day window for an employee in a given month, before absences.
 * Uses a fixed 30-day payroll month regardless of calendar length.
 */
export function employedPayrollDays(
  month: number,
  year: number,
  contractStart: Date,
  contractEnd: Date | null,
): EmployedPayrollDaysResult {
  const periodStart = monthStartUtc(month, year);
  const periodEnd = monthEndUtc(month, year);
  const lastDayOfMonth = lastCalendarDayOfMonth(month, year);

  const start = utcYmdParts(contractStart);
  const end = contractEnd ? utcYmdParts(contractEnd) : null;

  // No overlap with the calendar month.
  if (contractStart.getTime() > periodEnd.getTime()) {
    return { days: 0, startDay: 0, endDay: 0 };
  }
  if (end) {
    const endDate = new Date(Date.UTC(end.year, end.month - 1, end.day));
    if (endDate.getTime() < periodStart.getTime()) {
      return { days: 0, startDay: 0, endDay: 0 };
    }
  }

  const startDay =
    contractStart.getTime() < periodStart.getTime() ? 1 : start.day;

  let endDay: number;
  if (
    !contractEnd ||
    contractEnd.getTime() > periodEnd.getTime() ||
    (end != null &&
      end.year === year &&
      end.month === month &&
      end.day === lastDayOfMonth)
  ) {
    endDay = PAYROLL_MONTH_DAYS;
  } else if (end != null && end.year === year && end.month === month) {
    endDay = Math.min(end.day, PAYROLL_MONTH_DAYS);
  } else {
    // Contract ends after this month's calendar — full payroll month.
    endDay = PAYROLL_MONTH_DAYS;
  }

  const days = Math.max(0, endDay - startDay + 1);
  return { days, startDay, endDay };
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
  const windowStart = new Date(Date.UTC(year, month - 1, employed.startDay));
  const calendarEndDay =
    employed.endDay >= PAYROLL_MONTH_DAYS
      ? lastDayOfMonth
      : Math.min(employed.endDay, lastDayOfMonth);
  const windowEnd = new Date(Date.UTC(year, month - 1, calendarEndDay));

  // Clamp to actual contract bounds.
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
