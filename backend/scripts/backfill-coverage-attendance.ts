/**
 * Recalculates attendance months touched by approved leave, site assignment, or
 * WFH so dayStatus/flags match the coverage-vs-scans rules (site/WFH ignore
 * punches for pay; leave + scans → ON_LEAVE_BUT_SCANNED).
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-coverage-attendance.ts
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-coverage-attendance.ts --apply
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import {
  LeaveRequestStatus,
  PrismaClient,
  SiteAssignmentStatus,
} from '@prisma/client';
import { AppModule } from '../src/app.module';
import { AttendanceService } from '../src/modules/attendance/application/services/attendance.service';
import { monthsTouchedByRange } from '../src/modules/site-assignment/application/utils/site-assignment.util';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

type Target = {
  companyId: string;
  employeeId: string;
  month: number;
  year: number;
};

function addMonthsFromRange(
  map: Map<string, Target>,
  companyId: string,
  employeeId: string,
  startDate: Date,
  endDate: Date,
): void {
  for (const { month, year } of monthsTouchedByRange(startDate, endDate)) {
    const key = `${companyId}:${employeeId}:${year}-${month}`;
    map.set(key, { companyId, employeeId, month, year });
  }
}

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);
  const prisma = new PrismaClient();

  console.log(
    `[backfill-coverage-attendance] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const recalcTargets = new Map<string, Target>();

  const leaves = await prisma.leaveRequest.findMany({
    where: { deletedAt: null, status: LeaveRequestStatus.APPROVED },
    select: {
      companyId: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      periods: { select: { startDate: true, endDate: true } },
    },
  });
  for (const leave of leaves) {
    const ranges =
      leave.periods.length > 0
        ? leave.periods
        : leave.startDate && leave.endDate
          ? [{ startDate: leave.startDate, endDate: leave.endDate }]
          : [];
    for (const range of ranges) {
      addMonthsFromRange(
        recalcTargets,
        leave.companyId,
        leave.employeeId,
        range.startDate,
        range.endDate,
      );
    }
  }

  const sites = await prisma.siteAssignment.findMany({
    where: { deletedAt: null, status: SiteAssignmentStatus.APPROVED },
    select: {
      companyId: true,
      employeeId: true,
      startDate: true,
      endDate: true,
    },
  });
  for (const site of sites) {
    addMonthsFromRange(
      recalcTargets,
      site.companyId,
      site.employeeId,
      site.startDate,
      site.endDate,
    );
  }

  const wfhDays = await prisma.workFromHomeDay.findMany({
    where: { deletedAt: null },
    select: {
      companyId: true,
      date: true,
      scope: true,
      employeeIds: true,
    },
  });

  // WFH ALL / DEPARTMENTS: recalculate every attendance record in that month.
  // WFH EMPLOYEES: only listed employees.
  const wfhCompanyMonths = new Map<
    string,
    { companyId: string; month: number; year: number }
  >();
  for (const day of wfhDays) {
    const month = day.date.getUTCMonth() + 1;
    const year = day.date.getUTCFullYear();
    if (day.scope === 'EMPLOYEES') {
      for (const employeeId of day.employeeIds) {
        const key = `${day.companyId}:${employeeId}:${year}-${month}`;
        recalcTargets.set(key, {
          companyId: day.companyId,
          employeeId,
          month,
          year,
        });
      }
    } else {
      wfhCompanyMonths.set(`${day.companyId}:${year}-${month}`, {
        companyId: day.companyId,
        month,
        year,
      });
    }
  }

  for (const period of wfhCompanyMonths.values()) {
    const records = await prisma.attendanceRecord.findMany({
      where: {
        companyId: period.companyId,
        month: period.month,
        year: period.year,
      },
      select: { companyId: true, employeeId: true, month: true, year: true },
    });
    for (const record of records) {
      const key = `${record.companyId}:${record.employeeId}:${record.year}-${record.month}`;
      recalcTargets.set(key, record);
    }
  }

  console.log(
    `APPROVED_LEAVES=${leaves.length} APPROVED_SITES=${sites.length} WFH_DAYS=${wfhDays.length} RECALC_TARGETS=${recalcTargets.size}`,
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

    for (const row of recalcTargets.values()) {
      const result = await attendance.recalculateCompanyAttendanceMonth(
        row.companyId,
        row.month,
        row.year,
        row.employeeId,
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
