import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

export interface EmploymentPeriodLike {
  startDate: Date;
  endDate: Date | null;
}

export interface EmploymentWindow {
  /** First employed day inside or before the month (null = unknown start). */
  start: Date | null;
  /** Last working day (leaving date), or null while employment is open. */
  end: Date | null;
  /** True when the employment window touches any day of the month. */
  overlapsMonth: boolean;
  /** Leaving date falls inside the month. */
  leftInMonth: boolean;
  /** False when the user has no EmploymentPeriod rows yet (legacy fallback to employmentDate). */
  fromPeriods: boolean;
}

export function monthBoundsUtc(month: number, year: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month - 1, 1)),
    end: new Date(Date.UTC(year, month, 0)),
  };
}

/** Effective contract end: the earlier of endDate and terminatedAt (null = open). */
export function effectiveContractEnd(
  endDate: Date | null | undefined,
  terminatedAt: Date | null | undefined,
): Date | null {
  if (endDate && terminatedAt) {
    return endDate.getTime() <= terminatedAt.getTime() ? endDate : terminatedAt;
  }
  return endDate ?? terminatedAt ?? null;
}

/**
 * Employment window for one month. Periods overlapping the month are merged
 * (earliest start, latest end; open if any is open). With no periods at all the
 * user predates the EmploymentPeriod backfill: fall back to employmentDate, open-ended.
 */
export function resolveEmploymentWindow(
  periods: ReadonlyArray<EmploymentPeriodLike>,
  employmentDate: Date | null | undefined,
  month: number,
  year: number,
): EmploymentWindow {
  const { start: monthStart, end: monthEnd } = monthBoundsUtc(month, year);

  if (periods.length === 0) {
    const start = employmentDate ?? null;
    return {
      start,
      end: null,
      overlapsMonth: start == null || start.getTime() <= monthEnd.getTime(),
      leftInMonth: false,
      fromPeriods: false,
    };
  }

  const overlapping = periods.filter(
    (p) =>
      p.startDate.getTime() <= monthEnd.getTime() &&
      (p.endDate == null || p.endDate.getTime() >= monthStart.getTime()),
  );
  if (overlapping.length === 0) {
    return { start: null, end: null, overlapsMonth: false, leftInMonth: false, fromPeriods: true };
  }

  let start = overlapping[0].startDate;
  let end: Date | null = overlapping[0].endDate;
  for (const p of overlapping.slice(1)) {
    if (p.startDate.getTime() < start.getTime()) start = p.startDate;
    if (end != null) {
      end = p.endDate == null ? null : p.endDate.getTime() > end.getTime() ? p.endDate : end;
    }
  }

  return {
    start,
    end,
    overlapsMonth: true,
    leftInMonth: end != null && end.getTime() <= monthEnd.getTime(),
    fromPeriods: true,
  };
}

/** Caps a date range end at the leaving date. */
export function capAtEmploymentEnd(end: Date | null, window: EmploymentWindow): Date | null {
  if (!window.end) return end;
  if (!end) return window.end;
  return end.getTime() <= window.end.getTime() ? end : window.end;
}

/**
 * Contract segments with end = min(endDate, terminatedAt, leaving date);
 * segments that end before they start are dropped.
 */
export function cappedContractSegments(
  contracts: ReadonlyArray<{ startDate: Date; endDate: Date | null; terminatedAt?: Date | null }>,
  window: EmploymentWindow | null,
): EmploymentPeriodLike[] {
  const result: EmploymentPeriodLike[] = [];
  for (const c of contracts) {
    let end = effectiveContractEnd(c.endDate, c.terminatedAt ?? null);
    if (window) end = capAtEmploymentEnd(end, window);
    if (end && end.getTime() < c.startDate.getTime()) continue;
    result.push({ startDate: c.startDate, endDate: end });
  }
  return result;
}

export interface HoldoverContractLike {
  id: string;
  startDate: Date;
  endDate: Date | null;
  terminatedAt?: Date | null;
}

/**
 * Contract ended without a new one while employment stays open: the person is
 * never auto-separated, so the last contract's terms keep applying until HR
 * renews, converts or separates. Returns the date the contract ended when the
 * holdover applies this month, else null. Legacy users without EmploymentPeriod
 * rows are excluded (their contracts still define employment).
 */
export function contractHoldoverEndedOn(
  window: EmploymentWindow | null,
  latest: Pick<HoldoverContractLike, 'endDate' | 'terminatedAt'> | null | undefined,
  monthEnd: Date,
): Date | null {
  if (!window?.fromPeriods || !window.overlapsMonth || !latest) return null;
  if (latest.terminatedAt || !latest.endDate) return null;
  if (latest.endDate.getTime() >= monthEnd.getTime()) return null;
  if (window.end && window.end.getTime() <= latest.endDate.getTime()) return null;
  return latest.endDate;
}

/**
 * Applies {@link contractHoldoverEndedOn}: the latest contract is extended to the
 * leaving date (or left open), and added to the month list when it ended before
 * the month started.
 */
export function withContractHoldover<T extends HoldoverContractLike>(
  monthContracts: T[],
  latest: T | null | undefined,
  window: EmploymentWindow | null,
  monthEnd: Date,
): { contracts: T[]; endedOn: Date | null } {
  const endedOn = contractHoldoverEndedOn(window, latest ?? null, monthEnd);
  if (!endedOn || !latest) return { contracts: monthContracts, endedOn: null };
  const extended = { ...latest, endDate: window?.end ?? null };
  const rest = monthContracts.filter((c) => c.id !== latest.id);
  return {
    contracts: [...rest, extended].sort((a, b) => a.startDate.getTime() - b.startDate.getTime()),
    endedOn,
  };
}

/**
 * Batch-loads employment windows for the month. Users missing from the result
 * were not requested; every requested id gets a window (fallback when no periods).
 */
export async function loadEmploymentWindows(
  db: Db,
  users: ReadonlyArray<{ id: string; employmentDate: Date | null }>,
  month: number,
  year: number,
): Promise<Map<string, EmploymentWindow>> {
  const result = new Map<string, EmploymentWindow>();
  if (users.length === 0) return result;

  const rows = await db.employmentPeriod.findMany({
    where: { userId: { in: users.map((u) => u.id) } },
    select: { userId: true, startDate: true, endDate: true },
  });
  const byUser = new Map<string, EmploymentPeriodLike[]>();
  for (const row of rows) {
    const list = byUser.get(row.userId) ?? [];
    list.push({ startDate: row.startDate, endDate: row.endDate });
    byUser.set(row.userId, list);
  }
  for (const user of users) {
    result.set(
      user.id,
      resolveEmploymentWindow(byUser.get(user.id) ?? [], user.employmentDate, month, year),
    );
  }
  return result;
}

export async function getEmploymentWindow(
  db: Db,
  userId: string,
  month: number,
  year: number,
): Promise<EmploymentWindow | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, employmentDate: true },
  });
  if (!user) return null;
  const map = await loadEmploymentWindows(db, [user], month, year);
  return map.get(userId) ?? null;
}

/**
 * Prisma filter for "may be employed in this month": an overlapping period, or
 * (legacy, no periods yet) an active login.
 */
export function employedInMonthWhere(month: number, year: number): Prisma.UserWhereInput {
  const { start, end } = monthBoundsUtc(month, year);
  return {
    OR: [
      {
        employmentPeriods: {
          some: {
            startDate: { lte: end },
            OR: [{ endDate: null }, { endDate: { gte: start } }],
          },
        },
      },
      { isActive: true, employmentPeriods: { none: {} } },
    ],
  };
}
