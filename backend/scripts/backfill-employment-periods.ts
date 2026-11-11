/**
 * One open EmploymentPeriod per existing user that has none, starting at
 * employmentDate (fallback: first contract start, then account creation date).
 * Approver-only accounts (excludedFromHrProcesses) are skipped.
 *
 * Dry run by default; --apply writes. SEED_MODE required; non-localhost needs --allow-remote.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/backfill-employment-periods.ts
 *   npx ts-node --transpile-only scripts/backfill-employment-periods.ts --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

function dateOnly(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);
  const prisma = new PrismaClient();
  console.log(
    `[backfill-employment-periods] ${args.apply ? 'APPLY' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  try {
    const users = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        id: true,
        companyId: true,
        employmentDate: true,
        createdAt: true,
        isActive: true,
        excludedFromHrProcesses: true,
        _count: { select: { employmentPeriods: true } },
      },
    });
    const firstContracts = await prisma.employeeContract.groupBy({
      by: ['employeeId'],
      where: { deletedAt: null },
      _min: { startDate: true },
    });
    const firstContractByUser = new Map(
      firstContracts.map((c) => [c.employeeId, c._min.startDate]),
    );

    const counts = {
      users: users.length,
      alreadyHavePeriods: 0,
      skippedApproverOnly: 0,
      toCreate: 0,
      fromEmploymentDate: 0,
      fromFirstContract: 0,
      fromCreatedAt: 0,
      toCreateLoginDisabled: 0,
    };
    const plan: Array<{ companyId: string; userId: string; startDate: Date }> = [];

    for (const user of users) {
      if (user._count.employmentPeriods > 0) {
        counts.alreadyHavePeriods += 1;
        continue;
      }
      if (user.excludedFromHrProcesses) {
        counts.skippedApproverOnly += 1;
        continue;
      }
      let startDate: Date;
      if (user.employmentDate) {
        startDate = user.employmentDate;
        counts.fromEmploymentDate += 1;
      } else if (firstContractByUser.get(user.id)) {
        startDate = firstContractByUser.get(user.id)!;
        counts.fromFirstContract += 1;
      } else {
        startDate = dateOnly(user.createdAt);
        counts.fromCreatedAt += 1;
      }
      if (!user.isActive) counts.toCreateLoginDisabled += 1;
      plan.push({ companyId: user.companyId, userId: user.id, startDate });
    }
    counts.toCreate = plan.length;

    for (const [key, value] of Object.entries(counts)) {
      console.log(`${key}=${value}`);
    }

    if (!args.apply) {
      console.log('Dry run - nothing written. Re-run with --apply to create the periods.');
      return;
    }

    let created = 0;
    for (const row of plan) {
      // Re-check per row so a concurrent separation/backfill is never duplicated.
      const exists = await prisma.employmentPeriod.count({ where: { userId: row.userId } });
      if (exists > 0) continue;
      await prisma.employmentPeriod.create({
        data: { ...row, createdBy: null },
      });
      created += 1;
    }
    console.log(`created=${created}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
