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

type PaperLeavePeriodSeed = {
  startDate: string;
  endDate: string;
  days: number;
  dayPortion?: LeaveDayPortion;
};

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
  /**
   * Optional multi-segment / half-day periods. When omitted, one period is
   * derived from start/end/days (0.5 single-day → MORNING).
   */
  periods?: PaperLeavePeriodSeed[];
  /**
   * Optional override. When omitted, tiers are resolved at seed time:
   * direct supervisor (User.reportsToUserId), then an HR Manager.
   */
  approverIds?: string[];
  /** YYYY-MM-DD — submittedAt / completedAt / tier decidedAt. */
  approvalDate: string;
  /** Optional free-text reason (defaults to a paper-import note). */
  reason?: string;
}

function resolveSeedPeriods(row: PaperApprovedLeaveSeed): PaperLeavePeriodSeed[] {
  if (row.periods?.length) {
    return row.periods;
  }
  const singleDay = row.startDate === row.endDate;
  const dayPortion =
    singleDay && row.days === 0.5
      ? LeaveDayPortion.MORNING
      : LeaveDayPortion.FULL;
  return [
    {
      startDate: row.startDate,
      endDate: row.endDate,
      days: row.days,
      dayPortion,
    },
  ];
}

type ApprovalTierDraft = {
  tierOrder: number;
  label: string;
  approverId: string;
  resolver: string;
};

/**
 * Fill this array with the paper forms. Approver IDs are resolved from the DB
 * (supervisor → HR Manager) unless `approverIds` is set on a row.
 */
const PAPER_APPROVED_LEAVES: PaperApprovedLeaveSeed[] = [
  { employeeNo: 'CC-0010', leaveType: LeaveType.ANNUAL, startDate: '2026-11-03', endDate: '2026-11-05', days: 3, approvalDate: '2026-11-02' },
  { employeeNo: 'CC-0010', leaveType: LeaveType.ANNUAL, startDate: '2026-11-11', endDate: '2026-11-11', days: 1, approvalDate: '2026-11-11' },
  { employeeNo: 'CC-0022', leaveType: LeaveType.ANNUAL, startDate: '2026-11-24', endDate: '2026-11-26', days: 3, approvalDate: '2026-11-23' },
  { employeeNo: 'CC-0042', leaveType: LeaveType.ANNUAL, startDate: '2026-11-21', endDate: '2026-11-21', days: 0.5, approvalDate: '2026-11-20' },
  { employeeNo: 'CC-0043', leaveType: LeaveType.ANNUAL, startDate: '2026-11-03', endDate: '2026-11-06', days: 4, approvalDate: '2026-11-02' },
  { employeeNo: 'CC-0044', leaveType: LeaveType.ANNUAL, startDate: '2026-11-25', endDate: '2026-11-25', days: 1, approvalDate: '2026-11-24' },
  { employeeNo: 'CC-0044', leaveType: LeaveType.ANNUAL, startDate: '2026-11-07', endDate: '2026-11-07', days: 0.5, approvalDate: '2026-11-06' },
  { employeeNo: 'CC-0044', leaveType: LeaveType.ANNUAL, startDate: '2026-11-14', endDate: '2026-11-14', days: 0.5, approvalDate: '2026-11-13' },
  { employeeNo: 'CC-0048', leaveType: LeaveType.ANNUAL, startDate: '2026-11-25', endDate: '2026-11-25', days: 1, approvalDate: '2026-11-26' },
  { employeeNo: 'CC-0048', leaveType: LeaveType.SICK, startDate: '2026-11-05', endDate: '2026-11-05', days: 1, approvalDate: '2026-11-06' },
  { employeeNo: 'CC-0055', leaveType: LeaveType.ANNUAL, startDate: '2026-11-18', endDate: '2026-11-18', days: 0.5, approvalDate: '2026-11-17' },
  { employeeNo: 'CC-0055', leaveType: LeaveType.ANNUAL, startDate: '2026-11-04', endDate: '2026-11-04', days: 1, approvalDate: '2026-11-04' },
  { employeeNo: 'CC-0055', leaveType: LeaveType.ANNUAL, startDate: '2026-11-10', endDate: '2026-11-10', days: 0.5, approvalDate: '2026-11-10' },
  { employeeNo: 'CC-0056', leaveType: LeaveType.ANNUAL, startDate: '2026-11-21', endDate: '2026-11-21', days: 0.5, approvalDate: '2026-11-20' },
  { employeeNo: 'CC-0059', leaveType: LeaveType.SICK, startDate: '2026-11-12', endDate: '2026-11-14', days: 2.5, approvalDate: '2026-11-12' },
  { employeeNo: 'CC-0061', leaveType: LeaveType.ANNUAL, startDate: '2026-11-19', endDate: '2026-11-21', days: 2.5, approvalDate: '2026-11-18' },
  { employeeNo: 'CC-0066', leaveType: LeaveType.ANNUAL, startDate: '2026-11-23', endDate: '2026-11-23', days: 1, approvalDate: '2026-11-23' },
  {
    employeeNo: 'CC-0068',
    leaveType: LeaveType.UNPAID,
    startDate: '2026-11-20',
    endDate: '2026-11-23',
    days: 2,
    approvalDate: '2026-11-18',
    periods: [
      { startDate: '2026-11-20', endDate: '2026-11-20', days: 1, dayPortion: LeaveDayPortion.FULL },
      { startDate: '2026-11-23', endDate: '2026-11-23', days: 1, dayPortion: LeaveDayPortion.FULL },
    ],
  },
  { employeeNo: 'CC-0072', leaveType: LeaveType.COMPASSIONATE, startDate: '2026-11-04', endDate: '2026-11-04', days: 1, approvalDate: '2026-11-03' },
  {
    employeeNo: 'CC-0072',
    leaveType: LeaveType.ANNUAL,
    startDate: '2026-11-16',
    endDate: '2026-11-27',
    days: 10.5,
    approvalDate: '2026-11-10',
    periods: [
      { startDate: '2026-11-16', endDate: '2026-11-26', days: 10, dayPortion: LeaveDayPortion.FULL },
      { startDate: '2026-11-27', endDate: '2026-11-27', days: 0.5, dayPortion: LeaveDayPortion.MORNING },
    ],
  },
  { employeeNo: 'CC-0080', leaveType: LeaveType.ANNUAL, startDate: '2026-11-13', endDate: '2026-11-14', days: 1.5, approvalDate: '2026-11-12' },
  { employeeNo: 'CC-0129', leaveType: LeaveType.SICK, startDate: '2026-11-05', endDate: '2026-11-05', days: 0.5, approvalDate: '2026-11-05' },
  { employeeNo: 'CC-0043', leaveType: LeaveType.ANNUAL, startDate: '2026-10-22', endDate: '2026-10-22', days: 1, approvalDate: '2026-10-22' },
  { employeeNo: 'CC-0043', leaveType: LeaveType.ANNUAL, startDate: '2026-11-11', endDate: '2026-11-11', days: 0.5, approvalDate: '2026-11-11' },
  { employeeNo: 'CC-0043', leaveType: LeaveType.ANNUAL, startDate: '2026-11-17', endDate: '2026-11-17', days: 1, approvalDate: '2026-11-17' },
  { employeeNo: 'CC-0043', leaveType: LeaveType.ANNUAL, startDate: '2026-11-19', endDate: '2026-11-19', days: 0.5, approvalDate: '2026-11-19' },
  { employeeNo: 'CC-0003', leaveType: LeaveType.ANNUAL, startDate: '2026-11-17', endDate: '2026-11-17', days: 1, approvalDate: '2026-11-16' },
];

