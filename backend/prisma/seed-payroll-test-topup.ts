/**
 * Payroll test-data top-up (CCECC PWF local test DB).
 *
 * Adds field-movement cases, real half-day leave, and recalculates attendance
 * for touched + site employees. Idempotent via PAYROLL_TOPUP_v1 markers.
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'; npm run prisma:seed-payroll-test-topup
 */
import 'reflect-metadata';
import 'dotenv/config';
import { join } from 'path';
import { register } from 'tsconfig-paths';
import { randomUUID } from 'crypto';
import {
  AttendanceDayFlag,
  FieldMovementReason,
  FieldMovementStatus,
  LeaveDayPortion,
  LeaveType,
  SiteAssignmentStatus,
} from '@prisma/client';
import { assertPayrollSeedGuards } from './seeds/payroll-test/guards';
import { createSeededRng, pickInt } from './seeds/payroll-test/rng';
import { fullyApprove } from './seeds/payroll-test/approvals';
import { getSeedSuppressedEmailCount } from '../src/shared/mail/resend-email.service';
import {
  getSeedSuppressedNotificationCount,
  resetSeedSuppressedNotificationCount,
} from '../src/modules/notifications/application/services/notification.service';
import { resetSeedSuppressedEmailCount } from '../src/shared/mail/resend-email.service';

register({
  baseUrl: join(__dirname, '..'),
  paths: { '@/*': ['src/*'] },
});

const TOPUP_MARKER = 'PAYROLL_TOPUP_v1';
const SEED_YEAR = 2026;
const RNG_SEED = 20261005;
const MONTH = 8;

type Emp = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
};

type FmCaseKind =
  | 'missing_clock_out+approved_fm'
  | 'early_departure+approved_fm'
  | 'missing_clock_out+no_fm'
  | 'early_departure+no_fm'
  | 'missing_clock_out+pending_fm'
  | 'early_departure+pending_fm';

type FmRow = {
  employee: Emp;
  date: string;
  caseKind: FmCaseKind;
  dayDeduction: number | null;
  paidDaysBefore: number | null;
  paidDaysAfter: number | null;
  expectedDeduction: number;
  expectedPaidDelta: number;
  mismatchReason?: string;
};

type HalfDayRow = {
  label: string;
  employee: Emp;
  date: string;
  portion: LeaveDayPortion;
  scans: string;
  dayDeduction: number | null;
  balanceCharged: number | null;
  paidDaysBefore: number | null;
  paidDaysAfter: number | null;
  mismatchReason?: string;
};

type SiteRow = {
  employee: Emp;
  site: string;
  onSiteAug: number;
  onSiteSep: number;
  paidAugBefore: number | null;
  paidAugAfter: number | null;
  paidSepBefore: number | null;
  paidSepAfter: number | null;
  mismatchReason?: string;
};

function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m - 1, d));
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fullName(e: Emp): string {
  return `${e.firstName} ${e.lastName}`.trim();
}

function isWeekdayMonFri(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow >= 1 && dow <= 5;
}

function isSaturday(d: Date): boolean {
  return d.getUTCDay() === 6;
}

/**
 * Same excluded catalog indices as the primary payroll seed (sorted by id).
 */
function excludedCatalogIds(sorted: Emp[]): Set<string> {
  const ids = new Set<string>();
  for (let i = 5; i <= 28; i += 1) {
    const e = sorted[i];
    if (e) ids.add(e.id);
  }
  return ids;
}

