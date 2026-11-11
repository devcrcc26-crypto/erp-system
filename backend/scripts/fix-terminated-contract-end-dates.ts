/**
 * Data fixes for employment separation (phase 1):
 *  1. TERMINATED contracts whose endDate is null or later than terminatedAt →
 *     endDate = terminatedAt (payroll/attendance read endDate).
 *  2. Report (no changes) users with login disabled (isActive=false) whose
 *     employment is still open - HR must separate them or re-enable login.
 *
 * Dry run by default; --apply writes fix 1. SEED_MODE required; non-localhost needs --allow-remote.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/fix-terminated-contract-end-dates.ts
 *   npx ts-node --transpile-only scripts/fix-terminated-contract-end-dates.ts --apply
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

const ymd = (d: Date | null): string => (d ? d.toISOString().slice(0, 10) : 'null');

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);
  const prisma = new PrismaClient();
  console.log(
    `[fix-terminated-contract-end-dates] ${args.apply ? 'APPLY' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  try {
    const terminated = await prisma.employeeContract.findMany({
      where: { deletedAt: null, status: 'TERMINATED', terminatedAt: { not: null } },
      select: {
        id: true,
        contractNumber: true,
        startDate: true,
        endDate: true,
        terminatedAt: true,
        employee: { select: { employeeId: true, firstName: true, lastName: true } },
      },
    });
    const toFix = terminated.filter(
      (c) => c.endDate == null || c.endDate.getTime() > c.terminatedAt!.getTime(),
    );
    const invalid = toFix.filter((c) => c.terminatedAt!.getTime() < c.startDate.getTime());

    console.log(`TERMINATED_CONTRACTS=${terminated.length}`);
    console.log(`END_DATE_TO_FIX=${toFix.length}`);
    console.log(`  endDateNull=${toFix.filter((c) => c.endDate == null).length}`);
    console.log(`  endDateAfterTermination=${toFix.filter((c) => c.endDate != null).length}`);
    console.log(`TERMINATED_BEFORE_START (reported, not fixed)=${invalid.length}`);
    for (const c of toFix) {
      const who = `${c.employee.employeeId ?? '-'} ${c.employee.firstName} ${c.employee.lastName}`;
      console.log(
        `  ${c.contractNumber} ${who}: endDate ${ymd(c.endDate)} → ${ymd(c.terminatedAt)}`,
      );
    }

    const loginDisabledOpen = await prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: false,
        excludedFromHrProcesses: false,
        employmentStatus: { not: 'SEPARATED' },
        NOT: { employmentPeriods: { some: { endDate: { not: null } } } },
      },
      select: { id: true, employeeId: true, firstName: true, lastName: true },
      orderBy: { firstName: 'asc' },
    });
    console.log(`LOGIN_DISABLED_NO_CLOSED_PERIOD=${loginDisabledOpen.length} (report for HR)`);
    for (const u of loginDisabledOpen) {
      console.log(`  ${u.id} ${u.employeeId ?? '-'} ${u.firstName} ${u.lastName}`);
    }

    if (!args.apply) {
      console.log('Dry run - nothing written. Re-run with --apply to fix end dates.');
      return;
    }
    let fixed = 0;
    for (const c of toFix) {
      if (c.terminatedAt!.getTime() < c.startDate.getTime()) continue;
      await prisma.employeeContract.update({
        where: { id: c.id },
        data: { endDate: c.terminatedAt },
      });
      fixed += 1;
    }
    console.log(`fixed=${fixed}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
