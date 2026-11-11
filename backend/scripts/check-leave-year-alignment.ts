/**
 * Read-only check for the switch to contract-based leave years. Ledger
 * entries are filed by leave-year start; any entry whose leave_year_start is
 * not a leave-year start under the employee's contract calendar no longer
 * counts toward a balance. Lists those employees (code only, never names)
 * with the leave year each orphaned group now falls in. Writes nothing.
 * Re-run after HR moves a contract start date.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/check-leave-year-alignment.ts
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  buildLeaveCalendar,
  isLeaveYearStart,
  leaveYearFor,
  toDateOnlyKey,
} from '../src/modules/leave-policy/application/utils/leave-year.util';
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
  console.log(
    `[check-leave-year-alignment] read-only host=${target.host} db=${target.database}`,
  );

  try {
    const groups = await prisma.leaveBalanceEntry.groupBy({
      by: ['employeeId', 'companyId', 'leaveYearStart'],
      _count: { _all: true },
    });
    const employeeIds = [...new Set(groups.map((group) => group.employeeId))];
    const users = await prisma.user.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, employeeId: true, employmentDate: true },
    });
    const contracts = await prisma.employeeContract.findMany({
      where: { employeeId: { in: employeeIds }, deletedAt: null },
      select: { employeeId: true, companyId: true, startDate: true },
    });

    let orphanedGroups = 0;
    const affected = new Set<string>();
    for (const user of users) {
      const calendar = buildLeaveCalendar(
        contracts
          .filter((contract) => contract.employeeId === user.id)
          .map((contract) => contract.startDate),
        user.employmentDate,
      );
      const code = user.employeeId ?? `user:${user.id}`;
      for (const group of groups.filter((row) => row.employeeId === user.id)) {
        if (isLeaveYearStart(calendar, group.leaveYearStart)) {
          continue;
        }
        orphanedGroups += 1;
        affected.add(user.id);
        const now = leaveYearFor(calendar, group.leaveYearStart);
        console.log(
          `${code}  entries filed under ${toDateOnlyKey(group.leaveYearStart)} (${group._count._all})  ` +
            `→ now in leave year ${now.label} starting ${toDateOnlyKey(now.start)}`,
        );
      }
    }

    console.log('');
    console.log(`employeesWithEntries=${employeeIds.length}`);
    console.log(`employeesAffected=${affected.size}`);
    console.log(`orphanedEntryGroups=${orphanedGroups}`);
    if (affected.size === 0) {
      console.log('All ledger entries line up with contract leave years.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
