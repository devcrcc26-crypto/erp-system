/**
 * Correct already-seeded paper leave requests (local or prod via DATABASE_URL).
 *
 *   npx ts-node --transpile-only prisma/seeds/_correct-paper-leaves.ts
 */
import { randomUUID } from 'crypto';
import {
  LeaveDayPortion,
  LeaveType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  getBalanceLeaveType,
  leaveTypeAffectsBalance,
} from '../../src/modules/leave-policy/application/utils/leave-entitlement.util';

const prisma = new PrismaClient();
const COMPANY_ID = '00000000-0000-4000-8000-000000000001';

type PeriodInput = {
  startDate: string;
  endDate: string;
  days: number;
  dayPortion: LeaveDayPortion;
};

type Correction = {
  requestNumber: string;
  employeeNo: string;
  leaveType: LeaveType;
  periods: PeriodInput[];
  note: string;
};

const CORRECTIONS: Correction[] = [
  {
    requestNumber: 'LR-0026',
    employeeNo: 'CC-0043',
    leaveType: LeaveType.ANNUAL,
    periods: [
      {
        startDate: '2026-11-11',
        endDate: '2026-11-11',
        days: 0.5,
        dayPortion: LeaveDayPortion.MORNING,
      },
    ],
    note: 'Half-day (morning) on 11 Nov',
  },
  {
    requestNumber: 'LR-0028',
    employeeNo: 'CC-0043',
    leaveType: LeaveType.ANNUAL,
    periods: [
      {
        startDate: '2026-11-19',
        endDate: '2026-11-19',
        days: 0.5,
        dayPortion: LeaveDayPortion.MORNING,
      },
    ],
    note: 'Half-day (morning) on 19 Nov',
  },
  {
    requestNumber: 'LR-0024',
    employeeNo: 'CC-0129',
    leaveType: LeaveType.SICK,
    periods: [
      {
        startDate: '2026-11-05',
        endDate: '2026-11-05',
        days: 0.5,
        dayPortion: LeaveDayPortion.MORNING,
      },
    ],
    note: 'Half-day (morning) on 5 Nov',
  },
  {
    requestNumber: 'LR-0022',
    employeeNo: 'CC-0072',
    leaveType: LeaveType.ANNUAL,
    periods: [
      {
        startDate: '2026-11-16',
        endDate: '2026-11-26',
        days: 10,
        dayPortion: LeaveDayPortion.FULL,
      },
      {
        startDate: '2026-11-27',
        endDate: '2026-11-27',
        days: 0.5,
        dayPortion: LeaveDayPortion.MORNING,
      },
    ],
    note: 'Extend end to 27 Nov as half day (total 10.5)',
  },
  {
    requestNumber: 'LR-0020',
    employeeNo: 'CC-0068',
    leaveType: LeaveType.UNPAID,
    periods: [
      {
        startDate: '2026-11-20',
        endDate: '2026-11-20',
        days: 1,
        dayPortion: LeaveDayPortion.FULL,
      },
      {
        startDate: '2026-11-23',
        endDate: '2026-11-23',
        days: 1,
        dayPortion: LeaveDayPortion.FULL,
      },
    ],
    note: 'Two separate days (20 & 23), total 2',
  },
  {
    requestNumber: 'LR-0015',
    employeeNo: 'CC-0055',
    leaveType: LeaveType.ANNUAL,
    periods: [
      {
        startDate: '2026-11-10',
        endDate: '2026-11-10',
        days: 0.5,
        dayPortion: LeaveDayPortion.MORNING,
      },
    ],
    note: 'Half-day (morning) on 10 Nov',
  },
  {
    requestNumber: 'LR-0013',
    employeeNo: 'CC-0055',
    leaveType: LeaveType.ANNUAL,
    periods: [
      {
        startDate: '2026-11-18',
        endDate: '2026-11-18',
        days: 0.5,
        dayPortion: LeaveDayPortion.MORNING,
      },
    ],
    note: 'Half-day (morning) on 18 Nov',
  },
];

function parseDateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function envelope(periods: PeriodInput[]): {
  startDate: string;
  endDate: string;
  days: number;
} {
  const starts = periods.map((p) => p.startDate).sort();
  const ends = periods.map((p) => p.endDate).sort();
  const days = periods.reduce((sum, p) => sum + p.days, 0);
  return {
    startDate: starts[0]!,
    endDate: ends[ends.length - 1]!,
    days,
  };
}

async function adjustUsedBalance(input: {
  companyId: string;
  employeeId: string;
  leaveType: LeaveType;
  leaveRequestId: string;
  requestNumber: string;
  oldDays: number;
  newDays: number;
}): Promise<void> {
  if (!leaveTypeAffectsBalance(input.leaveType)) {
    return;
  }
  const delta = input.newDays - input.oldDays;
  if (Math.abs(delta) < 0.001) {
    return;
  }
  const balanceType = getBalanceLeaveType(input.leaveType);
  const entry = await prisma.leaveBalanceEntry.findFirst({
    where: {
      companyId: input.companyId,
      sourceLeaveRequestId: input.leaveRequestId,
      kind: 'USED',
    },
    select: { id: true, leaveYearStart: true },
  });
  if (!entry) {
    console.warn(
      `  warn  ${input.requestNumber}: no USED ledger entry — skip balance adjust`,
    );
    return;
  }

  const year = entry.leaveYearStart.getUTCFullYear();
  await prisma.leaveBalanceEntry.update({
    where: { id: entry.id },
    data: {
      days: new Prisma.Decimal(-input.newDays),
      reason: `Leave ${input.requestNumber} approved (paper import) — corrected`,
    },
  });

  await prisma.leaveBalance.updateMany({
    where: {
      companyId: input.companyId,
      employeeId: input.employeeId,
      year,
      leaveType: balanceType,
    },
    data: {
      used: { increment: delta },
    },
  });
}

