import type { Prisma, PrismaClient } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/** Payroll run statuses where attendance must not be rewritten in place. */
export const PAYROLL_LOCKED_RUN_STATUSES = [
  'APPROVED',
  'GM_APPROVED',
  'PAID',
] as const;

/**
 * Returns true when the company payroll run for the period is approved or paid.
 */
export async function isPayrollMonthLocked(
  db: Db,
  companyId: string,
  month: number,
  year: number,
): Promise<boolean> {
  const run = await db.payrollRun.findFirst({
    where: {
      companyId,
      month,
      year,
      deletedAt: null,
      status: { in: [...PAYROLL_LOCKED_RUN_STATUSES] },
    },
    select: { id: true },
  });
  return run != null;
}

/**
 * Marks every existing payroll run for the month as attendance-stale
 * (DRAFT / SUBMITTED / APPROVED / …). Cleared when the run is regenerated.
 */
export async function markPayrollAttendanceSnapshotStale(
  db: Db,
  companyId: string,
  month: number,
  year: number,
): Promise<void> {
  await db.payrollRun.updateMany({
    where: {
      companyId,
      month,
      year,
      deletedAt: null,
    },
    data: {
      attendanceSnapshotStale: true,
    } as Prisma.PayrollRunUpdateManyMutationInput,
  });
}

/**
 * Clears the attendance-stale flag after payroll regenerate/recalculate.
 */
export async function clearPayrollAttendanceSnapshotStale(
  db: Db,
  runId: string,
): Promise<void> {
  await db.payrollRun.updateMany({
    where: { id: runId, deletedAt: null },
    data: {
      attendanceSnapshotStale: false,
    } as Prisma.PayrollRunUpdateManyMutationInput,
  });
}

/**
 * Marks the monthly attendance approval so HR sees that schedule approvals
 * could not update figures while the month was locked as APPROVED.
 */
export async function markAttendanceMonthRecalcStale(
  db: Db,
  companyId: string,
  month: number,
  year: number,
): Promise<void> {
  await db.attendanceMonthlyApproval.updateMany({
    where: { companyId, month, year, status: 'APPROVED' },
    data: {
      attendanceRecalcStale: true,
    } as Prisma.AttendanceMonthlyApprovalUpdateManyMutationInput,
  });
}

/**
 * Clears the attendance-month recalc-stale flag (e.g. after unlock + recalc).
 */
export async function clearAttendanceMonthRecalcStale(
  db: Db,
  companyId: string,
  month: number,
  year: number,
): Promise<void> {
  await db.attendanceMonthlyApproval.updateMany({
    where: { companyId, month, year },
    data: {
      attendanceRecalcStale: false,
    } as Prisma.AttendanceMonthlyApprovalUpdateManyMutationInput,
  });
}

/**
 * True when the attendance month is locked as APPROVED.
 */
export async function isAttendanceMonthApproved(
  db: Db,
  companyId: string,
  month: number,
  year: number,
): Promise<boolean> {
  const approval = await db.attendanceMonthlyApproval.findFirst({
    where: { companyId, month, year, status: 'APPROVED' },
    select: { id: true },
  });
  return approval != null;
}
