/**
 * Create approver-only users from a private JSON file.
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -r tsconfig-paths/register scripts/create-approver-only-users.ts
 *   npx ts-node -r tsconfig-paths/register scripts/create-approver-only-users.ts --apply
 *
 * Input: backend/data/private/approver-only-users.json
 *   [{ "fullName": "…", "role": null }]
 *
 * Stops if User.excludedFromHrProcesses does not exist yet.
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
const EXCLUDED_REASON = 'Approver only';

type ApproverInput = { fullName: string; role: string | null };

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

  const raw = JSON.parse(readFileSync(inputPath, 'utf8')) as ApproverInput[];
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

  let created = 0;
  let collisions = 0;
  let skipped = 0;
  const roleToAssign: string[] = [];
  const collisionIds: string[] = [];
  const credentialRows: string[] = [];

  let chainsNeedingApprovers: Array<{ id: string; name: string }> = [];
  try {
    chainsNeedingApprovers = await prisma.$queryRaw<
      Array<{ id: string; name: string }>
    >`
      SELECT id, name FROM approval_workflow
      WHERE company_id = ${company.id} AND deleted_at IS NULL
      LIMIT 50
    `;
  } catch {
    chainsNeedingApprovers = [];
  }

  for (const entry of raw) {
    const fullName = entry.fullName?.trim();
    if (!fullName) {
      skipped += 1;
      continue;
    }
    const loginName = fullName;
    const loginNameNormalized = normalizeLoginName(loginName);

    const existing = await prisma.user.findFirst({
      where: { loginNameNormalized },
      select: { id: true },
    });
    if (existing) {
      collisions += 1;
      collisionIds.push(existing.id);
      continue;
    }

    const parts = fullName.split(/\s+/);
    const firstName = parts[0] ?? fullName;
    const lastName = parts.length > 1 ? parts[parts.length - 1]! : '';
    const middleName =
      parts.length > 2 ? parts.slice(1, -1).join(' ') : null;

    const roleName = entry.role?.trim() || defaultRole?.name || 'Employee';
    roleToAssign.push(`${loginName} → role to assign: ${roleName}`);

    if (!args.apply) {
      created += 1;
      continue;
    }

    let temporaryPassword = generateTemporaryPassword(12);
    while (normalizeLoginName(temporaryPassword) === loginNameNormalized) {
      temporaryPassword = generateTemporaryPassword(12);
    }
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_ROUNDS);
    const actorId = (
      await prisma.user.findFirst({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
      })
    )?.id;
    if (!actorId) {
      console.error('Refused: no actor user for createdBy.');
      process.exit(1);
    }

    // Fields excludedFromHrProcesses / excludedReason exist only after that migration.
    const user = await prisma.user.create({
      data: {
        companyId: company.id,
        firstName,
        lastName,
        middleName,
        loginName,
        loginNameNormalized,
        email: null,
        passwordHash,
        mustChangePassword: true,
        isActive: true,
        createdBy: actorId,
        updatedBy: actorId,
        excludedFromHrProcesses: true,
        excludedReason: EXCLUDED_REASON,
      } as never,
      select: { id: true },
    });

    const role =
      entry.role?.trim()
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
          assignedBy: actorId,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
    }

    credentialRows.push(
      `${csvEscape(loginName)},${csvEscape(temporaryPassword)}`,
    );
    created += 1;
  }

  if (args.apply && credentialRows.length > 0) {
    const csvPath = join(privateDir, 'initial-credentials.csv');
    const headerNeeded = !existsSync(csvPath);
    appendFileSync(
      csvPath,
      `${headerNeeded ? 'login_name,temporary_password\n' : ''}${credentialRows.join('\n')}\n`,
      'utf8',
    );
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
    `| COLLISION | ${collisions} |`,
    `| SKIPPED | ${skipped} |`,
    '',
    '### Roles to assign',
    ...roleToAssign.map((line) => `- ${line}`),
    '',
    '### Approval chains that would need these users (not modified)',
    ...(chainsNeedingApprovers.length
      ? chainsNeedingApprovers.map((c) => `- ${c.id} ${c.name}`)
      : ['- (none listed / model unavailable)']),
    '',
    '### Collision existing user ids',
    ...(collisionIds.length
      ? collisionIds.map((id) => `- ${id}`)
      : ['- (none)']),
    '',
  ].join('\n');

  if (existsSync(reportPath)) {
    appendFileSync(reportPath, section, 'utf8');
  } else {
    writeFileSync(reportPath, `# Login setup report\n${section}`, 'utf8');
  }

  console.log(
    `CREATED=${created} COLLISION=${collisions} SKIPPED=${skipped}`,
  );
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
