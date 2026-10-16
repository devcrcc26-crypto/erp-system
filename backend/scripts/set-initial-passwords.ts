/**
 * Set random temporary passwords for active users and write an Excel
 * credentials workbook (never printed to the console).
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/set-initial-passwords.ts
 *   npx ts-node -r tsconfig-paths/register scripts/set-initial-passwords.ts --apply
 *   npx ts-node -r tsconfig-paths/register scripts/set-initial-passwords.ts --apply --reset
 *   npx ts-node -r tsconfig-paths/register scripts/set-initial-passwords.ts --apply --only=<id>,<id>
 *
 * Output (after successful --apply commit only):
 *   backend/data/private/login-credentials-<YYYY-MM-DD-HHmm>.xlsx
 */

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  assertCredentialsPathGitignored,
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';
import { writeLoginCredentialsWorkbook } from './lib/login-credentials-workbook';
import {
  formatCredentialsFileStamp,
  generateUniqueTemporaryPassword,
  planInitialPasswordUpdates,
  resolveAppUrl,
  type UserForPasswordSetup,
} from './lib/set-initial-passwords-plan';

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);

  const stamp = formatCredentialsFileStamp();
  const relativeXlsx = `backend/data/private/login-credentials-${stamp}.xlsx`;
  const rootGitignore = join(__dirname, '..', '..', '.gitignore');
  assertCredentialsPathGitignored(
    readFileSync(rootGitignore, 'utf8'),
    relativeXlsx,
  );

  const prisma = new PrismaClient();
  const privateDir = join(__dirname, '..', 'data', 'private');
  if (!existsSync(privateDir)) {
    mkdirSync(privateDir, { recursive: true });
  }

  console.log(
    `[set-initial-passwords] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const users = await prisma.user.findMany({
    where: {
      deletedAt: null,
      isActive: true,
      ...(args.onlyIds.length ? { id: { in: args.onlyIds } } : {}),
    },
    select: {
      id: true,
      loginName: true,
      passwordHash: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      middleName: true,
      department: { select: { name: true } },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const forPlan: UserForPasswordSetup[] = users.map((u) => ({
    id: u.id,
    loginName: u.loginName,
    passwordHash: u.passwordHash,
    employeeId: u.employeeId,
    firstName: u.firstName,
    lastName: u.lastName,
    middleName: u.middleName,
    departmentName: u.department?.name ?? null,
  }));

  const plan = planInitialPasswordUpdates(forPlan, { reset: args.reset });

  const xlsxPath = join(privateDir, `login-credentials-${stamp}.xlsx`);
  let excelWritten: string | null = null;

  if (args.apply && plan.toUpdate.length > 0) {
    const credentialRows: Array<{
      employeeId: string | null;
      fullName: string;
      department: string;
      temporaryPassword: string;
    }> = [];

    await prisma.$transaction(async (tx) => {
      for (const row of plan.toUpdate) {
        const temporaryPassword = generateUniqueTemporaryPassword(row.loginName);
        const passwordHash = await bcrypt.hash(
          temporaryPassword,
          BCRYPT_ROUNDS,
        );
        await tx.user.update({
          where: { id: row.id },
          data: {
            passwordHash,
            mustChangePassword: true,
            failedLoginAttempts: 0,
            lockedUntil: null,
          },
        });
        credentialRows.push({
          employeeId: row.employeeId,
          fullName: row.fullName,
          department: row.departmentName,
          temporaryPassword,
        });
      }
    });

    try {
      await writeLoginCredentialsWorkbook(
        xlsxPath,
        credentialRows,
        resolveAppUrl(),
      );
      excelWritten = xlsxPath;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        'ERROR: Passwords were updated in the database but the credentials Excel file could not be written.',
      );
      console.error(
        'The temporary passwords are unrecoverable. Re-run with --apply --reset to generate new passwords and a new file.',
      );
      console.error(message);
      await prisma.$disconnect();
      process.exit(1);
    }
  }

  const reportPath = join(privateDir, 'login-setup-report.md');
  const noLoginLines =
    plan.noLoginName.length === 0
      ? []
      : [
          '',
          'Users with no login name - run backfill first:',
          ...plan.noLoginName.map(
            (u) =>
              `- ${u.id} (${[u.firstName, u.middleName, u.lastName].filter(Boolean).join(' ')})`,
          ),
        ];

  const section = [
    '',
    '## Initial passwords',
    '',
    `Mode: **${args.apply ? 'apply' : 'dry-run'}** (reset=${args.reset})`,
    `| Status | Count |`,
    `| --- | ---: |`,
    `| UPDATED | ${plan.toUpdate.length} |`,
    `| SKIPPED (existing password) | ${plan.skippedHasPassword.length} |`,
    `| NO LOGIN NAME | ${plan.noLoginName.length} |`,
    excelWritten ? `Excel: \`${relativeXlsx}\`` : '',
    ...noLoginLines,
    '',
  ]
    .filter((line) => line !== undefined)
    .join('\n');

  if (existsSync(reportPath)) {
    appendFileSync(reportPath, section, 'utf8');
  } else {
    writeFileSync(reportPath, `# Login setup report\n${section}`, 'utf8');
  }

  console.log(
    `UPDATED=${plan.toUpdate.length} SKIPPED=${plan.skippedHasPassword.length} NO_LOGIN_NAME=${plan.noLoginName.length}`,
  );
  if (plan.noLoginName.length > 0) {
    console.log(
      `${plan.noLoginName.length} user(s) have no login name - run backfill first (listed in login-setup-report.md)`,
    );
  }
  if (excelWritten) {
    console.log(`Excel: ${excelWritten}`);
  } else if (!args.apply) {
    console.log('Dry-run: no DB updates and no Excel file written.');
  } else if (plan.toUpdate.length === 0) {
    console.log('Nothing to update; no Excel file written.');
  }

  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
