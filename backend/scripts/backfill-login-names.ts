/**
 * Backfill User.loginName / loginNameNormalized from displayed full name.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-login-names.ts
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-login-names.ts --apply
 *
 * Dry-run by default. Non-localhost requires --allow-remote.
 * Collisions leave loginName null for both and are listed by id only.
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import {
  formatDisplayFullName,
  normalizeLoginName,
} from '../src/modules/auth/application/utils/login-name.util';
import {
  assertCredentialsPathGitignored,
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';

async function main(): Promise<void> {
  assertSeedMode();
  const args = parseLoginSetupArgs(process.argv.slice(2));
  const target = resolveDatabaseTarget(args.allowRemote);

  const rootGitignore = join(__dirname, '..', '..', '.gitignore');
  assertCredentialsPathGitignored(
    readFileSync(rootGitignore, 'utf8'),
    'backend/data/private/login-setup-report.md',
  );

  const prisma = new PrismaClient();
  const privateDir = join(__dirname, '..', 'data', 'private');
  if (!existsSync(privateDir)) {
    mkdirSync(privateDir, { recursive: true });
  }

  console.log(
    `[backfill-login-names] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      loginName: true,
      loginNameNormalized: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  type Candidate = {
    id: string;
    loginName: string;
    loginNameNormalized: string;
  };

  const skipped: string[] = [];
  const candidates: Candidate[] = [];

  for (const user of users) {
    if (user.loginName && user.loginNameNormalized) {
      skipped.push(user.id);
      continue;
    }
    const loginName = formatDisplayFullName({
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
    });
    if (!loginName) {
      skipped.push(user.id);
      continue;
    }
    candidates.push({
      id: user.id,
      loginName,
      loginNameNormalized: normalizeLoginName(loginName),
    });
  }

  const byNorm = new Map<string, Candidate[]>();
  for (const c of candidates) {
    const list = byNorm.get(c.loginNameNormalized) ?? [];
    list.push(c);
    byNorm.set(c.loginNameNormalized, list);
  }

  // Also collide with already-set normalised names.
  const existingNorm = new Set(
    users
      .filter((u) => u.loginNameNormalized)
      .map((u) => u.loginNameNormalized as string),
  );

  const toSet: Candidate[] = [];
  const collisions: string[][] = [];

  for (const [norm, group] of byNorm) {
    const hitsExisting = existingNorm.has(norm);
    if (hitsExisting || group.length > 1) {
      collisions.push(group.map((g) => g.id));
      continue;
    }
    toSet.push(group[0]!);
  }

  if (args.apply) {
    for (const c of toSet) {
      await prisma.user.update({
        where: { id: c.id },
        data: {
          loginName: c.loginName,
          loginNameNormalized: c.loginNameNormalized,
        },
      });
    }
  }

  const report = [
    '# Login name backfill',
    '',
    `Mode: **${args.apply ? 'apply' : 'dry-run'}**`,
    `Host: \`${target.host}\` / \`${target.database}\``,
    '',
    `| Status | Count |`,
    `| --- | ---: |`,
    `| SET | ${toSet.length} |`,
    `| COLLISION | ${collisions.length} groups (${collisions.reduce((n, g) => n + g.length, 0)} users) |`,
    `| SKIPPED | ${skipped.length} |`,
    '',
    '## Collision user ids',
    '',
    ...(collisions.length
      ? collisions.map((ids) => `- ${ids.join(', ')}`)
      : ['- (none)']),
    '',
  ].join('\n');

  writeFileSync(join(privateDir, 'login-setup-report.md'), report, 'utf8');

  console.log(
    `SET=${toSet.length} COLLISION_GROUPS=${collisions.length} SKIPPED=${skipped.length}`,
  );

  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
