/**
 * Seeds leave requests that were already approved on paper (outside the system).
 *
 * Inserts LeaveRequest + ApprovalRequest/ApprovalTier as APPROVED and posts
 * USED ledger entries + LeaveBalance.used increments via Prisma only — no
 * workflow, notifications, or Nest leave services.
 *
 * Fill PAPER_APPROVED_LEAVES below, then run:
 *   npx ts-node --transpile-only prisma/seeds/approved-leaves-nov-2026.ts
 *
 * Prerequisites: apply migration add_leave_request_source
 *   npx prisma migrate deploy
 *   (or npx prisma migrate dev)
 */
import { randomUUID } from 'crypto';
import {
  ApprovalRequestStatus,
  ApprovalTierDecision,
  LeaveBalanceEntryKind,
  LeaveDayPortion,
  LeaveRequestStatus,
  LeaveType,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import {
  getBalanceLeaveType,
  leaveTypeAffectsBalance,
} from '../../src/modules/leave-policy/application/utils/leave-entitlement.util';
import {
  buildLeaveCalendar,
  leaveYearFor,
  parseDateOnlyKey,
  toDateOnlyUtc,
} from '../../src/modules/leave-policy/application/utils/leave-year.util';

const prisma = new PrismaClient();

/** Marker stored on LeaveRequest.source for paper-backed imports. */
const PAPER_IMPORT_SOURCE = 'PAPER_IMPORT';

interface PaperApprovedLeaveSeed {
  /** User UUID (LeaveRequest.employeeId). Prefer this when known. */
  employeeId?: string;
  /** Badge / HR employee number (User.employeeId). Used when employeeId is omitted. */
  employeeNo?: string;
  leaveType: LeaveType;
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
  days: number;
  /** Approver user UUIDs in tier order (1..n). */
  approverIds: string[];
  /** YYYY-MM-DD — submittedAt / completedAt / tier decidedAt. */
  approvalDate: string;
  /** Optional free-text reason (defaults to a paper-import note). */
  reason?: string;
}

/**
 * Fill this array with the paper forms. Leave empty until you have the data —
 * running with an empty list is a no-op that prints 0 inserted / 0 skipped.
 */
const PAPER_APPROVED_LEAVES: PaperApprovedLeaveSeed[] = [
  const PAPER_APPROVED_LEAVES = [
    { employeeNo: 'CC-0010', leaveType: 'ANNUAL',  startDate: '2026-11-03', endDate: '2026-11-05', days: 3,   approvalDate: '2026-11-02' },
    { employeeNo: 'CC-0010', leaveType: 'ANNUAL',  startDate: '2026-11-11', endDate: '2026-11-11', days: 1,   approvalDate: '2026-11-11' },
    { employeeNo: 'CC-0022', leaveType: 'ANNUAL',  startDate: '2026-11-24', endDate: '2026-11-26', days: 3,   approvalDate: '2026-11-23' },
    { employeeNo: 'CC-0042', leaveType: 'ANNUAL',  startDate: '2026-11-21', endDate: '2026-11-21', days: 0.5, approvalDate: '2026-11-20' },
    { employeeNo: 'CC-0043', leaveType: 'ANNUAL',  startDate: '2026-11-03', endDate: '2026-11-06', days: 4,   approvalDate: '2026-11-02' },
    { employeeNo: 'CC-0044', leaveType: 'ANNUAL',  startDate: '2026-11-25', endDate: '2026-11-25', days: 1,   approvalDate: '2026-11-24' },
    { employeeNo: 'CC-0044', leaveType: 'ANNUAL',  startDate: '2026-11-07', endDate: '2026-11-07', days: 0.5, approvalDate: '2026-11-06' },
    { employeeNo: 'CC-0044', leaveType: 'ANNUAL',  startDate: '2026-11-14', endDate: '2026-11-14', days: 0.5, approvalDate: '2026-11-13' },
    { employeeNo: 'CC-0048', leaveType: 'ANNUAL',  startDate: '2026-11-25', endDate: '2026-11-25', days: 1,   approvalDate: '2026-11-26' },
    { employeeNo: 'CC-0048', leaveType: 'SICK',    startDate: '2026-11-05', endDate: '2026-11-05', days: 1,   approvalDate: '2026-11-06' },
    { employeeNo: 'CC-0055', leaveType: 'ANNUAL',  startDate: '2026-11-18', endDate: '2026-11-18', days: 0.5, approvalDate: '2026-11-17' },
    { employeeNo: 'CC-0055', leaveType: 'ANNUAL',  startDate: '2026-11-04', endDate: '2026-11-04', days: 1,   approvalDate: '2026-11-04' },
    { employeeNo: 'CC-0055', leaveType: 'ANNUAL',  startDate: '2026-11-10', endDate: '2026-11-10', days: 0.5, approvalDate: '2026-11-10' },
    { employeeNo: 'CC-0056', leaveType: 'ANNUAL',  startDate: '2026-11-21', endDate: '2026-11-21', days: 0.5, approvalDate: '2026-11-20' },
    { employeeNo: 'CC-0059', leaveType: 'SICK',    startDate: '2026-11-12', endDate: '2026-11-14', days: 2.5, approvalDate: '2026-11-12' },
    { employeeNo: 'CC-0061', leaveType: 'ANNUAL',  startDate: '2026-11-19', endDate: '2026-11-21', days: 2.5, approvalDate: '2026-11-18' },
    { employeeNo: 'CC-0066', leaveType: 'ANNUAL',  startDate: '2026-11-23', endDate: '2026-11-23', days: 1,   approvalDate: '2026-11-23' },
    { employeeNo: 'CC-0068', leaveType: 'UNPAID',  startDate: '2026-11-20', endDate: '2026-11-23', days: 2,   approvalDate: '2026-11-18' },
    { employeeNo: 'CC-0072', leaveType: 'ANNUAL',  startDate: '2026-11-04', endDate: '2026-11-04', days: 1,   approvalDate: '2026-11-03' },
    { employeeNo: 'CC-0072', leaveType: 'ANNUAL',  startDate: '2026-11-16', endDate: '2026-11-26', days: 10,  approvalDate: '2026-11-10' },
    { employeeNo: 'CC-0080', leaveType: 'ANNUAL',  startDate: '2026-11-13', endDate: '2026-11-14', days: 1.5, approvalDate: '2026-11-12' },
  ];
];

type ResolvedEmployee = {
  id: string;
  companyId: string;
  employmentDate: Date | null;
  employeeId: string | null;
};

async function resolveEmployee(
  row: PaperApprovedLeaveSeed,
): Promise<ResolvedEmployee> {
  if (row.employeeId) {
    const byId = await prisma.user.findFirst({
      where: { id: row.employeeId, deletedAt: null },
      select: {
        id: true,
        companyId: true,
        employmentDate: true,
        employeeId: true,
      },
    });
    if (byId) {
      return byId;
    }
  }
  if (row.employeeNo) {
    const byNo = await prisma.user.findFirst({
      where: { employeeId: row.employeeNo, deletedAt: null },
      select: {
        id: true,
        companyId: true,
        employmentDate: true,
        employeeId: true,
      },
    });
    if (byNo) {
      return byNo;
    }
  }
  throw new Error(
    `Employee not found (employeeId=${row.employeeId ?? '-'}, employeeNo=${row.employeeNo ?? '-'})`,
  );
}

async function nextApprovalRequestNumber(
  companyId: string,
  tx: Prisma.TransactionClient,
): Promise<{ categoryId: string; requestNumber: string }> {
  const category = await tx.approvalCategory.findFirst({
    where: { code: 'LEAVE_REQUEST', companyId },
    select: { id: true, numberPrefix: true },
  });
  if (!category) {
    throw new Error(
      `Approval category LEAVE_REQUEST not found for company ${companyId}`,
    );
  }
  const seq = await tx.$queryRawUnsafe<Array<{ nextval: bigint | number }>>(
    `SELECT nextval('approval_request_number_seq') as nextval`,
  );
  const requestNumber = `${category.numberPrefix}-${String(
    Number(seq[0]?.nextval ?? 1),
  ).padStart(4, '0')}`;
  return { categoryId: category.id, requestNumber };
}

async function nextLeaveRequestNumber(
  tx: Prisma.TransactionClient,
): Promise<string> {
  const seq = await tx.$queryRawUnsafe<Array<{ nextval: bigint | number }>>(
    `SELECT nextval('leave_request_number_seq') as nextval`,
  );
  return `LR-${String(Number(seq[0]?.nextval ?? 1)).padStart(4, '0')}`;
}

async function loadLeaveCalendar(employeeId: string, companyId: string) {
  const contracts = await prisma.employeeContract.findMany({
    where: { employeeId, companyId, deletedAt: null },
    select: { startDate: true },
    orderBy: { startDate: 'asc' },
  });
  const user = await prisma.user.findFirst({
    where: { id: employeeId, companyId },
    select: { employmentDate: true },
  });
  return buildLeaveCalendar(
    contracts.map((c) => c.startDate),
    user?.employmentDate ?? null,
  );
}

/**
 * Balance is ledger-driven (LeaveBalanceEntry), not auto-derived from approved
 * LeaveRequest rows. Paper imports must post USED entries and bump LeaveBalance.used.
 */
async function postUsedBalance(
  tx: Prisma.TransactionClient,
  input: {
    companyId: string;
    employeeId: string;
    leaveType: LeaveType;
    leaveRequestId: string;
    requestNumber: string;
    startDate: Date;
    days: number;
    calendar: ReturnType<typeof buildLeaveCalendar>;
  },
): Promise<void> {
  if (!leaveTypeAffectsBalance(input.leaveType)) {
    return;
  }
  const balanceType = getBalanceLeaveType(input.leaveType);
  const year = leaveYearFor(input.calendar, input.startDate);
  const dedupeKey = `USED:${input.leaveRequestId}:${year.label}`;

  const existing = await tx.leaveBalanceEntry.findFirst({
    where: { dedupeKey },
    select: { id: true },
  });
  if (existing) {
    return;
  }

  await tx.leaveBalanceEntry.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      employeeId: input.employeeId,
      leaveType: balanceType,
      leaveYearStart: toDateOnlyUtc(year.start),
      leaveYearEnd: toDateOnlyUtc(year.end),
      kind: LeaveBalanceEntryKind.USED,
      days: new Prisma.Decimal(-input.days),
      reason: `Leave ${input.requestNumber} approved (paper import)`,
      dedupeKey,
      sourceLeaveRequestId: input.leaveRequestId,
      createdById: null,
    },
  });

  await tx.leaveBalance.upsert({
    where: {
      companyId_employeeId_year_leaveType: {
        companyId: input.companyId,
        employeeId: input.employeeId,
        year: year.label,
        leaveType: balanceType,
      },
    },
    create: {
      id: randomUUID(),
      companyId: input.companyId,
      employeeId: input.employeeId,
      year: year.label,
      leaveType: balanceType,
      entitled: 0,
      broughtForward: 0,
      used: input.days,
      pending: 0,
    },
    update: {
      used: { increment: input.days },
    },
  });
}

