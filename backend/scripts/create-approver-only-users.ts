/**
 * Create approver-only users from a private JSON file.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/create-approver-only-users.ts
 *   npx ts-node -r tsconfig-paths/register scripts/create-approver-only-users.ts --apply
 *
 * Input: backend/data/private/approver-only-users.json
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
  matchApproverEntry,
  splitPinyinFullName,
  type ApproverEntry,
  type ExistingUserMatch,
} from '../src/shared/org-import/approver-entry-match';
import {
  assertCredentialsPathGitignored,
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';
import { appendInitialCredentials } from './lib/credentials-csv';

const BCRYPT_ROUNDS = 12;
const EXCLUDED_REASON = 'Approver only';

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

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user'
      AND column_name = 'excluded_from_hr_processes'
  `;
  if (columns.length === 0) {
    console.error(
      'Stopped: User.excludedFromHrProcesses does not exist yet. Add the column/migration before creating approver-only users.',
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const privateDir = join(__dirname, '..', 'data', 'private');
  if (!existsSync(privateDir)) {
    mkdirSync(privateDir, { recursive: true });
  }

  const inputPath = join(privateDir, 'approver-only-users.json');
  if (!existsSync(inputPath)) {
    console.error(`Refused: missing input file ${inputPath}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(inputPath, 'utf8')) as ApproverEntry[];
  if (!Array.isArray(raw)) {
    console.error('Refused: approver-only-users.json must be an array.');
    await prisma.$disconnect();
    process.exit(1);
  }

  console.log(
    `[create-approver-only-users] ${args.apply ? 'apply' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const company = await prisma.company.findFirst({
    where: { deletedAt: null },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!company) {
    console.error('Refused: no company found.');
    await prisma.$disconnect();
    process.exit(1);
  }

  const defaultRole = await prisma.role.findFirst({
    where: {
      companyId: company.id,
      deletedAt: null,
      name: { equals: 'Employee', mode: 'insensitive' },
    },
    select: { id: true, name: true },
  });

  const allUsers = await prisma.user.findMany({
    where: { companyId: company.id, deletedAt: null },
    select: {
      id: true,
      loginNameNormalized: true,
      chineseName: true,
      firstName: true,
      middleName: true,
      lastName: true,
    },
  });

  const byLogin = new Map<string, ExistingUserMatch>();
  const byChinese = new Map<string, ExistingUserMatch>();
  for (const user of allUsers) {
    const row: ExistingUserMatch = {
      id: user.id,
      loginNameNormalized: user.loginNameNormalized,
      chineseName: user.chineseName,
      firstName: user.firstName,
      middleName: user.middleName,
      lastName: user.lastName,
    };
    if (user.loginNameNormalized) {
      byLogin.set(user.loginNameNormalized, row);
    }
    if (user.chineseName?.trim()) {
      byChinese.set(user.chineseName.trim(), row);
    }
  }

  let created = 0;
  let exists = 0;
  let collisions = 0;
  let skipped = 0;
  const existsLines: string[] = [];
  const collisionLines: string[] = [];
  const credentialRows: Array<{ loginName: string; temporaryPassword: string }> =
    [];

  const actorId = (
    await prisma.user.findFirst({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    })
  )?.id;
  if (!actorId && args.apply) {
    console.error('Refused: no actor user for createdBy.');
    process.exit(1);
  }

  for (const entry of raw) {
    const fullName = entry.fullName?.trim();
    if (!fullName) {
      skipped += 1;
      continue;
    }

    const loginName = fullName;
    const loginNameNormalized = normalizeLoginName(loginName);
    const match = matchApproverEntry(entry, byLogin, byChinese);

    if (match.kind === 'EXISTS') {
      exists += 1;
      existsLines.push(`${fullName} → ${match.userId} (${match.via})`);
      if (args.apply && entry.chineseName?.trim() && actorId) {
        await prisma.user.update({
          where: { id: match.userId },
          data: {
            chineseName: entry.chineseName.trim(),
            updatedBy: actorId,
          },
        });
      }
      continue;
    }
    if (match.kind === 'COLLISION') {
      collisions += 1;
      collisionLines.push(`${fullName} → ${match.userId} (${match.reason})`);
      continue;
    }

    const { lastName, firstName, middleName } = splitPinyinFullName(fullName);
    const roleName = entry.role?.trim() || defaultRole?.name || 'Employee';

    if (!args.apply) {
      created += 1;
      console.log(`CREATED (dry): ${loginName} role=${roleName}`);
      continue;
    }

    let temporaryPassword = generateTemporaryPassword(12);
    while (normalizeLoginName(temporaryPassword) === loginNameNormalized) {
      temporaryPassword = generateTemporaryPassword(12);
    }
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        firstName,
        lastName,
        middleName,
        chineseName: entry.chineseName?.trim() || null,
        loginName,
        loginNameNormalized,
        email: null,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        employmentStatus: 'ACTIVE',
        createdBy: actorId!,
        updatedBy: actorId!,
        excludedFromHrProcesses: true,
        excludedReason: EXCLUDED_REASON,
      } as never,
      select: { id: true },
    });

    byLogin.set(loginNameNormalized, {
      id: user.id,
      loginNameNormalized,
      chineseName: entry.chineseName?.trim() ?? null,
      firstName,
      middleName,
      lastName,
    });

    const role = entry.role?.trim()
      ? await prisma.role.findFirst({
          where: {
            companyId: company.id,
            deletedAt: null,
            name: { equals: entry.role.trim(), mode: 'insensitive' },
          },
          select: { id: true },
        })
      : defaultRole;

    if (role) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: role.id,
          isPrimary: true,
          assignedBy: actorId!,
          createdBy: actorId!,
          updatedBy: actorId!,
        },
      });
    }

    credentialRows.push({ loginName, temporaryPassword });
    created += 1;
  }

  if (args.apply && credentialRows.length > 0) {
    appendInitialCredentials(privateDir, credentialRows);
  }

  const reportPath = join(privateDir, 'login-setup-report.md');
  const section = [
    '',
    '## Approver-only users',
    '',
    `Mode: **${args.apply ? 'apply' : 'dry-run'}**`,
    `| Status | Count |`,
    `| --- | ---: |`,
    `| CREATED | ${created} |`,
    `| EXISTS | ${exists} |`,
    `| COLLISION | ${collisions} |`,
    `| SKIPPED | ${skipped} |`,
    '',
    '### EXISTS',
    ...(existsLines.length ? existsLines.map((l) => `- ${l}`) : ['- (none)']),
    '',
    '### COLLISION',
    ...(collisionLines.length
      ? collisionLines.map((l) => `- ${l}`)
      : ['- (none)']),
    '',
  ].join('\n');

  if (existsSync(reportPath)) {
    appendFileSync(reportPath, section, 'utf8');
  } else {
    writeFileSync(reportPath, `# Login setup report\n${section}`, 'utf8');
  }

  console.log(
    `CREATED=${created} EXISTS=${exists} COLLISION=${collisions} SKIPPED=${skipped}`,
  );
  await prisma.$disconnect();
}

main().catch(async (err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
