/**
 * Backfills User.employmentDate for employees who have none, estimating tenure
 * from the annual entitlement imported at go-live (OPENING_BALANCE ledger
 * entry). Service years are the fewest that the employee's own leave policy
 * rule needs to grant that entitlement (Standard Staff: 17 → 2, 18 → 4, ...).
 *
 * The proposed date keeps the month/day of the current leave-year anchor
 * (first contract start, else 1 January) and only moves the year back, so
 * leave-year boundaries and existing ledger entries are unchanged. Employees
 * whose imported entry does not sit on that anchor are reported, not changed.
 *
 * Output shows employee code (or user id) only - never names.
 * Dry run by default; --apply writes. SEED_MODE required; non-localhost needs --allow-remote.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-employment-dates.ts
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/backfill-employment-dates.ts --apply
 */
import 'dotenv/config';
import { LeaveBalanceEntryKind, LeaveType, PrismaClient } from '@prisma/client';
import { inferMinServiceYears } from '../src/modules/leave-policy/application/utils/leave-entitlement.util';
import {
  anniversaryInYear,
  toDateOnlyKey,
} from '../src/modules/leave-policy/application/utils/leave-year.util';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

interface Proposal {
  userId: string;
  code: string;
  entitlement: number;
  serviceYears: number;
  proposed: Date;
  currentAnchor: Date | null;
}

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);
  const prisma = new PrismaClient();
  console.log(
    `[backfill-employment-dates] ${args.apply ? 'APPLY' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  try {
    const alreadySet = await prisma.user.count({
      where: { deletedAt: null, employmentDate: { not: null } },
    });
    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        employmentDate: null,
        excludedFromHrProcesses: false,
      },
      select: {
        id: true,
        companyId: true,
        employeeId: true,
        leavePolicy: {
          select: {
            isActive: true,
            deletedAt: true,
            rules: { where: { leaveType: LeaveType.ANNUAL } },
          },
        },
      },
    });

    const counts = {
      alreadySet,
      candidates: users.length,
      proposed: 0,
      noChangeNeeded: 0,
      skippedNoImportedBalance: 0,
      skippedNoProgressivePolicy: 0,
      skippedUnrecognisedEntitlement: 0,
      skippedLeaveYearMismatch: 0,
    };
    const plan: Proposal[] = [];
    const review: string[] = [];

    for (const user of users) {
      const code = user.employeeId ?? `user:${user.id}`;
      const opening = await prisma.leaveBalanceEntry.findFirst({
        where: {
          employeeId: user.id,
          leaveType: LeaveType.ANNUAL,
          kind: LeaveBalanceEntryKind.OPENING_BALANCE,
        },
        orderBy: { leaveYearStart: 'desc' },
        select: { days: true, leaveYearStart: true },
      });
      if (!opening) {
        counts.skippedNoImportedBalance += 1;
        continue;
      }

      const policy = user.leavePolicy;
      const rule =
        policy?.isActive && !policy.deletedAt ? policy.rules[0] : undefined;
      if (!rule?.isProgressive) {
        // Flat or no policy: tenure does not change the entitlement.
        counts.skippedNoProgressivePolicy += 1;
        continue;
      }

      const entitlement = Number(opening.days);
      const serviceYears = inferMinServiceYears(rule, entitlement);
      if (serviceYears == null) {
        counts.skippedUnrecognisedEntitlement += 1;
        review.push(`${code}: imported entitlement ${entitlement} not produced by policy`);
        continue;
      }

      const firstContract = await prisma.employeeContract.findFirst({
        where: { companyId: user.companyId, employeeId: user.id, deletedAt: null },
        orderBy: { startDate: 'asc' },
        select: { startDate: true },
      });
      const currentAnchor = firstContract?.startDate ?? null;
      const yearStartKey = toDateOnlyKey(opening.leaveYearStart);
      const yearStartYear = Number(yearStartKey.slice(0, 4));
      const expectedStartKey = currentAnchor
        ? toDateOnlyKey(anniversaryInYear(currentAnchor, yearStartYear))
        : `${yearStartYear}-01-01`;
      if (yearStartKey !== expectedStartKey) {
        counts.skippedLeaveYearMismatch += 1;
        review.push(
          `${code}: imported leave year starts ${yearStartKey}, current anchor expects ${expectedStartKey}`,
        );
        continue;
      }

      const proposed = anniversaryInYear(
        opening.leaveYearStart,
        yearStartYear - serviceYears,
      );
      if (
        serviceYears === 0 ||
        (currentAnchor &&
          toDateOnlyKey(currentAnchor) <= toDateOnlyKey(proposed))
      ) {
        counts.noChangeNeeded += 1;
        continue;
      }
      plan.push({
        userId: user.id,
        code,
        entitlement,
        serviceYears,
        proposed,
        currentAnchor,
      });
    }
    counts.proposed = plan.length;

    for (const row of plan) {
      console.log(
        `${row.code}  entitlement=${row.entitlement}  serviceYears>=${row.serviceYears}  ` +
          `employmentDate=${toDateOnlyKey(row.proposed)}  (anchor was ${
            row.currentAnchor ? toDateOnlyKey(row.currentAnchor) : '1 January'
          })`,
      );
    }
    if (review.length > 0) {
      console.log('\nNeeds manual review:');
      for (const line of review) {
        console.log(`  ${line}`);
      }
    }
    console.log('');
    for (const [key, value] of Object.entries(counts)) {
      console.log(`${key}=${value}`);
    }

    if (!args.apply) {
      console.log('Dry run - nothing written. Re-run with --apply to set the dates.');
      return;
    }

    let updated = 0;
    for (const row of plan) {
      // Only fill a still-empty date so a value HR entered meanwhile is kept.
      const result = await prisma.user.updateMany({
        where: { id: row.userId, employmentDate: null },
        data: { employmentDate: row.proposed },
      });
      updated += result.count;
    }
    console.log(`updated=${updated}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
