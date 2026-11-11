import { BadRequestException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { EmploymentPeriodLike } from './employment-window.util';
import { inactiveSpanOn, type InactiveSpan } from './inactive-period.util';
import { loadPolicySnapshot } from '../policy/policy-reader.util';

type Db = PrismaClient | Prisma.TransactionClient;

const ymd = (d: Date): string => d.toISOString().slice(0, 10);
const dateOnly = (d: Date): Date =>
  new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/**
 * Pure check: the first date outside every employment period, with the message
 * to show. Users with no periods yet fall back to employmentDate (open-ended).
 */
export function findDateOutsideEmployment(
  periods: ReadonlyArray<EmploymentPeriodLike>,
  employmentDate: Date | null,
  dates: ReadonlyArray<Date>,
): string | null {
  const effective =
    periods.length > 0
      ? periods
      : employmentDate
        ? [{ startDate: employmentDate, endDate: null }]
        : [];
  if (effective.length === 0) return null;
  for (const raw of dates) {
    const date = dateOnly(raw);
    const inside = effective.some(
      (p) =>
        date.getTime() >= p.startDate.getTime() &&
        (p.endDate == null || date.getTime() <= p.endDate.getTime()),
    );
    if (inside) continue;
    const before = effective
      .filter((p) => p.endDate && p.endDate.getTime() < date.getTime())
      .sort((a, b) => b.endDate!.getTime() - a.endDate!.getTime())[0];
    if (before?.endDate) {
      return `Outside employment period (last working day ${ymd(before.endDate)})`;
    }
    const after = [...effective].sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
    return `Outside employment period (employment starts ${ymd(after.startDate)})`;
  }
  return null;
}

/**
 * Requests (overtime, field movement, site, WFH, leave, per diem, expense,
 * business trip) may only cover days inside an employment period. 400 otherwise.
 */
export async function assertWithinEmploymentWindow(
  db: Db,
  employeeId: string,
  dates: ReadonlyArray<Date | null | undefined>,
): Promise<void> {
  const list = dates.filter((d): d is Date => d instanceof Date && !Number.isNaN(d.getTime()));
  if (list.length === 0) return;
  const [user, periods] = await Promise.all([
    db.user.findUnique({ where: { id: employeeId }, select: { employmentDate: true } }),
    db.employmentPeriod.findMany({
      where: { userId: employeeId },
      select: { startDate: true, endDate: true },
    }),
  ]);
  if (!user) return;
  const error = findDateOutsideEmployment(periods, user.employmentDate, list);
  if (error) throw new BadRequestException(error);
}

/** Every UTC day of an inclusive range (catches a gap between two employment periods). */
export function datesInRange(from: Date, to: Date | null | undefined): Date[] {
  const start = dateOnly(from);
  const end = to ? dateOnly(to) : start;
  const out: Date[] = [];
  for (let t = start.getTime(); t <= end.getTime(); t += 86_400_000) out.push(new Date(t));
  return out;
}

/** Overtime on a day inside an unpaid inactive period is rejected. */
export async function assertNotInUnpaidInactivePeriod(
  db: Db,
  companyId: string,
  employeeId: string,
  dates: ReadonlyArray<Date>,
): Promise<void> {
  if (dates.length === 0) return;
  const spans: InactiveSpan[] = await db.inactivePeriod.findMany({
    where: { userId: employeeId },
    select: { type: true, fromDate: true, toDate: true },
  });
  for (const raw of dates) {
    const date = dateOnly(raw);
    const span = inactiveSpanOn(date, spans);
    if (!span) continue;
    const policy = await loadPolicySnapshot(db, companyId, date);
    if (!policy.inactivePaid[span.type]) {
      throw new BadRequestException(
        `Not allowed on ${ymd(date)}: the employee is inactive (${span.type.toLowerCase().replace('_', ' ')}, unpaid)`,
      );
    }
  }
}
