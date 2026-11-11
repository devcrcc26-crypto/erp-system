/**
 * Repairs approved/rejected/cancelled field movement logs whose entries still
 * carry draft/submitted status, then recalculates affected employees when allowed.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/repair-field-movement-entry-status.ts
 *   npx ts-node -r tsconfig-paths/register scripts/repair-field-movement-entry-status.ts --apply
 */

import { NestFactory } from '@nestjs/core';
import { FieldMovementStatus, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AttendanceService } from '../src/modules/attendance/application/services/attendance.service';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);
  const prisma = new PrismaClient();

  console.log(
    `[repair-field-movement-entry-status] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const terminal: FieldMovementStatus[] = [
    FieldMovementStatus.APPROVED,
    FieldMovementStatus.REJECTED,
    FieldMovementStatus.CANCELLED,
  ];

  const logs = await prisma.fieldMovementLog.findMany({
    where: {
      deletedAt: null,
      status: { in: terminal },
    },
    select: {
      id: true,
      status: true,
      companyId: true,
      employeeId: true,
      month: true,
      year: true,
      requestNumber: true,
      entries: { select: { id: true, status: true } },
    },
  });

  const toFix = logs.filter((log) =>
    log.entries.some((entry) => entry.status !== log.status),
  );

  const stalePendingDays = await prisma.attendanceDailyLog.findMany({
    where: {
      dayStatus: 'FIELD_MOVEMENT_PENDING',
      fieldMovementEntries: {
        some: {
          log: { status: FieldMovementStatus.APPROVED, deletedAt: null },
        },
      },
    },
    select: {
      record: {
        select: {
          companyId: true,
          employeeId: true,
          month: true,
          year: true,
        },
      },
    },
  });

  const recalcTargets = new Map<
    string,
    { companyId: string; employeeId: string; month: number; year: number }
  >();
  for (const log of toFix) {
    recalcTargets.set(`${log.companyId}:${log.employeeId}:${log.month}:${log.year}`, {
      companyId: log.companyId,
      employeeId: log.employeeId,
      month: log.month,
      year: log.year,
    });
  }
  for (const row of stalePendingDays) {
    const r = row.record;
    recalcTargets.set(`${r.companyId}:${r.employeeId}:${r.month}:${r.year}`, r);
  }

  let entriesFixed = 0;
  let recalcSkipped = 0;
  let recalcDone = 0;

  if (args.apply && (toFix.length > 0 || recalcTargets.size > 0)) {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const attendance = app.get(AttendanceService);

    for (const log of toFix) {
      const updated = await prisma.fieldMovementEntry.updateMany({
        where: { logId: log.id, status: { not: log.status } },
        data: { status: log.status },
      });
      entriesFixed += updated.count;
    }

    for (const target of recalcTargets.values()) {
      const recalc = await attendance.recalculateCompanyAttendanceMonth(
        target.companyId,
        target.month,
        target.year,
        target.employeeId,
      );
      if (recalc.skippedAttendanceApproved || recalc.skippedPayrollLocked) {
        recalcSkipped += 1;
      } else if (recalc.updated > 0) {
        recalcDone += 1;
      }
    }

    await app.close();
  }

  console.log(
    `LOGS_MISMATCHED=${toFix.length} STALE_PENDING_DAYS=${stalePendingDays.length} ENTRIES_FIXED=${entriesFixed} RECALC_DONE=${recalcDone} RECALC_SKIPPED=${recalcSkipped}`,
  );

  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
