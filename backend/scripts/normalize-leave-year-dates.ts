/**
 * Normalize LeaveBalanceEntry.leaveYearStart / leaveYearEnd to date-only
 * UTC midnight of the Africa/Addis_Ababa civil date (YYYY-MM-DD).
 *
 * Dry-run by default. Apply with --apply.
 *
 * Usage:
 *   npx ts-node --transpile-only scripts/normalize-leave-year-dates.ts
 *   npx ts-node --transpile-only scripts/normalize-leave-year-dates.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import {
  toDateOnlyKey,
  toDateOnlyUtc,
} from '../src/modules/leave-policy/application/utils/leave-year.util';

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const prisma = new PrismaClient();

  const rows = await prisma.leaveBalanceEntry.findMany({
    select: {
      id: true,
      employeeId: true,
      leaveType: true,
      leaveYearStart: true,
      leaveYearEnd: true,
      kind: true,
      days: true,
    },
    orderBy: [{ employeeId: 'asc' }, { leaveYearStart: 'asc' }],
  });

  const changes: Array<{
    id: string;
    employeeId: string;
    leaveType: string;
    kind: string;
    beforeStart: string;
    afterStart: string;
    beforeEnd: string;
    afterEnd: string;
  }> = [];

  for (const row of rows) {
    const afterStart = toDateOnlyUtc(row.leaveYearStart);
    const afterEnd = toDateOnlyUtc(row.leaveYearEnd);
    const beforeStartKey = row.leaveYearStart.toISOString();
    const beforeEndKey = row.leaveYearEnd.toISOString();
    const afterStartKey = afterStart.toISOString();
    const afterEndKey = afterEnd.toISOString();
    if (
      beforeStartKey === afterStartKey &&
      beforeEndKey === afterEndKey &&
      toDateOnlyKey(row.leaveYearStart) === toDateOnlyKey(afterStart)
    ) {
      // Still report if the civil key differs from UTC-date extraction used historically
      const legacyUtcKey = row.leaveYearStart.toISOString().slice(0, 10);
      if (legacyUtcKey === toDateOnlyKey(row.leaveYearStart)) {
        continue;
      }
    }
    if (
      row.leaveYearStart.getTime() === afterStart.getTime() &&
      row.leaveYearEnd.getTime() === afterEnd.getTime()
    ) {
      continue;
    }
    changes.push({
      id: row.id,
      employeeId: row.employeeId,
      leaveType: row.leaveType,
      kind: row.kind,
      beforeStart: beforeStartKey,
      afterStart: afterStartKey,
      beforeEnd: beforeEndKey,
      afterEnd: afterEndKey,
    });
  }

  console.log(
    `Scanned ${rows.length} LeaveBalanceEntry row(s); ${changes.length} need normalization.`,
  );
  for (const change of changes.slice(0, 50)) {
    console.log(
      `${change.id} ${change.leaveType} ${change.kind}: start ${change.beforeStart} → ${change.afterStart}; end ${change.beforeEnd} → ${change.afterEnd}`,
    );
  }
  if (changes.length > 50) {
    console.log(`… and ${changes.length - 50} more`);
  }

  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write changes.');
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const change of changes) {
    await prisma.leaveBalanceEntry.update({
      where: { id: change.id },
      data: {
        leaveYearStart: new Date(change.afterStart),
        leaveYearEnd: new Date(change.afterEnd),
      },
    });
    updated += 1;
  }
  console.log(`Updated ${updated} row(s).`);
  await prisma.$disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
