/**
 * Recalculates every attendance record (all employees × months) so flags/status
 * match current dayDeduction rules.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/recalc-all-attendance-months.ts --apply
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { PrismaClient } from '@prisma/client';
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
    `[recalc-all-attendance-months] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const records = await prisma.attendanceRecord.findMany({
    select: {
      companyId: true,
      employeeId: true,
      month: true,
      year: true,
    },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });

  console.log(`RECORDS=${records.length}`);

  let done = 0;
  let skippedLocked = 0;
  let skippedApproved = 0;
  let noUpdate = 0;

  if (args.apply && records.length > 0) {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const attendance = app.get(AttendanceService);

    for (const row of records) {
      const result = await attendance.recalculateCompanyAttendanceMonth(
        row.companyId,
        row.month,
        row.year,
        row.employeeId,
      );
      if (result.skippedPayrollLocked) {
        skippedLocked += 1;
      } else if (result.skippedAttendanceApproved) {
        skippedApproved += 1;
      } else if (result.updated > 0) {
        done += 1;
      } else {
        noUpdate += 1;
      }
    }

    await app.close();
  }

  console.log(
    `RECALC_DONE=${done} SKIPPED_PAYROLL_LOCKED=${skippedLocked} SKIPPED_ATTENDANCE_APPROVED=${skippedApproved} NO_UPDATE=${noUpdate}`,
  );
  await prisma.$disconnect();
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