async function applyCorrection(correction: Correction): Promise<void> {
  const employee = await prisma.user.findFirst({
    where: {
      companyId: COMPANY_ID,
      employeeId: correction.employeeNo,
      deletedAt: null,
    },
    select: { id: true, employeeId: true },
  });
  if (!employee) {
    throw new Error(`Employee ${correction.employeeNo} not found`);
  }

  // Prefer employee+dates when LR numbers differ between local and prod.
  const env = envelope(correction.periods);
  const leave =
    (await prisma.leaveRequest.findFirst({
      where: {
        companyId: COMPANY_ID,
        requestNumber: correction.requestNumber,
        employeeId: employee.id,
        deletedAt: null,
      },
      select: {
        id: true,
        requestNumber: true,
        leaveType: true,
        days: true,
        approvalRequestId: true,
      },
    })) ??
    (await prisma.leaveRequest.findFirst({
      where: {
        companyId: COMPANY_ID,
        employeeId: employee.id,
        leaveType: correction.leaveType,
        startDate: parseDateOnly(correction.periods[0]!.startDate),
        deletedAt: null,
      },
      select: {
        id: true,
        requestNumber: true,
        leaveType: true,
        days: true,
        approvalRequestId: true,
      },
    }));

  if (!leave) {
    throw new Error(
      `${correction.requestNumber} / ${correction.employeeNo} ${env.startDate} not found`,
    );
  }

  const typeOk =
    leave.leaveType === correction.leaveType ||
    (correction.employeeNo === 'CC-0072' &&
      env.startDate === '2026-11-16' &&
      (leave.leaveType === LeaveType.ANNUAL ||
        leave.leaveType === LeaveType.COMPASSIONATE));
  if (!typeOk) {
    throw new Error(
      `${leave.requestNumber}: expected ${correction.leaveType}, found ${leave.leaveType}`,
    );
  }

  const oldDays = Number(leave.days ?? 0);

  await prisma.$transaction(
    async (tx) => {
      await tx.leaveRequestPeriod.deleteMany({
        where: { leaveRequestId: leave.id },
      });
      await tx.leaveRequestPeriod.createMany({
        data: correction.periods.map((period) => ({
          id: randomUUID(),
          leaveRequestId: leave.id,
          startDate: parseDateOnly(period.startDate),
          endDate: parseDateOnly(period.endDate),
          days: new Prisma.Decimal(period.days),
          dayPortion: period.dayPortion,
        })),
      });

      await tx.leaveRequest.update({
        where: { id: leave.id },
        data: {
          startDate: parseDateOnly(env.startDate),
          endDate: parseDateOnly(env.endDate),
          days: new Prisma.Decimal(env.days),
          updatedAt: new Date(),
        },
      });

      if (leave.approvalRequestId) {
        const approval = await tx.approvalRequest.findFirst({
          where: { id: leave.approvalRequestId, companyId: COMPANY_ID },
          select: { id: true, formData: true },
        });
        if (approval) {
          const formData =
            approval.formData && typeof approval.formData === 'object'
              ? { ...(approval.formData as Record<string, unknown>) }
              : {};
          formData.startDate = env.startDate;
          formData.endDate = env.endDate;
          formData.days = env.days;
          formData.periods = correction.periods.map((p) => ({
            startDate: p.startDate,
            endDate: p.endDate,
            days: p.days,
            dayPortion: p.dayPortion,
          }));
          await tx.approvalRequest.update({
            where: { id: approval.id },
            data: {
              formData,
              title: `${leave.leaveType} leave (paper) — ${env.startDate} to ${env.endDate}`,
              updatedAt: new Date(),
            },
          });
        }
      }
    },
    { maxWait: 20_000, timeout: 60_000 },
  );

  await adjustUsedBalance({
    companyId: COMPANY_ID,
    employeeId: employee.id,
    leaveType: leave.leaveType,
    leaveRequestId: leave.id,
    requestNumber: leave.requestNumber,
    oldDays,
    newDays: env.days,
  });

  console.log(
    `  ok  ${leave.requestNumber} ${correction.employeeNo} ${oldDays}d → ${env.days}d | ${correction.note}`,
  );
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  const target = url.includes('localhost') || url.includes('127.0.0.1')
    ? 'LOCAL'
    : 'REMOTE';
  console.log(`Correcting paper leave requests on ${target}…`);
  const errors: string[] = [];
  for (const correction of CORRECTIONS) {
    try {
      await applyCorrection(correction);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${correction.requestNumber}: ${message}`);
      console.error(`  error ${correction.requestNumber}: ${message}`);
    }
  }
  console.log('—');
  console.log(
    `Done: ${CORRECTIONS.length - errors.length} updated, ${errors.length} failed`,
  );
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