async function main(): Promise<void> {
  const { host, database } = assertPayrollSeedGuards();
  console.log(`[topup] Target database: ${host}/${database}`);
  console.log(`[topup] SEED_MODE=true - notifications/emails suppressed`);

  resetSeedSuppressedNotificationCount();
  resetSeedSuppressedEmailCount();

  const rng = createSeededRng(RNG_SEED + 17);

  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const { PrismaService } = await import('../src/shared/prisma/prisma.service');
  const { LeaveService } = await import(
    '../src/modules/leave/application/services/leave.service'
  );
  const { LeaveBalanceService } = await import(
    '../src/modules/leave/application/services/leave-balance.service'
  );
  const { AttendanceService } = await import(
    '../src/modules/attendance/application/services/attendance.service'
  );
  const { ApprovalsService } = await import(
    '../src/modules/approvals/application/services/approvals.service'
  );

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  const prisma = app.get(PrismaService);
  const leaveService = app.get(LeaveService);
  const leaveBalanceService = app.get(LeaveBalanceService);
  const attendanceService = app.get(AttendanceService);
  const approvalsService = app.get(ApprovalsService);

  const mismatches: string[] = [];

  try {
    const company = await prisma.company.findFirst({ select: { id: true } });
    if (!company) throw new Error('No company found');
    const companyId = company.id;

    const admin = await prisma.user.findFirst({
      where: {
        companyId,
        deletedAt: null,
        email: process.env.SEED_ADMIN_EMAIL ?? 'admin@company.local',
      },
      select: { id: true },
    });
    if (!admin) throw new Error('Admin user not found');
    const actorId = admin.id;

    const employees = (await prisma.user.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        includeInPayroll: true,
      },
      orderBy: { id: 'asc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        employeeId: true,
      },
    })) as Emp[];

    const catalogExclude = excludedCatalogIds(employees);

    const siteAssignments = await prisma.siteAssignment.findMany({
      where: {
        companyId,
        status: SiteAssignmentStatus.APPROVED,
        deletedAt: null,
        startDate: { lte: utcDate(SEED_YEAR, 9, 30) },
        endDate: { gte: utcDate(SEED_YEAR, 8, 1) },
      },
      select: {
        employeeId: true,
        siteName: true,
        startDate: true,
        endDate: true,
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeId: true,
          },
        },
      },
    });
    const siteEmployeeIds = new Set(siteAssignments.map((s) => s.employeeId));

    // ── Idempotent cleanup of prior top-up rows ───────────────────────────
    const priorLeaves = await prisma.leaveRequest.findMany({
      where: {
        companyId,
        deletedAt: null,
        reason: { contains: TOPUP_MARKER },
      },
      select: { id: true },
    });
    for (const leave of priorLeaves) {
      try {
        await leaveService.deleteRequest(leave.id, companyId, actorId);
      } catch (error: unknown) {
        console.warn(
          `[topup] Could not delete prior leave ${leave.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const priorFms = await prisma.fieldMovementLog.findMany({
      where: {
        companyId,
        deletedAt: null,
        notes: { contains: TOPUP_MARKER },
      },
      select: { id: true, status: true, employeeId: true },
    });
    for (const fm of priorFms) {
      if (
        fm.status === FieldMovementStatus.DRAFT ||
        fm.status === FieldMovementStatus.SUBMITTED ||
        fm.status === FieldMovementStatus.IN_REVIEW
      ) {
        try {
          await attendanceService.cancelFieldMovementLog(
            fm.id,
            companyId,
            fm.employeeId,
          );
        } catch {
          // fall through to soft-delete
        }
      }
      await prisma.fieldMovementLog.update({
        where: { id: fm.id },
        data: {
          deletedAt: new Date(),
          deletedBy: actorId,
          status: FieldMovementStatus.CANCELLED,
          updatedBy: actorId,
        },
      });
    }

    // ── Snapshot paid days before mutations ───────────────────────────────
    async function getPaidDays(
      employeeId: string,
      month: number,
    ): Promise<number | null> {
      const row = await prisma.attendanceRecord.findUnique({
        where: {
          companyId_employeeId_month_year: {
            companyId,
            employeeId,
            month,
            year: SEED_YEAR,
          },
        },
        select: { paidDays: true },
      });
      return row ? Number(row.paidDays) : null;
    }

    async function getDayDeduction(
      employeeId: string,
      dateIso: string,
    ): Promise<number | null> {
      const log = await prisma.attendanceDailyLog.findFirst({
        where: {
          date: utcDate(
            Number(dateIso.slice(0, 4)),
            Number(dateIso.slice(5, 7)),
            Number(dateIso.slice(8, 10)),
          ),
          record: {
            companyId,
            employeeId,
            month: Number(dateIso.slice(5, 7)),
            year: SEED_YEAR,
          },
        },
        select: { dayDeduction: true, dayStatus: true },
      });
      return log ? Number(log.dayDeduction) : null;
    }

    async function getDayStatus(
      employeeId: string,
      dateIso: string,
    ): Promise<string | null> {
      const log = await prisma.attendanceDailyLog.findFirst({
        where: {
          date: utcDate(
            Number(dateIso.slice(0, 4)),
            Number(dateIso.slice(5, 7)),
            Number(dateIso.slice(8, 10)),
          ),
          record: {
            companyId,
            employeeId,
            month: Number(dateIso.slice(5, 7)),
            year: SEED_YEAR,
          },
        },
        select: { dayStatus: true },
      });
      return log?.dayStatus ?? null;
    }

    // ── Find candidate days for FM cases ──────────────────────────────────
    type Candidate = {
      employee: Emp;
      dailyLogId: string;
      date: Date;
      dateIso: string;
    };

    const approvedLeaveInAugust = await prisma.leaveRequest.findMany({
      where: {
        companyId,
        status: 'APPROVED',
        deletedAt: null,
        periods: {
          some: {
            startDate: { lte: utcDate(SEED_YEAR, 8, 31) },
            endDate: { gte: utcDate(SEED_YEAR, 8, 1) },
          },
        },
      },
      select: {
        employeeId: true,
        periods: { select: { startDate: true, endDate: true } },
      },
    });
    const leaveDaysByEmployee = new Map<string, Set<string>>();
    for (const leave of approvedLeaveInAugust) {
      let set = leaveDaysByEmployee.get(leave.employeeId);
      if (!set) {
        set = new Set();
        leaveDaysByEmployee.set(leave.employeeId, set);
      }
      for (const period of leave.periods) {
        const cursor = new Date(period.startDate);
        while (cursor.getTime() <= period.endDate.getTime()) {
          set.add(isoDate(cursor));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
      }
    }

    const holidays = await prisma.publicHoliday.findMany({
      where: {
        companyId,
        deletedAt: null,
        isActive: true,
        date: {
          gte: utcDate(SEED_YEAR, 8, 1),
          lte: utcDate(SEED_YEAR, 9, 30),
        },
      },
      select: { date: true },
    });
    const holidayKeys = new Set(holidays.map((h) => isoDate(h.date)));

    const wfhDays = await prisma.workFromHomeDay.findMany({
      where: {
        companyId,
        deletedAt: null,
        date: {
          gte: utcDate(SEED_YEAR, 8, 1),
          lte: utcDate(SEED_YEAR, 9, 30),
        },
      },
      select: { date: true },
    });
    const wfhKeys = new Set(wfhDays.map((w) => isoDate(w.date)));

    const candidates: Candidate[] = [];
    for (const emp of employees) {
      if (catalogExclude.has(emp.id)) continue;
      if (siteEmployeeIds.has(emp.id)) continue;

      const logs = await prisma.attendanceDailyLog.findMany({
        where: {
          record: {
            companyId,
            employeeId: emp.id,
            month: MONTH,
            year: SEED_YEAR,
          },
          clockInLocal: { not: null },
          clockOutLocal: { not: null },
          isHoliday: false,
          isWeekend: false,
        },
        select: {
          id: true,
          date: true,
          clockInLocal: true,
          clockOutLocal: true,
          isLastExportDay: true,
        },
        orderBy: { date: 'asc' },
      });

      const leaveSet = leaveDaysByEmployee.get(emp.id) ?? new Set();
      for (const log of logs) {
        if (!isWeekdayMonFri(log.date)) continue;
        const key = isoDate(log.date);
        if (holidayKeys.has(key) || wfhKeys.has(key) || leaveSet.has(key)) {
          continue;
        }
        if (log.isLastExportDay) continue;
        candidates.push({
          employee: emp,
          dailyLogId: log.id,
          date: log.date,
          dateIso: key,
        });
      }
    }

    // One candidate day per employee, deterministic shuffle
    const byEmployee = new Map<string, Candidate[]>();
    for (const c of candidates) {
      const list = byEmployee.get(c.employee.id) ?? [];
      list.push(c);
      byEmployee.set(c.employee.id, list);
    }
    const onePerEmployee: Candidate[] = [];
    for (const [, list] of [...byEmployee.entries()].sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const idx = pickInt(rng, 0, list.length - 1);
      onePerEmployee.push(list[idx] as Candidate);
    }
    // Deterministic shuffle
    for (let i = onePerEmployee.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = onePerEmployee[i] as Candidate;
      onePerEmployee[i] = onePerEmployee[j] as Candidate;
      onePerEmployee[j] = tmp;
    }

    if (onePerEmployee.length < 24) {
      throw new Error(
        `Need ≥24 eligible employees for FM+half-day; found ${onePerEmployee.length}`,
      );
    }

    const fmPool = onePerEmployee.slice(0, 20);
    const halfDayPool = onePerEmployee.slice(20, 24);

    // Case assignment: 10 approved (7 missing CO, 3 early), 10 no-approved
    // (7 missing CO no FM, of which 3 pending; 3 early of which may be pending)
    // Spec: 10 with approved FM (3 of 10 early), 10 without approved FM
    //       (3 of those 10 get pending FM)
    type PlannedFm = {
      candidate: Candidate;
      defect: 'missing_clock_out' | 'early_departure';
      fm: 'approved' | 'pending' | 'none';
    };
    const planned: PlannedFm[] = [];
    for (let i = 0; i < 10; i += 1) {
      planned.push({
        candidate: fmPool[i] as Candidate,
        defect: i < 3 ? 'early_departure' : 'missing_clock_out',
        fm: 'approved',
      });
    }
    // Remaining 10: no approved FM; first 3 of them get pending FM
    for (let i = 10; i < 20; i += 1) {
      const local = i - 10;
      planned.push({
        candidate: fmPool[i] as Candidate,
        defect: local < 3 ? 'early_departure' : 'missing_clock_out',
        fm: local < 3 ? 'pending' : 'none',
      });
    }

    const paidBeforeFm = new Map<string, number | null>();
    for (const p of planned) {
      const id = p.candidate.employee.id;
      if (!paidBeforeFm.has(id)) {
        paidBeforeFm.set(id, await getPaidDays(id, MONTH));
      }
    }

    const touchedEmployeeIds = new Set<string>();

    async function mutateDailyLog(
      dailyLogId: string,
      defect: 'missing_clock_out' | 'early_departure',
    ): Promise<void> {
      if (defect === 'missing_clock_out') {
        await prisma.attendanceDailyLog.update({
          where: { id: dailyLogId },
          data: {
            clockOutLocal: null,
            clockOutMachine: null,
            correctedClockOutLocal: null,
            correctedClockInLocal: null,
            missingClockOut: true,
            missingClockIn: false,
            isEarlyLeave: false,
            earlyLeaveMinutes: 0,
            flag: AttendanceDayFlag.MISSING_CLOCK_OUT,
            flagResolved: false,
            flagResolvedAt: null,
            fieldMovementEntryId: null,
            wasPresent: true,
          },
        });
      } else {
        await prisma.attendanceDailyLog.update({
          where: { id: dailyLogId },
          data: {
            clockOutLocal: '11:00',
            clockOutMachine: '16:00',
            correctedClockOutLocal: null,
            correctedClockInLocal: null,
            missingClockOut: false,
            missingClockIn: false,
            isEarlyLeave: true,
            earlyLeaveMinutes: 390,
            flag: AttendanceDayFlag.EARLY_LEAVE,
            flagResolved: false,
            flagResolvedAt: null,
            fieldMovementEntryId: null,
            wasPresent: true,
          },
        });
      }
    }

    async function createAndSubmitFm(
      employeeId: string,
      dailyLogId: string,
      defect: 'missing_clock_out' | 'early_departure',
    ): Promise<{ id: string; approvalRequestId: string | null }> {
      const reason =
        defect === 'early_departure'
          ? FieldMovementReason.EARLY_LEAVE
          : FieldMovementReason.FORGOT_CLOCK_OUT;
      const created = (await attendanceService.createFieldMovementLog(
        {
          entries: [
            {
              dailyLogId,
              reason,
              departureTime: defect === 'early_departure' ? '11:00' : undefined,
              returnTime:
                defect === 'missing_clock_out' ? '17:30' : undefined,
              notes: `${TOPUP_MARKER} entry`,
            },
          ],
          notes: `${TOPUP_MARKER} field movement`,
        },
        companyId,
        employeeId,
      )) as { id: string };

      const submitted = (await attendanceService.submitFieldMovementLog(
        created.id,
        companyId,
        employeeId,
      )) as { id: string; approvalRequestId?: string | null };

      const fresh = await prisma.fieldMovementLog.findFirst({
        where: { id: created.id },
        select: { id: true, approvalRequestId: true },
      });

      return {
        id: fresh?.id ?? submitted.id,
        approvalRequestId: fresh?.approvalRequestId ?? null,
      };
    }

    async function getDailyLogMeta(
      dailyLogId: string,
    ): Promise<{ deduction: number; status: string } | null> {
      const log = await prisma.attendanceDailyLog.findFirst({
        where: { id: dailyLogId },
        select: { dayDeduction: true, dayStatus: true },
      });
      if (!log) return null;
      return { deduction: Number(log.dayDeduction), status: log.dayStatus };
    }

    const fmRows: FmRow[] = [];

    for (const plan of planned) {
      const { candidate, defect, fm } = plan;
      const emp = candidate.employee;
      touchedEmployeeIds.add(emp.id);

      let caseKind: FmCaseKind;
      if (fm === 'approved') {
        caseKind =
          defect === 'early_departure'
            ? 'early_departure+approved_fm'
            : 'missing_clock_out+approved_fm';
      } else if (fm === 'pending') {
        caseKind =
          defect === 'early_departure'
            ? 'early_departure+pending_fm'
            : 'missing_clock_out+pending_fm';
      } else {
        caseKind =
          defect === 'early_departure'
            ? 'early_departure+no_fm'
            : 'missing_clock_out+no_fm';
      }

      const expectedDeduction = fm === 'approved' ? 0 : 0.5;
      const priorMeta = await getDailyLogMeta(candidate.dailyLogId);
      const priorDeduction = priorMeta?.deduction ?? 0;
      // Paid days change equals −Δ(day deduction) for this single day.
      const expectedPaidDelta =
        Math.round((priorDeduction - expectedDeduction) * 100) / 100;

      try {
        await mutateDailyLog(candidate.dailyLogId, defect);

        if (fm !== 'none') {
          const submitted = await createAndSubmitFm(
            emp.id,
            candidate.dailyLogId,
            defect,
          );
          if (fm === 'approved') {
            if (submitted.approvalRequestId) {
              await fullyApprove(
                approvalsService,
                prisma,
                submitted.approvalRequestId,
              );
            }
          }
        }
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        fmRows.push({
          employee: emp,
          date: candidate.dateIso,
          caseKind,
          dayDeduction: null,
          paidDaysBefore: paidBeforeFm.get(emp.id) ?? null,
          paidDaysAfter: null,
          expectedDeduction,
          expectedPaidDelta,
          mismatchReason: `Setup failed: ${reason}`,
        });
        mismatches.push(
          `FM ${fullName(emp)} ${candidate.dateIso} ${caseKind}: ${reason}`,
        );
        continue;
      }

      fmRows.push({
        employee: emp,
        date: candidate.dateIso,
        caseKind,
        dayDeduction: null,
        paidDaysBefore: paidBeforeFm.get(emp.id) ?? null,
        paidDaysAfter: null,
        expectedDeduction,
        expectedPaidDelta,
      });
    }

    // ── Half-day leave (4 requests) ───────────────────────────────────────
    type HalfPlan = {
      label: string;
      candidate: Candidate;
      portion: LeaveDayPortion;
      preferSaturday: boolean;
      scanMode: 'afternoon' | 'morning' | 'none';
    };

    // Prefer a Saturday candidate for D from broader pool if needed
    let saturdayCandidate: Candidate | null = null;
    for (const emp of employees) {
      if (catalogExclude.has(emp.id)) continue;
      if (siteEmployeeIds.has(emp.id)) continue;
      if (touchedEmployeeIds.has(emp.id)) continue;
      if (halfDayPool.some((c) => c.employee.id === emp.id)) continue;

      const logs = await prisma.attendanceDailyLog.findMany({
        where: {
          record: {
            companyId,
            employeeId: emp.id,
            month: MONTH,
            year: SEED_YEAR,
          },
        },
        select: { id: true, date: true },
      });
      for (const log of logs) {
        if (!isSaturday(log.date)) continue;
        const key = isoDate(log.date);
        if (holidayKeys.has(key) || wfhKeys.has(key)) continue;
        const leaveSet = leaveDaysByEmployee.get(emp.id) ?? new Set();
        if (leaveSet.has(key)) continue;
        saturdayCandidate = {
          employee: emp,
          dailyLogId: log.id,
          date: log.date,
          dateIso: key,
        };
        break;
      }
      if (saturdayCandidate) break;
    }

    const halfPlans: HalfPlan[] = [
      {
        label: 'A',
        candidate: halfDayPool[0] as Candidate,
        portion: LeaveDayPortion.MORNING,
        preferSaturday: false,
        scanMode: 'afternoon',
      },
      {
        label: 'B',
        candidate: halfDayPool[1] as Candidate,
        portion: LeaveDayPortion.AFTERNOON,
        preferSaturday: false,
        scanMode: 'morning',
      },
      {
        label: 'C',
        candidate: halfDayPool[2] as Candidate,
        portion: LeaveDayPortion.MORNING,
        preferSaturday: false,
        scanMode: 'none',
      },
      {
        label: 'D',
        candidate: saturdayCandidate ?? (halfDayPool[3] as Candidate),
        portion: LeaveDayPortion.AFTERNOON,
        preferSaturday: true,
        scanMode: 'none',
      },
    ];

    const paidBeforeHalf = new Map<string, number | null>();
    for (const plan of halfPlans) {
      touchedEmployeeIds.add(plan.candidate.employee.id);
      paidBeforeHalf.set(
        plan.candidate.employee.id,
        await getPaidDays(plan.candidate.employee.id, MONTH),
      );
    }

    const halfRows: HalfDayRow[] = [];

    for (const plan of halfPlans) {
      const emp = plan.candidate.employee;
      const dateIso = plan.candidate.dateIso;

      // Adjust scans to match scenario
      if (plan.scanMode === 'afternoon') {
        await prisma.attendanceDailyLog.update({
          where: { id: plan.candidate.dailyLogId },
          data: {
            clockInLocal: '13:30',
            clockInMachine: '18:30',
            clockOutLocal: '17:30',
            clockOutMachine: '22:30',
            correctedClockInLocal: null,
            correctedClockOutLocal: null,
            missingClockIn: false,
            missingClockOut: false,
            isEarlyLeave: false,
            flag: AttendanceDayFlag.NONE,
            flagResolved: false,
            fieldMovementEntryId: null,
            wasPresent: true,
          },
        });
      } else if (plan.scanMode === 'morning') {
        await prisma.attendanceDailyLog.update({
          where: { id: plan.candidate.dailyLogId },
          data: {
            clockInLocal: '08:30',
            clockInMachine: '13:30',
            clockOutLocal: '12:30',
            clockOutMachine: '17:30',
            correctedClockInLocal: null,
            correctedClockOutLocal: null,
            missingClockIn: false,
            missingClockOut: false,
            isEarlyLeave: false,
            flag: AttendanceDayFlag.NONE,
            flagResolved: false,
            fieldMovementEntryId: null,
            wasPresent: true,
          },
        });
      } else {
        await prisma.attendanceDailyLog.update({
          where: { id: plan.candidate.dailyLogId },
          data: {
            clockInLocal: null,
            clockInMachine: null,
            clockOutLocal: null,
            clockOutMachine: null,
            correctedClockInLocal: null,
            correctedClockOutLocal: null,
            missingClockIn: false,
            missingClockOut: false,
            isEarlyLeave: false,
            flag: AttendanceDayFlag.NONE,
            flagResolved: false,
            fieldMovementEntryId: null,
            wasPresent: false,
          },
        });
      }

      const balancesBefore = (await leaveBalanceService.getBalance(
        emp.id,
        SEED_YEAR,
        companyId,
      )) as Array<{ leaveType: string; used: number; remaining: number }>;
      const annualBefore = balancesBefore.find((b) => b.leaveType === 'ANNUAL');
      const usedBefore = annualBefore?.used ?? 0;

      let balanceCharged: number | null = null;
      let mismatchReason: string | undefined;
      let scansDesc =
        plan.scanMode === 'afternoon'
          ? 'in 13:30 / out 17:30'
          : plan.scanMode === 'morning'
            ? 'in 08:30 / out 12:30'
            : 'no scans';

      try {
        const created = (await leaveService.submitOnBehalf(
          emp.id,
          {
            leaveType: LeaveType.ANNUAL,
            periods: [
              {
                startDate: dateIso,
                endDate: dateIso,
                dayPortion: plan.portion,
              },
            ],
            reason: `${TOPUP_MARKER} half-day ${plan.label} ${plan.portion}`,
          },
          companyId,
          actorId,
        )) as {
          id: string;
          approvalRequestId?: string | null;
          days?: number;
          status?: string;
        };

        if (created.approvalRequestId) {
          await fullyApprove(
            approvalsService,
            prisma,
            created.approvalRequestId,
          );
        }

        const detail = await prisma.leaveRequest.findFirst({
          where: { id: created.id },
          select: { days: true, status: true },
        });
        balanceCharged = detail ? Number(detail.days) : null;

        const balancesAfter = (await leaveBalanceService.getBalance(
          emp.id,
          SEED_YEAR,
          companyId,
        )) as Array<{ leaveType: string; used: number }>;
        const annualAfter = balancesAfter.find((b) => b.leaveType === 'ANNUAL');
        const usedDelta = (annualAfter?.used ?? 0) - usedBefore;
        if (balanceCharged == null) {
          balanceCharged = usedDelta;
        }

        if (Math.abs((balanceCharged ?? 0) - 0.5) > 0.01) {
          mismatchReason = `Expected balance charge 0.5, got ${balanceCharged}`;
        }
      } catch (error: unknown) {
        const reason = error instanceof Error ? error.message : String(error);
        mismatchReason = `Leave create/approve failed: ${reason}`;
        mismatches.push(
          `Half-day ${plan.label} ${fullName(emp)} ${dateIso}: ${reason}`,
        );
      }

      halfRows.push({
        label: plan.label,
        employee: emp,
        date: dateIso,
        portion: plan.portion,
        scans: scansDesc,
        dayDeduction: null,
        balanceCharged,
        paidDaysBefore: paidBeforeHalf.get(emp.id) ?? null,
        paidDaysAfter: null,
        mismatchReason,
      });
    }

    // ── Site paid-days before ─────────────────────────────────────────────
    const siteEmployees = new Map<string, { emp: Emp; site: string }>();
    for (const sa of siteAssignments) {
      if (!siteEmployees.has(sa.employeeId)) {
        siteEmployees.set(sa.employeeId, {
          emp: sa.employee as Emp,
          site: sa.siteName,
        });
      }
    }
    const sitePaidBefore = new Map<
      string,
      { aug: number | null; sep: number | null }
    >();
    for (const [id] of siteEmployees) {
      touchedEmployeeIds.add(id);
      sitePaidBefore.set(id, {
        aug: await getPaidDays(id, 8),
        sep: await getPaidDays(id, 9),
      });
    }

    // ── Materialise empty daily logs for approved site days ───────────────
    // Primary seed skipped scans on site days, so August/early-Sep often have
    // zero daily-log rows. dayDeduction only stamps ON_SITE onto existing rows.
    async function ensureSiteDailyLogs(
      employeeId: string,
      month: number,
      year: number,
      ranges: Array<{ startDate: Date; endDate: Date; siteName: string }>,
    ): Promise<number> {
      const record = await prisma.attendanceRecord.findUnique({
        where: {
          companyId_employeeId_month_year: {
            companyId,
            employeeId,
            month,
            year,
          },
        },
        select: { id: true },
      });
      if (!record) return 0;

      const existing = await prisma.attendanceDailyLog.findMany({
        where: { attendanceRecordId: record.id },
        select: { date: true },
      });
      const existingKeys = new Set(existing.map((e) => isoDate(e.date)));

      const daysInM = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const toCreate: Array<{
        id: string;
        attendanceRecordId: string;
        date: Date;
        isHoliday: boolean;
        isWeekend: boolean;
        isHalfDay: boolean;
        wasPresent: boolean;
        scheduledHours: number;
        flag: AttendanceDayFlag;
        dayStatus: 'ABSENT';
        dayDeduction: number;
      }> = [];

      for (let day = 1; day <= daysInM; day += 1) {
        const date = utcDate(year, month, day);
        const key = isoDate(date);
        if (existingKeys.has(key)) continue;
        const covered = ranges.some(
          (r) => date.getTime() >= r.startDate.getTime() && date.getTime() <= r.endDate.getTime(),
        );
        if (!covered) continue;

        const dow = date.getUTCDay();
        const isSunday = dow === 0;
        const isSat = dow === 6;
        toCreate.push({
          id: randomUUID(),
          attendanceRecordId: record.id,
          date,
          isHoliday: holidayKeys.has(key),
          isWeekend: isSunday,
          isHalfDay: isSat && !isSunday,
          wasPresent: false,
          scheduledHours: isSunday || holidayKeys.has(key) ? 0 : isSat ? 4 : 8,
          flag: AttendanceDayFlag.NONE,
          dayStatus: 'ABSENT',
          dayDeduction: 0,
        });
      }

      if (toCreate.length > 0) {
        await prisma.attendanceDailyLog.createMany({ data: toCreate });
      }
      return toCreate.length;
    }

    let siteLogsCreated = 0;
    for (const [id] of siteEmployees) {
      const ranges = siteAssignments
        .filter((s) => s.employeeId === id)
        .map((s) => ({
          startDate: s.startDate,
          endDate: s.endDate,
          siteName: s.siteName,
        }));
      siteLogsCreated += await ensureSiteDailyLogs(id, 8, SEED_YEAR, ranges);
      siteLogsCreated += await ensureSiteDailyLogs(id, 9, SEED_YEAR, ranges);
    }
    console.log(`[topup] Created ${siteLogsCreated} missing site daily logs`);

    // ── Recalculate August + September for all touched + site ─────────────
    const recalcIds = [...touchedEmployeeIds];
    for (const employeeId of recalcIds) {
      await attendanceService.recalculateCompanyAttendanceMonth(
        companyId,
        8,
        SEED_YEAR,
        employeeId,
      );
      await attendanceService.recalculateCompanyAttendanceMonth(
        companyId,
        9,
        SEED_YEAR,
        employeeId,
      );
    }

    // ── Fill after metrics + validate ─────────────────────────────────────
    for (const row of fmRows) {
      if (row.mismatchReason) continue;
      row.dayDeduction = await getDayDeduction(row.employee.id, row.date);
      row.paidDaysAfter = await getPaidDays(row.employee.id, MONTH);
      const paidDelta =
        row.paidDaysBefore != null && row.paidDaysAfter != null
          ? Math.round((row.paidDaysAfter - row.paidDaysBefore) * 100) / 100
          : null;

      if (
        row.dayDeduction == null ||
        Math.abs(row.dayDeduction - row.expectedDeduction) > 0.01
      ) {
        row.mismatchReason = `Expected deduction ${row.expectedDeduction}, got ${row.dayDeduction}`;
        mismatches.push(
          `FM ${fullName(row.employee)} ${row.date}: ${row.mismatchReason}`,
        );
      } else if (
        paidDelta != null &&
        Math.abs(paidDelta - row.expectedPaidDelta) > 0.01
      ) {
        row.mismatchReason = `Expected paid Δ${row.expectedPaidDelta}, got Δ${paidDelta}`;
        mismatches.push(
          `FM ${fullName(row.employee)} ${row.date}: ${row.mismatchReason}`,
        );
      }
    }

    for (const row of halfRows) {
      row.dayDeduction = await getDayDeduction(row.employee.id, row.date);
      row.paidDaysAfter = await getPaidDays(row.employee.id, MONTH);
      if (!row.mismatchReason) {
        if (row.dayDeduction == null || Math.abs(row.dayDeduction) > 0.01) {
          row.mismatchReason = `Expected deduction 0, got ${row.dayDeduction}`;
          mismatches.push(
            `Half-day ${row.label} ${fullName(row.employee)}: ${row.mismatchReason}`,
          );
        }
        if (
          row.balanceCharged == null ||
          Math.abs(row.balanceCharged - 0.5) > 0.01
        ) {
          row.mismatchReason = [
            row.mismatchReason,
            `Expected balance charge 0.5, got ${row.balanceCharged}`,
          ]
            .filter(Boolean)
            .join('; ');
          mismatches.push(
            `Half-day ${row.label} ${fullName(row.employee)}: balance ${row.balanceCharged}`,
          );
        }
      }
    }

    const siteRows: SiteRow[] = [];
    for (const [id, info] of siteEmployees) {
      const before = sitePaidBefore.get(id);
      const onSiteAug = await prisma.attendanceDailyLog.count({
        where: {
          dayStatus: 'ON_SITE',
          record: {
            companyId,
            employeeId: id,
            month: 8,
            year: SEED_YEAR,
          },
        },
      });
      const onSiteSep = await prisma.attendanceDailyLog.count({
        where: {
          dayStatus: 'ON_SITE',
          record: {
            companyId,
            employeeId: id,
            month: 9,
            year: SEED_YEAR,
          },
        },
      });

      // Verify no site day has non-zero deduction
      const badSiteDays = await prisma.attendanceDailyLog.findMany({
        where: {
          dayStatus: 'ON_SITE',
          dayDeduction: { not: 0 },
          record: {
            companyId,
            employeeId: id,
            month: { in: [8, 9] },
            year: SEED_YEAR,
          },
        },
        select: { date: true, dayDeduction: true },
        take: 5,
      });

      // Days that should be ON_SITE but aren't (approved site, no clocks)
      const saRanges = siteAssignments.filter((s) => s.employeeId === id);
      let missingOnSite = 0;
      for (const sa of saRanges) {
        const logs = await prisma.attendanceDailyLog.findMany({
          where: {
            record: {
              companyId,
              employeeId: id,
              year: SEED_YEAR,
              month: { in: [8, 9] },
            },
            date: { gte: sa.startDate, lte: sa.endDate },
            clockInLocal: null,
            clockOutLocal: null,
            isHoliday: false,
          },
          select: { date: true, dayStatus: true, dayDeduction: true },
        });
        for (const log of logs) {
          if (log.date.getUTCDay() === 0) continue;
          const key = isoDate(log.date);
          if (holidayKeys.has(key) || wfhKeys.has(key)) continue;
          // dayDeduction prefers WFH/holiday over ON_SITE
          if (log.dayStatus === 'WORK_FROM_HOME' || log.dayStatus === 'HOLIDAY') {
            continue;
          }
          if (log.dayStatus !== 'ON_SITE' || Number(log.dayDeduction) !== 0) {
            missingOnSite += 1;
          }
        }
      }

      // Hawassa has no August assignment - Aug ON_SITE=0 is expected
      const hasAugSite = saRanges.some(
        (r) =>
          r.startDate.getTime() <= utcDate(SEED_YEAR, 8, 31).getTime() &&
          r.endDate.getTime() >= utcDate(SEED_YEAR, 8, 1).getTime(),
      );
      const hasSepSite = saRanges.some(
        (r) =>
          r.startDate.getTime() <= utcDate(SEED_YEAR, 9, 30).getTime() &&
          r.endDate.getTime() >= utcDate(SEED_YEAR, 9, 1).getTime(),
      );

      let mismatchReason: string | undefined;
      if (hasAugSite && onSiteAug === 0 && hasSepSite && onSiteSep === 0) {
        mismatchReason = 'No ON_SITE daily logs after recalculation';
      } else if (hasAugSite && onSiteAug === 0) {
        mismatchReason = 'Expected ON_SITE days in August after recalculation';
      } else if (hasSepSite && onSiteSep === 0) {
        mismatchReason = 'Expected ON_SITE days in September after recalculation';
      } else if (badSiteDays.length > 0) {
        mismatchReason = `ON_SITE days with non-zero deduction: ${badSiteDays
          .map((d) => `${isoDate(d.date)}=${d.dayDeduction}`)
          .join(', ')}`;
      } else if (missingOnSite > 0) {
        mismatchReason = `${missingOnSite} site day(s) without ON_SITE/deduction 0`;
      }
      if (mismatchReason) {
        mismatches.push(`Site ${fullName(info.emp)}: ${mismatchReason}`);
      }

      siteRows.push({
        employee: info.emp,
        site: info.site,
        onSiteAug,
        onSiteSep,
        paidAugBefore: before?.aug ?? null,
        paidAugAfter: await getPaidDays(id, 8),
        paidSepBefore: before?.sep ?? null,
        paidSepAfter: await getPaidDays(id, 9),
        mismatchReason,
      });
    }

    // ── Report ────────────────────────────────────────────────────────────
    console.log('\n========== PAYROLL TOP-UP REPORT ==========\n');

    console.log('Table 1 - Field movement');
    console.log(
      'employee | date | case | deduction | paid_before | paid_after',
    );
    for (const row of fmRows) {
      const flag = row.mismatchReason ? ' ❌' : ' ✓';
      console.log(
        `${fullName(row.employee)} (${row.employee.id}) | ${row.date} | ${row.caseKind} | ${row.dayDeduction} | ${row.paidDaysBefore} | ${row.paidDaysAfter}${flag}`,
      );
      if (row.mismatchReason) {
        console.log(`   → ${row.mismatchReason}`);
      }
    }

    console.log('\nTable 2 - Half-day leave');
    console.log(
      'label | employee | date | portion | scans | deduction | balance_charged | paid_before | paid_after',
    );
    for (const row of halfRows) {
      const flag = row.mismatchReason ? ' ❌' : ' ✓';
      console.log(
        `${row.label} | ${fullName(row.employee)} (${row.employee.id}) | ${row.date} | ${row.portion} | ${row.scans} | ${row.dayDeduction} | ${row.balanceCharged} | ${row.paidDaysBefore} | ${row.paidDaysAfter}${flag}`,
      );
      if (row.mismatchReason) {
        console.log(`   → ${row.mismatchReason}`);
      }
    }

    console.log('\nTable 3 - Site employees');
    console.log(
      'employee | site | ON_SITE Aug | ON_SITE Sep | paid Aug before/after | paid Sep before/after',
    );
    for (const row of siteRows) {
      const flag = row.mismatchReason ? ' ❌' : ' ✓';
      console.log(
        `${fullName(row.employee)} (${row.employee.id}) | ${row.site} | ${row.onSiteAug} | ${row.onSiteSep} | ${row.paidAugBefore}→${row.paidAugAfter} | ${row.paidSepBefore}→${row.paidSepAfter}${flag}`,
      );
      if (row.mismatchReason) {
        console.log(`   → ${row.mismatchReason}`);
      }
    }

    console.log('\n── Mismatches (expected vs actual) ──');
    if (mismatches.length === 0) {
      console.log('(none)');
    } else {
      for (const m of mismatches) console.log(`- ${m}`);
    }

    console.log(
      `\nSuppressed notifications: ${getSeedSuppressedNotificationCount()}`,
    );
    console.log(`Suppressed emails: ${getSeedSuppressedEmailCount()}`);
    console.log('\n===========================================\n');
  } finally {
    await app.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
