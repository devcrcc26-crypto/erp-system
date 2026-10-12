/**
 * Recalculates attendance for months touched by approved leave requests.
 * Fixes days that stayed ABSENT/PRESENT after auto-approved leave (no recalc).
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-leave-attendance.ts
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-leave-attendance.ts --apply
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { LeaveRequestStatus, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AttendanceService } from '../src/modules/attendance/application/services/attendance.service';
import { monthsTouchedByRange } from '../src/modules/site-assignment/application/utils/site-assignment.util';
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
    `[backfill-leave-attendance] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const leaves = await prisma.leaveRequest.findMany({
    where: {
      deletedAt: null,
      status: LeaveRequestStatus.APPROVED,
    },
    select: {
      id: true,
      requestNumber: true,
      companyId: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      periods: {
        select: { startDate: true, endDate: true },
      },
    },
  });

  const recalcTargets = new Map<
    string,
    { companyId: string; employeeId: string; month: number; year: number }
  >();

  for (const leave of leaves) {
    const ranges =
      leave.periods.length > 0
        ? leave.periods
        : leave.startDate && leave.endDate
          ? [{ startDate: leave.startDate, endDate: leave.endDate }]
          : [];
    for (const range of ranges) {
      for (const { month, year } of monthsTouchedByRange(
        range.startDate,
        range.endDate,
      )) {
        const key = `${leave.companyId}:${leave.employeeId}:${year}-${month}`;
        recalcTargets.set(key, {
          companyId: leave.companyId,
          employeeId: leave.employeeId,
          month,
          year,
        });
      }
    }
  }

  console.log(
    `APPROVED_LEAVES=${leaves.length} RECALC_TARGETS=${recalcTargets.size}`,
  );

  let recalcDone = 0;
  let recalcSkippedLocked = 0;
  let recalcSkippedApproved = 0;
  let recalcNoRecord = 0;

  if (args.apply && recalcTargets.size > 0) {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const attendance = app.get(AttendanceService);

    for (const target of recalcTargets.values()) {
      const result = await attendance.recalculateCompanyAttendanceMonth(
        target.companyId,
        target.month,
        target.year,
        target.employeeId,
      );
      if (result.skippedPayrollLocked) {
        recalcSkippedLocked += 1;
      } else if (result.skippedAttendanceApproved) {
        recalcSkippedApproved += 1;
      } else if (result.updated > 0) {
        recalcDone += 1;
      } else {
        recalcNoRecord += 1;
      }
    }

    await app.close();
  }

  console.log(
    `RECALC_DONE=${recalcDone} RECALC_SKIPPED_PAYROLL_LOCKED=${recalcSkippedLocked} RECALC_SKIPPED_ATTENDANCE_APPROVED=${recalcSkippedApproved} RECALC_NO_RECORD=${recalcNoRecord}`,
  );

  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
