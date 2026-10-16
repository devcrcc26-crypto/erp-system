/**
 * Read-only: lists APPROVED/PENDING leave requests whose stored days
 * differ from schedule-aware recalculation. Does not write.
 *
 * Usage: npx ts-node --transpile-only scripts/report-leave-days-mismatch.ts
 */
import { PrismaClient, LeaveRequestStatus } from '@prisma/client';
import { formatDateOnly } from '../src/modules/work-schedule/application/services/work-schedule.dates';
import {
  calculateLeaveDaysFromPeriods,
  type LeaveDayPortion,
} from '../src/modules/leave/application/utils/leave-days.util';
import {
  holidayAppliesToNationality,
  holidayFallsOnDate,
} from '../src/modules/work-schedule/application/services/work-schedule.dates';

async function main(): Promise<void> {
  const prisma = new PrismaClient();

  const statuses: LeaveRequestStatus[] = [
    LeaveRequestStatus.SUBMITTED,
    LeaveRequestStatus.IN_REVIEW,
    LeaveRequestStatus.APPROVED,
  ];

  const requests = await prisma.leaveRequest.findMany({
    where: {
      deletedAt: null,
      status: { in: statuses },
    },
    include: {
      periods: { orderBy: { startDate: 'asc' } },
      employee: {
        select: {
          id: true,
          employeeId: true,
          firstName: true,
          lastName: true,
          nationality: true,
          companyId: true,
        },
      },
    },
    orderBy: { requestNumber: 'asc' },
  });

  console.log(
    `Scanning ${requests.length} submitted/pending/approved requests…`,
  );
  const mismatches: Array<Record<string, unknown>> = [];

  const holidaysByCompany = new Map<
    string,
    Array<{ date: Date; isRecurring: boolean; name: string; appliesTo: string }>
  >();

  for (const req of requests) {
    const periodInputs =
      req.periods.length > 0
        ? req.periods.map((p) => ({
            startDate: p.startDate,
            endDate: p.endDate,
            dayPortion: (p.dayPortion ?? 'FULL') as LeaveDayPortion,
          }))
        : req.startDate && req.endDate
          ? [
              {
                startDate: req.startDate,
                endDate: req.endDate,
                dayPortion: 'FULL' as LeaveDayPortion,
              },
            ]
          : [];

    if (periodInputs.length === 0) {
      continue;
    }

    try {
      if (!holidaysByCompany.has(req.companyId)) {
        const rows = await prisma.publicHoliday.findMany({
          where: { companyId: req.companyId, isActive: true },
          select: {
            date: true,
            isRecurring: true,
            name: true,
            appliesToNationality: true,
          },
        });
        holidaysByCompany.set(
          req.companyId,
          rows.map((r) => ({
            date: r.date,
            isRecurring: r.isRecurring,
            name: r.name,
            appliesTo: r.appliesToNationality,
          })),
        );
      }

      const allHolidays = holidaysByCompany.get(req.companyId) ?? [];
      const holidays = allHolidays
        .filter((h) =>
          holidayAppliesToNationality(
            h.appliesTo as never,
            req.employee.nationality,
          ),
        )
        .map((h) => ({
          date: h.date,
          isRecurring: h.isRecurring,
          name: h.name,
        }));

      const rangeStart = periodInputs.reduce(
        (min, p) => (p.startDate < min ? p.startDate : min),
        periodInputs[0].startDate,
      );
      const rangeEnd = periodInputs.reduce(
        (max, p) => (p.endDate > max ? p.endDate : max),
        periodInputs[0].endDate,
      );

      const scheduleByDate = new Map<
        string,
        { isWorkingDay: boolean; isHalfDay: boolean }
      >();

      // Walk each day and resolve schedule assignment
      for (
        let cur = new Date(rangeStart);
        cur.getTime() <= rangeEnd.getTime();
        cur = new Date(cur.getTime() + 86_400_000)
      ) {
        const key = formatDateOnly(cur);
        const assignment = await prisma.employeeScheduleAssignment.findFirst({
          where: {
            companyId: req.companyId,
            employeeId: req.employeeId,
            effectiveFrom: { lte: cur },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: cur } }],
          },
          orderBy: { effectiveFrom: 'desc' },
          include: { schedule: { include: { days: true } } },
        });
        let schedule = assignment?.schedule;
        if (!schedule) {
          schedule =
            (await prisma.workSchedule.findFirst({
              where: {
                companyId: req.companyId,
                isDefault: true,
                isActive: true,
                deletedAt: null,
              },
              include: { days: true },
            })) ?? undefined;
        }
        if (!schedule) {
          const dow = cur.getUTCDay();
          scheduleByDate.set(key, {
            isWorkingDay: dow >= 1 && dow <= 5,
            isHalfDay: false,
          });
        } else {
          const weekday = schedule.days.find((d) => d.dayOfWeek === cur.getUTCDay());
          scheduleByDate.set(key, {
            isWorkingDay: weekday?.isWorkingDay ?? false,
            isHalfDay: weekday?.isHalfDay ?? false,
          });
        }
      }

      const result = calculateLeaveDaysFromPeriods(
        periodInputs,
        (date) => scheduleByDate.get(formatDateOnly(date)) ?? null,
        holidays,
      );

      const stored = Number(req.days ?? 0);
      if (Math.abs(stored - result.days) > 0.05) {
        mismatches.push({
          requestNumber: req.requestNumber,
          status: req.status,
          employee: `${req.employee.firstName} ${req.employee.lastName} (${req.employee.employeeId ?? '-'})`,
          stored,
          recalculated: result.days,
          delta: Math.round((result.days - stored) * 10) / 10,
        });
      }
    } catch (error: unknown) {
      mismatches.push({
        requestNumber: req.requestNumber,
        status: req.status,
        employee: `${req.employee.firstName} ${req.employee.lastName} (${req.employee.employeeId ?? '-'})`,
        stored: Number(req.days ?? 0),
        recalculated: 'ERROR',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(`MISMATCH_COUNT=${mismatches.length}`);
  for (const row of mismatches) {
    console.log(JSON.stringify(row));
  }

  await prisma.$disconnect();
  void holidayFallsOnDate;
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
