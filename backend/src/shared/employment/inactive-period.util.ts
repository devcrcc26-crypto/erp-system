import type { InactiveType, Prisma, PrismaClient } from '@prisma/client';
import { monthBoundsUtc } from './employment-window.util';

type Db = PrismaClient | Prisma.TransactionClient;

export interface InactiveSpan {
  type: InactiveType;
  fromDate: Date;
  /** Last inactive day; null = still open. */
  toDate: Date | null;
}

const DAY_MS = 86_400_000;

export function isDateInSpan(date: Date, span: InactiveSpan): boolean {
  const t = date.getTime();
  return t >= span.fromDate.getTime() && (span.toDate == null || t <= span.toDate.getTime());
}

/** The inactive span covering `date`, if any (latest start wins on overlap). */
export function inactiveSpanOn(
  date: Date,
  spans: ReadonlyArray<InactiveSpan>,
): InactiveSpan | null {
  let found: InactiveSpan | null = null;
  for (const span of spans) {
    if (isDateInSpan(date, span) && (!found || span.fromDate > found.fromDate)) {
      found = span;
    }
  }
  return found;
}

/** Calendar days of each type inside [from, to] (inclusive). */
export function inactiveDaysByType(
  spans: ReadonlyArray<InactiveSpan>,
  from: Date,
  to: Date,
): Map<InactiveType, number> {
  const result = new Map<InactiveType, number>();
  for (let t = from.getTime(); t <= to.getTime(); t += DAY_MS) {
    const span = inactiveSpanOn(new Date(t), spans);
    if (span) result.set(span.type, (result.get(span.type) ?? 0) + 1);
  }
  return result;
}

export async function loadInactiveSpansForMonth(
  db: Db,
  userIds: readonly string[],
  month: number,
  year: number,
): Promise<Map<string, InactiveSpan[]>> {
  const result = new Map<string, InactiveSpan[]>();
  if (userIds.length === 0) return result;
  const { start, end } = monthBoundsUtc(month, year);
  const rows = await db.inactivePeriod.findMany({
    where: {
      userId: { in: [...userIds] },
      fromDate: { lte: end },
      OR: [{ toDate: null }, { toDate: { gte: start } }],
    },
    select: { userId: true, type: true, fromDate: true, toDate: true },
  });
  for (const row of rows) {
    const list = result.get(row.userId) ?? [];
    list.push({ type: row.type, fromDate: row.fromDate, toDate: row.toDate });
    result.set(row.userId, list);
  }
  return result;
}