type ResolvedEmployee = {
  id: string;
  companyId: string;
  employmentDate: Date | null;
  employeeId: string | null;
  reportsToUserId: string | null;
};

const HR_MANAGER_ROLE_NAMES = ['HR Manager', 'Local HR Manager'] as const;

async function resolveEmployee(
  row: PaperApprovedLeaveSeed,
): Promise<ResolvedEmployee> {
  const select = {
    id: true,
    companyId: true,
    employmentDate: true,
    employeeId: true,
    reportsToUserId: true,
  } as const;

  if (row.employeeId) {
    const byId = await prisma.user.findFirst({
      where: { id: row.employeeId, deletedAt: null },
      select,
    });
    if (byId) {
      return byId;
    }
  }
  if (row.employeeNo) {
    const byNo = await prisma.user.findFirst({
      where: { employeeId: row.employeeNo, deletedAt: null },
      select,
    });
    if (byNo) {
      return byNo;
    }
  }
  throw new Error(
    `Employee not found (employeeId=${row.employeeId ?? '-'}, employeeNo=${row.employeeNo ?? '-'})`,
  );
}

/**
 * Builds approval tiers: optional override → else supervisor then HR Manager.
 * Missing people are warned and skipped; empty result means the row should be skipped.
 */
async function resolveApprovalTiers(
  employee: ResolvedEmployee,
  row: PaperApprovedLeaveSeed,
  rowLabel: string,
): Promise<ApprovalTierDraft[]> {
  if (row.approverIds?.length) {
    const tiers: ApprovalTierDraft[] = [];
    for (let i = 0; i < row.approverIds.length; i += 1) {
      const approverId = row.approverIds[i]!;
      const approver = await prisma.user.findFirst({
        where: {
          id: approverId,
          companyId: employee.companyId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (!approver) {
        console.warn(
          `  warn  ${rowLabel}: approver ${approverId} not found — skipping tier`,
        );
        continue;
      }
      tiers.push({
        tierOrder: tiers.length + 1,
        label: `Approver ${tiers.length + 1}`,
        approverId: approver.id,
        resolver: 'PAPER_IMPORT',
      });
    }
    return tiers;
  }

  const tiers: ApprovalTierDraft[] = [];
  const seen = new Set<string>();

  if (employee.reportsToUserId) {
    const supervisor = await prisma.user.findFirst({
      where: {
        id: employee.reportsToUserId,
        companyId: employee.companyId,
        deletedAt: null,
      },
      select: { id: true },
    });
    if (supervisor) {
      tiers.push({
        tierOrder: 1,
        label: 'Direct Supervisor',
        approverId: supervisor.id,
        resolver: 'REPORTS_TO',
      });
      seen.add(supervisor.id);
    } else {
      console.warn(
        `  warn  ${rowLabel}: reportsToUserId ${employee.reportsToUserId} not found — skipping supervisor tier`,
      );
    }
  } else {
    console.warn(
      `  warn  ${rowLabel}: no reportsToUserId — supervisor tier omitted`,
    );
  }

  const hrManager = await prisma.user.findFirst({
    where: {
      companyId: employee.companyId,
      deletedAt: null,
      isActive: true,
      userRoles: {
        some: {
          deletedAt: null,
          role: {
            deletedAt: null,
            isActive: true,
            companyId: employee.companyId,
            name: { in: [...HR_MANAGER_ROLE_NAMES] },
          },
        },
      },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });

  if (!hrManager) {
    console.warn(
      `  warn  ${rowLabel}: no HR Manager / Local HR Manager found — HR tier omitted`,
    );
  } else if (seen.has(hrManager.id)) {
    console.warn(
      `  warn  ${rowLabel}: HR Manager is the same as supervisor — single tier only`,
    );
  } else {
    tiers.push({
      tierOrder: tiers.length + 1,
      label: 'HR Manager',
      approverId: hrManager.id,
      resolver: 'ROLE:HR Manager',
    });
  }

  return tiers;
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

/**
 * Advances leave_request_number_seq past any existing LR-#### rows so seed
 * inserts do not collide with numbers issued outside the sequence.
 */
async function syncLeaveRequestNumberSeq(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    SELECT setval(
      'leave_request_number_seq',
      GREATEST(
        (SELECT COALESCE(MAX(
          CASE
            WHEN request_number ~ '^LR-[0-9]+$'
            THEN CAST(SUBSTRING(request_number FROM 4) AS BIGINT)
            ELSE 0
          END
        ), 0) FROM leave_request),
        (SELECT last_value FROM leave_request_number_seq)
      ),
      true
    )
  `);
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
  if (!(row.days > 0)) {
    throw new Error(`Row ${index + 1}: days must be > 0`);
  }

  const employee = await resolveEmployee(row);
  const rowLabel = `${employee.employeeId ?? employee.id} ${row.leaveType} ${row.startDate}`;
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
      `  skip  ${rowLabel} (exists ${duplicate.requestNumber})`,
    );
    return 'skipped';
  }

  const tiers = await resolveApprovalTiers(employee, row, rowLabel);
  if (tiers.length === 0) {
    console.warn(
      `  skip  ${rowLabel}: no approvers resolved (supervisor / HR Manager)`,
    );
    return 'skipped';
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
        currentTier: tiers.length,
        matchedRuleName: 'PAPER_IMPORT',
        submittedAt: approvalDate,
        completedAt: approvalDate,
        notes: 'Imported as already approved on paper. No workflow notifications.',
        createdBy: employee.id,
        updatedBy: employee.id,
        tiers: {
          create: tiers.map((tier) => ({
            id: randomUUID(),
            tierOrder: tier.tierOrder,
            label: tier.label,
            approverId: tier.approverId,
            resolver: tier.resolver,
            decision: ApprovalTierDecision.APPROVED,
            comment: 'Approved on paper (imported).',
            decidedAt: approvalDate,
          })),
        },
      },
    });

    const leaveRequestId = randomUUID();
    const seedPeriods = resolveSeedPeriods(row);
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
          'Paper leave form,imported as already approved.',
        status: LeaveRequestStatus.APPROVED,
        source: PAPER_IMPORT_SOURCE,
        approvalRequestId,
        submittedAt: approvalDate,
        completedAt: approvalDate,
        createdBy: employee.id,
        updatedBy: employee.id,
        periods: {
          create: seedPeriods.map((period) => ({
            id: randomUUID(),
            startDate: parseDateOnlyKey(period.startDate),
            endDate: parseDateOnlyKey(period.endDate),
            days: new Prisma.Decimal(period.days),
            dayPortion: period.dayPortion ?? LeaveDayPortion.FULL,
          })),
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
  }, {
    // Production latency can exceed Prisma's 5s interactive default.
    maxWait: 20_000,
    timeout: 60_000,
  });

  console.log(
    `  insert ${employee.employeeId ?? employee.id} ${row.leaveType} ${row.startDate} → ${row.endDate} (${row.days}d)`,
  );
  return 'inserted';
}

async function main(): Promise<void> {
  console.log('Paper-approved leave seed (Nov 2026)…');
  console.log(`Records configured: ${PAPER_APPROVED_LEAVES.length}`);
  await syncLeaveRequestNumberSeq();

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
