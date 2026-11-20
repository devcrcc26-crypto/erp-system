/**
 * One-time cleanup: remove sick leave balance cache rows (and matching ledger
 * entries so sync cannot recreate them).
 *
 * Sick leave balance removed — request-only per Ethiopian Labour Proclamation
 * No. 1156/2019. Re-implement with pay tier engine later.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/delete-sick-leave-balances.ts
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/delete-sick-leave-balances.ts --apply
 *   # production:
 *   $env:DATABASE_URL=$env:PROD_DIRECT_URL
 *   npx ts-node ... scripts/delete-sick-leave-balances.ts --apply --allow-remote
 */

import 'dotenv/config';
import { LeaveType, PrismaClient } from '@prisma/client';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

async function main(): Promise<void> {
  assertSeedMode();
  const setupArgs = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(setupArgs.allowRemote);
  console.log(`DATABASE=${target.database} HOST=${target.host}`);

  const prisma = new PrismaClient();
  try {
    const [balanceCount, entryCount] = await Promise.all([
      prisma.leaveBalance.count({ where: { leaveType: LeaveType.SICK } }),
      prisma.leaveBalanceEntry.count({ where: { leaveType: LeaveType.SICK } }),
    ]);

    console.log(
      `SICK leave_balance=${balanceCount} leave_balance_entry=${entryCount}`,
    );

    if (!setupArgs.apply) {
      console.log('Dry run only. Re-run with --apply to delete.');
      return;
    }

    // Sick leave balance removed — request-only per Ethiopian Labour Proclamation
    // No. 1156/2019. Re-implement with pay tier engine later.
    const deletedEntries = await prisma.leaveBalanceEntry.deleteMany({
      where: { leaveType: LeaveType.SICK },
    });
    const deletedBalances = await prisma.leaveBalance.deleteMany({
      where: { leaveType: LeaveType.SICK },
    });

    console.log(
      `DELETED leave_balance_entry=${deletedEntries.count} leave_balance=${deletedBalances.count}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
