/**
 * Clears lastName where it only repeats middleName (Ethiopian names: the unknown
 * grandfather's name was filled with the father's name).
 *
 *   $env:SEED_MODE='true'
 *   npx ts-node -T -r tsconfig-paths/register scripts/clear-duplicate-lastname.ts
 *   npx ts-node -T -r tsconfig-paths/register scripts/clear-duplicate-lastname.ts --apply
 *   npx ts-node -T -r tsconfig-paths/register scripts/clear-duplicate-lastname.ts --restore <csv>
 *   npx ts-node -T -r tsconfig-paths/register scripts/clear-duplicate-lastname.ts --restore <csv> --apply
 *
 * Dry run by default. Targets non-deleted users of the first company whose lastName equals
 * middleName (case- and space-insensitive), except employeeIds in
 * data/private/lastname-keep.json. --apply first writes
 * data/private/lastname-backup-<timestamp>.csv (userId, employeeId, old lastName), then sets
 * lastName = '' in one transaction with one audit entry (batch id).
 *
 * --restore puts the CSV's old lastName back, only where lastName is still ''.
 * Prints counts only; names stay in the private CSV.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { randomUUID } from 'crypto';
import { AuditLogSource, PrismaClient } from '@prisma/client';
import {
  assertSeedMode,
  parseLoginSetupArgs,
  resolveDatabaseTarget,
} from './lib/login-setup-guards';
import {
  lastNameRepeatsMiddle,
  parseLastNameBackupCsv,
  toLastNameBackupCsv,
} from '../src/shared/user-names/duplicate-lastname';

const AUDIT_MODULE = 'users';
const PRIVATE_DIR = join(__dirname, '..', 'data', 'private');
const KEEP_PATH = join(PRIVATE_DIR, 'lastname-keep.json');

function loadKeepList(): Set<string> {
  if (!existsSync(KEEP_PATH)) {
    writeFileSync(KEEP_PATH, '[]\n', 'utf8');
    console.log(`Created empty keep-list: ${KEEP_PATH}`);
  }
  const raw = JSON.parse(readFileSync(KEEP_PATH, 'utf8')) as unknown;
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string')) {
    throw new Error('lastname-keep.json must be a JSON array of employeeId strings');
  }
  return new Set((raw as string[]).map((id) => id.trim()).filter(Boolean));
}

function parseRestorePath(argv: string[]): string | null {
  const index = argv.indexOf('--restore');
  if (index === -1) return null;
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    console.error('Refused: --restore needs a CSV path.');
    process.exit(1);
  }
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

async function main(): Promise<void> {
  assertSeedMode();
  const argv = process.argv.slice(2);
  const args = parseLoginSetupArgs(argv);
  const target = resolveDatabaseTarget(args.allowRemote);
  const restorePath = parseRestorePath(argv);
  const mode = restorePath ? 'restore' : 'clear';

  console.log(
    `[clear-duplicate-lastname] ${mode} ${args.apply ? 'APPLY' : 'dry-run'} host=${target.host} db=${target.database}`,
  );

  const prisma = new PrismaClient();
  try {
    const company = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!company) throw new Error('No company found.');
    const actorId = (
      await prisma.user.findFirst({
        where: { companyId: company.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      })
    )?.id;
    if (!actorId) throw new Error('No actor user found.');

    if (restorePath) {
      await restore(prisma, company.id, actorId, restorePath, args.apply);
    } else {
      await clear(prisma, company.id, actorId, args.apply);
    }
  } finally {
    await prisma.$disconnect();
  }
}

async function clear(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  apply: boolean,
): Promise<void> {
  const keep = loadKeepList();
  const users = await prisma.user.findMany({
    where: { companyId, deletedAt: null },
    select: { id: true, employeeId: true, middleName: true, lastName: true },
    orderBy: { employeeId: 'asc' },
  });
  const matching = users.filter(lastNameRepeatsMiddle);
  const kept = matching.filter((u) => u.employeeId && keep.has(u.employeeId));
  const targets = matching.filter((u) => !(u.employeeId && keep.has(u.employeeId)));
  const keepNotFound = [...keep].filter(
    (id) => !users.some((u) => u.employeeId === id),
  ).length;

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = join(PRIVATE_DIR, `lastname-backup-${stamp}.csv`);

  console.log(
    `users=${users.length} lastNameEqualsMiddle=${matching.length} skippedByKeepList=${kept.length} targets=${targets.length} keepListEntries=${keep.size} keepListNotFound=${keepNotFound}`,
  );

  if (!apply) {
    console.log(`Dry run: nothing written. --apply would back up to ${backupPath}`);
    return;
  }
  if (targets.length === 0) {
    console.log('Nothing to clear.');
    return;
  }

  writeFileSync(
    backupPath,
    toLastNameBackupCsv(
      targets.map((u) => ({
        userId: u.id,
        employeeId: u.employeeId ?? '',
        lastName: u.lastName,
      })),
    ),
    'utf8',
  );
  console.log(`Backup written: ${backupPath}`);

  const batchId = randomUUID();
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: { id: { in: targets.map((u) => u.id) }, deletedAt: null },
      data: { lastName: '', updatedBy: actorId },
    });
    if (updated.count !== targets.length) {
      throw new Error(`Expected ${targets.length} updates, got ${updated.count}; rolled back.`);
    }
    await tx.auditLog.create({
      data: {
        companyId,
        userId: actorId,
        source: AuditLogSource.SYSTEM_JOB,
        module: AUDIT_MODULE,
        action: 'LASTNAME_DUPLICATE_CLEARED',
        recordType: 'User',
        recordId: batchId,
        recordReference: backupPath.split(/[\\/]/).pop(),
        batchId,
        beforeValue: { rule: 'lastName equals middleName', count: targets.length },
        afterValue: { lastName: '', userIds: targets.map((u) => u.id) },
      },
    });
  });
  console.log(`Applied: cleared ${targets.length} (batch ${batchId}).`);
}

async function restore(
  prisma: PrismaClient,
  companyId: string,
  actorId: string,
  csvPath: string,
  apply: boolean,
): Promise<void> {
  if (!existsSync(csvPath)) throw new Error(`Backup not found: ${csvPath}`);
  const rows = parseLastNameBackupCsv(readFileSync(csvPath, 'utf8'));
  const current = await prisma.user.findMany({
    where: { companyId, id: { in: rows.map((r) => r.userId) }, deletedAt: null },
    select: { id: true, lastName: true },
  });
  const byId = new Map(current.map((u) => [u.id, u]));
  const restorable = rows.filter((r) => byId.get(r.userId)?.lastName === '');
  const missing = rows.filter((r) => !byId.has(r.userId)).length;
  const changedSince = rows.length - restorable.length - missing;

  console.log(
    `backupRows=${rows.length} restorable=${restorable.length} changedSince=${changedSince} missingOrDeleted=${missing}`,
  );
  if (!apply) {
    console.log('Dry run: nothing written.');
    return;
  }
  if (restorable.length === 0) {
    console.log('Nothing to restore.');
    return;
  }

  const batchId = randomUUID();
  await prisma.$transaction(async (tx) => {
    for (const row of restorable) {
      const updated = await tx.user.updateMany({
        where: { id: row.userId, lastName: '', deletedAt: null },
        data: { lastName: row.lastName, updatedBy: actorId },
      });
      if (updated.count !== 1) {
        throw new Error('A row changed during restore; rolled back.');
      }
    }
    await tx.auditLog.create({
      data: {
        companyId,
        userId: actorId,
        source: AuditLogSource.SYSTEM_JOB,
        module: AUDIT_MODULE,
        action: 'LASTNAME_DUPLICATE_RESTORED',
        recordType: 'User',
        recordId: batchId,
        recordReference: csvPath.split(/[\\/]/).pop(),
        batchId,
        beforeValue: { lastName: '', count: restorable.length },
        afterValue: { userIds: restorable.map((r) => r.userId) },
      },
    });
  });
  console.log(`Applied: restored ${restorable.length} (batch ${batchId}).`);
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