async function seedOne(
  row: PaperApprovedLeaveSeed,
  index: number,
): Promise<'inserted' | 'skipped'> {
  if (!row.employeeId && !row.employeeNo) {
    throw new Error(`Row ${index + 1}: employeeId or employeeNo is required`);
  }
  if (!row.approverIds?.length) {
    throw new Error(`Row ${index + 1}: approverIds must not be empty`);
  }
  if (!(row.days > 0)) {
    throw new Error(`Row ${index + 1}: days must be > 0`);
  }

  const employee = await resolveEmployee(row);
  const startDate = parseDateOnlyKey(row.startDate);
  const endDate = parseDateOnlyKey(row.endDate);
  const approvalDate = parseDateOnlyKey(row.approvalDate);

  const duplicate = await prisma.leaveRequest.findFirst({
    where: {
      companyId: employee.companyId,
      employeeId: employee.id,
      leaveType: row.leaveType,
      startDate,
      deletedAt: null,
    },
    select: { id: true, requestNumber: true, source: true },
  });
  if (duplicate) {
    console.log(
      `  skip  ${employee.employeeId ?? employee.id} ${row.leaveType} ${row.startDate} (exists ${duplicate.requestNumber})`,
    );
    return 'skipped';
  }

  for (const approverId of row.approverIds) {
    const approver = await prisma.user.findFirst({
      where: { id: approverId, companyId: employee.companyId, deletedAt: null },
      select: { id: true },
    });
    if (!approver) {
      throw new Error(
        `Row ${index + 1}: approver ${approverId} not found in company ${employee.companyId}`,
      );
    }
  }

  const calendar = await loadLeaveCalendar(employee.id, employee.companyId);

  await prisma.$transaction(async (tx) => {
    const { categoryId, requestNumber: approvalNumber } =
      await nextApprovalRequestNumber(employee.companyId, tx);
    const leaveNumber = await nextLeaveRequestNumber(tx);

    const approvalRequestId = randomUUID();
    await tx.approvalRequest.create({
      data: {
        id: approvalRequestId,
        companyId: employee.companyId,
        categoryId,
        requestNumber: approvalNumber,
        title: `${row.leaveType} leave (paper) — ${row.startDate} to ${row.endDate}`,
        formData: {
          source: PAPER_IMPORT_SOURCE,
          leaveType: row.leaveType,
          startDate: row.startDate,
          endDate: row.endDate,
          days: row.days,
        },
        requestedBy: employee.id,
        status: ApprovalRequestStatus.APPROVED,
        currentTier: row.approverIds.length,
        matchedRuleName: 'PAPER_IMPORT',
        submittedAt: approvalDate,
        completedAt: approvalDate,
        notes: 'Imported as already approved on paper. No workflow notifications.',
        createdBy: employee.id,
        updatedBy: employee.id,
        tiers: {
          create: row.approverIds.map((approverId, tierIndex) => ({
            id: randomUUID(),
            tierOrder: tierIndex + 1,
            label: `Approver ${tierIndex + 1}`,
            approverId,
            resolver: 'PAPER_IMPORT',
            decision: ApprovalTierDecision.APPROVED,
            comment: 'Approved on paper (imported).',
            decidedAt: approvalDate,
          })),
        },
      },
    });

    const leaveRequestId = randomUUID();
    await tx.leaveRequest.create({
      data: {
        id: leaveRequestId,
        companyId: employee.companyId,
        requestNumber: leaveNumber,
        employeeId: employee.id,
        leaveType: row.leaveType,
        startDate,
        endDate,
        days: new Prisma.Decimal(row.days),
        reason:
          row.reason?.trim() ||
          'Paper leave form — imported as already approved.',
        status: LeaveRequestStatus.APPROVED,
        source: PAPER_IMPORT_SOURCE,
        approvalRequestId,
        submittedAt: approvalDate,
        completedAt: approvalDate,
        createdBy: employee.id,
        updatedBy: employee.id,
        periods: {
          create: [
            {
              id: randomUUID(),
              startDate,
              endDate,
              days: new Prisma.Decimal(row.days),
              dayPortion: LeaveDayPortion.FULL,
            },
          ],
        },
      },
    });

    await postUsedBalance(tx, {
      companyId: employee.companyId,
      employeeId: employee.id,
      leaveType: row.leaveType,
      leaveRequestId,
      requestNumber: leaveNumber,
      startDate,
      days: row.days,
      calendar,
    });
  });

  console.log(
    `  insert ${employee.employeeId ?? employee.id} ${row.leaveType} ${row.startDate} → ${row.endDate} (${row.days}d)`,
  );
  return 'inserted';
}

async function main(): Promise<void> {
  console.log('Paper-approved leave seed (Nov 2026)…');
  console.log(`Records configured: ${PAPER_APPROVED_LEAVES.length}`);

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (let i = 0; i < PAPER_APPROVED_LEAVES.length; i += 1) {
    const row = PAPER_APPROVED_LEAVES[i]!;
    try {
      const result = await seedOne(row, i);
      if (result === 'inserted') {
        inserted += 1;
      } else {
        skipped += 1;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Row ${i + 1}: ${message}`);
      console.error(`  error row ${i + 1}: ${message}`);
    }
  }

  console.log('—');
  console.log(`Summary: ${inserted} inserted, ${skipped} skipped, ${errors.length} failed`);
  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
