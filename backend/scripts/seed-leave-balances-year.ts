/**
 * Sets default leave entitlements for all active employees for a leave year label.
 *
 * Defaults: annual 20 days, sick 30 days, maternity 90 days (3 months).
 * Maternity is applied only when gender is FEMALE.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/seed-leave-balances-year.ts --year=2025
 *   npx ts-node -r tsconfig-paths/register --transpile-only scripts/seed-leave-balances-year.ts --year=2025 --apply
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Gender, LeaveType, PrismaClient } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { LeaveLedgerService } from '../src/modules/leave-policy/application/services/leave-ledger.service';
import { leaveYearByLabel } from '../src/modules/leave-policy/application/utils/leave-year.util';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

const DEFAULT_ANNUAL_DAYS = 20;
const DEFAULT_SICK_DAYS = 30;
/** Three calendar months of working days (company policy / seed convention). */
const DEFAULT_MATERNITY_DAYS = 90;

function parseYear(argv: string[]): number {
  const arg = argv.find((a) => a.startsWith('--year='));
  if (!arg) {
    return 2025;
  }
  const value = Number(arg.slice('--year='.length));
  if (!Number.isInteger(value) || value < 2000 || value > 2100) {
    console.error('Invalid --year= (expected integer 2000–2100).');
    process.exit(1);
  }
  return value;
}

async function resolveActorUserId(prisma: PrismaClient): Promise<string> {
  const admin = await prisma.user.findFirst({
    where: {
      deletedAt: null,
      isActive: true,
      userRoles: {
        some: {
          role: {
            name: 'System Administrator',
            deletedAt: null,
          },
        },
      },
    },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (admin) {
    return admin.id;
  }
  const anyUser = await prisma.user.findFirst({
    where: { deletedAt: null, isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!anyUser) {
    throw new Error('No active user found to record as balance actor.');
  }
  return anyUser.id;
}

async function main(): Promise<void> {
  assertSeedMode();
  const setupArgs = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(setupArgs.allowRemote);
  const year = parseYear(process.argv.slice(2));
  const prisma = new PrismaClient();

  console.log(
    `[seed-leave-balances-year] ${setupArgs.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database} year=${year}`,
  );

  const employees = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      excludedFromHrProcesses: false,
    },
    select: {
      id: true,
      companyId: true,
      gender: true,
      firstName: true,
      lastName: true,
      employmentDate: true,
    },
    orderBy: [{ companyId: 'asc' }, { lastName: 'asc' }],
  });

  console.log(`EMPLOYEES=${employees.length}`);

  let annualCount = 0;
  let sickCount = 0;
  let maternityCount = 0;
  let skippedMaternity = 0;
  const errors: string[] = [];

  async function seedType(
    ledger: LeaveLedgerService,
    employee: (typeof employees)[number],
    leaveType: LeaveType,
    entitled: number,
    actorUserId: string,
  ): Promise<void> {
    const yearStart = leaveYearByLabel(employee.employmentDate, year).start;
    let used = 0;
    try {
      const view = await ledger.getLeaveBalance(
        employee.id,
        employee.companyId,
        leaveType,
        yearStart,
      );
      used = view.used;
    } catch {
      used = 0;
    }
    await ledger.applyImportedBalance({
      employeeId: employee.id,
      companyId: employee.companyId,
      leaveType,
      yearLabel: year,
      entitled,
      broughtForward: 0,
      used,
      actorUserId,
    });
  }

  if (setupArgs.apply && employees.length > 0) {
    const app = await NestFactory.createApplicationContext(AppModule, {
      logger: false,
    });
    const ledger = app.get(LeaveLedgerService);
    const actorUserId = await resolveActorUserId(prisma);

    for (const employee of employees) {
      const label = `${employee.firstName} ${employee.lastName}`.trim();
      try {
        await seedType(
          ledger,
          employee,
          LeaveType.ANNUAL,
          DEFAULT_ANNUAL_DAYS,
          actorUserId,
        );
        annualCount += 1;

        await seedType(
          ledger,
          employee,
          LeaveType.SICK,
          DEFAULT_SICK_DAYS,
          actorUserId,
        );
        sickCount += 1;

        if (employee.gender === Gender.FEMALE) {
          await seedType(
            ledger,
            employee,
            LeaveType.MATERNITY,
            DEFAULT_MATERNITY_DAYS,
            actorUserId,
          );
          maternityCount += 1;
        } else {
          skippedMaternity += 1;
        }
      } catch (error) {
        errors.push(
          `${label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    await app.close();
  } else {
    for (const employee of employees) {
      annualCount += 1;
      sickCount += 1;
      if (employee.gender === Gender.FEMALE) {
        maternityCount += 1;
      } else {
        skippedMaternity += 1;
      }
    }
  }

  console.log(
    `ANNUAL=${annualCount}@${DEFAULT_ANNUAL_DAYS} SICK=${sickCount}@${DEFAULT_SICK_DAYS} MATERNITY=${maternityCount}@${DEFAULT_MATERNITY_DAYS} SKIP_MATERNITY_NON_FEMALE=${skippedMaternity} ERRORS=${errors.length}`,
  );
  if (errors.length > 0) {
    for (const line of errors.slice(0, 20)) {
      console.error(line);
    }
    if (errors.length > 20) {
      console.error(`… and ${errors.length - 20} more`);
    }
    process.exitCode = 1;
  }

  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
