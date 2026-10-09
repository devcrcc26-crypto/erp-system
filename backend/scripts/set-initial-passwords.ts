/**
 * Set random temporary passwords for users that do not yet have one.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/set-initial-passwords.ts
 *   npx ts-node -r tsconfig-paths/register scripts/set-initial-passwords.ts --apply
 *   npx ts-node -r tsconfig-paths/register scripts/set-initial-passwords.ts --apply --reset
 *   npx ts-node -r tsconfig-paths/register scripts/set-initial-passwords.ts --apply --only=<id>,<id>
 *
 * Never prints passwords. Writes login name + temp password only to
 * backend/data/private/initial-credentials.csv (gitignored).
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
import { generateTemporaryPassword } from '../src/modules/auth/application/utils/password-policy.util';
import { normalizeLoginName } from '../src/modules/auth/application/utils/login-name.util';
import {
  assertCredentialsPathGitignored,
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

const BCRYPT_ROUNDS = 12;

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);

  const rootGitignore = join(__dirname, '..', '..', '.gitignore');
  assertCredentialsPathGitignored(
    readFileSync(rootGitignore, 'utf8'),
    'backend/data/private/initial-credentials.csv',
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
      ...(args.onlyIds.length ? { id: { in: args.onlyIds } } : {}),
    },
    select: {
      id: true,
      loginName: true,
      passwordHash: true,
    },
  });

  const toSet: Array<{ id: string; loginName: string }> = [];
  let skipped = 0;

  for (const user of users) {
    if (!user.loginName) {
      skipped += 1;
      continue;
    }
    const hasPassword = Boolean(user.passwordHash);
    if (hasPassword && !args.reset) {
      skipped += 1;
      continue;
    }
    toSet.push({ id: user.id, loginName: user.loginName });
  }

  const credentialRows: string[] = ['login_name,temporary_password'];

  if (args.apply) {
    for (const row of toSet) {
      let temporaryPassword = generateTemporaryPassword(12);
      while (
        normalizeLoginName(temporaryPassword) ===
        normalizeLoginName(row.loginName)
      ) {
        temporaryPassword = generateTemporaryPassword(12);
      }

      const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
      await prisma.user.update({
        where: { id: row.id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedLoginAttempts: 0,
          lockedUntil: null,
        },
      });
      credentialRows.push(
        `${csvEscape(row.loginName)},${csvEscape(temporaryPassword)}`,
      );
    }

    writeFileSync(
      join(privateDir, 'initial-credentials.csv'),
      `${credentialRows.join('\n')}\n`,
      'utf8',
    );
  }

  const reportPath = join(privateDir, 'login-setup-report.md');
  const section = [
    '',
    '## Initial passwords',
    '',
    `Mode: **${args.apply ? 'apply' : 'dry-run'}** (reset=${args.reset})`,
    `| Status | Count |`,
    `| --- | ---: |`,
    `| SET | ${toSet.length} |`,
    `| SKIPPED | ${skipped} |`,
    '',
  ].join('\n');

  if (existsSync(reportPath)) {
    appendFileSync(reportPath, section, 'utf8');
  } else {
    writeFileSync(
      reportPath,
      `# Login setup report\n${section}`,
      'utf8',
    );
  }

  console.log(`SET=${toSet.length} SKIPPED=${skipped}`);
  await prisma.$disconnect();
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
