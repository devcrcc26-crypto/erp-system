/**
 * Back-fills overtime entries that fall inside an APPROVED site assignment:
 * sets site_assignment_id (the "Site assignment" label) and
 * site_within_schedule_hours. Hours columns are NEVER changed.
 *
 * site_within_schedule_hours is taken from the stored hours: the part of the
 * stored total above what office-day rules allow for that time span, capped at
 * the span's scheduled (site-claimable) hours. Entries priced under office
 * rules therefore get 0.
 *
 * Entries dated in a month whose payroll run is closed (APPROVED, GM_APPROVED
 * or PAID) are skipped and counted, so payroll for closed periods cannot change.
 *
 * Run after migration 20261017100000_overtime_site_assignment.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-overtime-site-assignment.ts
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-overtime-site-assignment.ts --apply
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Prisma, PrismaClient, SiteAssignmentStatus } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PAYROLL_LOCKED_RUN_STATUSES } from '../src/modules/attendance/application/utils/attendance-recalc-policy.util';
import {
  calculateOvertimeHoursDetailed,
  totalOvertimeHours,
} from '../src/modules/overtime/application/utils/overtime-hours.util';
import {
  buildOvertimeDayContext,
  formatOvertimeTimeHhMm,
  overtimeEndTimeLabel,
} from '../src/modules/payroll/application/utils/payroll-overtime.util';
import { WorkScheduleService } from '../src/modules/work-schedule/application/services/work-schedule.service';
import { getPolicy } from '../src/shared/policy/policy-reader.util';
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
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  const workSchedule = app.get(WorkScheduleService);

  console.log(
    `[backfill-overtime-site-assignment] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const assignments = await prisma.siteAssignment.findMany({
    where: { deletedAt: null, status: SiteAssignmentStatus.APPROVED },
    select: {
      id: true,
      companyId: true,
      employeeId: true,
      startDate: true,
      endDate: true,
      employee: { select: { nationality: true } },
    },
  });

  const lockedRuns = await prisma.payrollRun.findMany({
    where: { deletedAt: null, status: { in: [...PAYROLL_LOCKED_RUN_STATUSES] } },
    select: { companyId: true, month: true, year: true },
  });
  const lockedPeriods = new Set(
    lockedRuns.map((run) => `${run.companyId}:${run.year}-${run.month}`),
  );
  const isLocked = (companyId: string, date: Date): boolean =>
    lockedPeriods.has(
      `${companyId}:${date.getUTCFullYear()}-${date.getUTCMonth() + 1}`,
    );

  let linked = 0;
  let withSubtotal = 0;
  let skippedClosedPayroll = 0;

  for (const assignment of assignments) {
    // Only pre-existing columns are read, so a dry-run works before the migration.
    const entries = await prisma.overtimeEntry.findMany({
      where: {
        date: { gte: assignment.startDate, lte: assignment.endDate },
        sheet: {
          companyId: assignment.companyId,
          employeeId: assignment.employeeId,
          deletedAt: null,
        },
      },
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        endsAtEndOfDay: true,
        isHoliday: true,
        isOvernight: true,
        regularHours: true,
        nightHours: true,
        weekendHours: true,
        holidayHours: true,
      },
    });

    for (const entry of entries) {
      if (isLocked(assignment.companyId, entry.date)) {
        skippedClosedPayroll += 1;
        continue;
      }
      const within = await withinScheduleFromStoredHours(
        prisma,
        workSchedule,
        assignment.companyId,
        assignment.employeeId,
        assignment.employee.nationality,
        entry,
      );
      linked += 1;
      if (within > 0) {
        withSubtotal += 1;
      }
      if (args.apply) {
        await prisma.overtimeEntry.update({
          where: { id: entry.id },
          data: {
            siteAssignmentId: assignment.id,
            siteWithinScheduleHours: new Prisma.Decimal(within),
          },
        });
      }
    }
  }

  console.log(
    `[backfill-overtime-site-assignment] assignments=${assignments.length} entriesLinked=${linked} entriesWithWithinScheduleHours=${withSubtotal} skippedClosedPayroll=${skippedClosedPayroll} closedPayrollPeriods=${lockedPeriods.size}`,
  );
  await app.close();
  await prisma.$disconnect();
}

async function withinScheduleFromStoredHours(
  prisma: PrismaClient,
  workSchedule: WorkScheduleService,
  companyId: string,
  employeeId: string,
  nationality: Parameters<WorkScheduleService['isHolidayForEmployee']>[1],
  entry: {
    date: Date;
    startTime: Date;
    endTime: Date;
    endsAtEndOfDay: boolean;
    isHoliday: boolean;
    isOvernight: boolean;
    regularHours: Prisma.Decimal;
    nightHours: Prisma.Decimal;
    weekendHours: Prisma.Decimal;
    holidayHours: Prisma.Decimal;
  },
): Promise<number> {
  const contextFor = async (onDate: Date, claimable: boolean) => {
    const schedule = await workSchedule.getActiveSchedule(employeeId, companyId, onDate);
    const weekday = schedule.days.find((day) => day.dayOfWeek === onDate.getUTCDay());
    const holiday = await workSchedule.isHolidayForEmployee(companyId, nationality, onDate);
    return buildOvertimeDayContext(
      weekday,
      holiday.isHoliday || (onDate === entry.date && entry.isHoliday),
      await getPolicy(prisma, companyId, 'lunchCountsAsOvertime', onDate),
      claimable,
    );
  };

  const nextDate = new Date(entry.date.getTime() + 86_400_000);
  const price = async (claimable: boolean) =>
    calculateOvertimeHoursDetailed(
      entry.date,
      formatOvertimeTimeHhMm(entry.startTime),
      overtimeEndTimeLabel(entry.endTime, entry.endsAtEndOfDay, entry.isOvernight),
      await contextFor(entry.date, claimable),
      entry.isOvernight,
      entry.isOvernight ? await contextFor(nextDate, claimable) : undefined,
    );

  try {
    const office = await price(false);
    const site = await price(true);
    const storedTotal = totalOvertimeHours({
      regularHours: Number(entry.regularHours),
      nightHours: Number(entry.nightHours),
      weekendHours: Number(entry.weekendHours),
      holidayHours: Number(entry.holidayHours),
    });
    const extra = storedTotal - totalOvertimeHours(office.buckets);
    return Math.round(Math.max(0, Math.min(extra, site.withinScheduleHours)) * 100) / 100;
  } catch {
    return 0;
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
