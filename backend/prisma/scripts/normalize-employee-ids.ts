/**
 * Normalizes every user's employee ID to CC-NNNN (4-digit zero-padded),
 * numbered by createdAt ASC (id ASC breaks ties): oldest → CC-0001.
 *
 * Covers ALL user rows - including users with no ID yet and soft-deleted
 * users - because `employee_id` is unique across the whole table; leaving a
 * deleted user on an old CC value could collide with a new assignment.
 *
 * Changes only `employee_id` (raw UPDATE, so `updated_at` and every other
 * column stay as they are). One transaction: it fully succeeds or fully rolls
 * back. Two passes avoid unique-constraint clashes mid-way:
 *   1. every user whose ID changes → TMP-NNNN
 *   2. TMP-NNNN → final CC-NNNN
 * Finally `employee_id_seq` is set to the highest CC number so the next
 * created employee gets MAX + 1 (see UserManagementService.nextEmployeeId).
 * The generator's advisory lock is held throughout, so no employee can be
 * created mid-renumber.
 *
 * Modes:
 *   (default)          renumber everyone by createdAt
 *   --keep-existing    keep current valid CC-NNNN IDs; number everyone else
 *                      from MAX + 1 in createdAt order
 *
 * Dry run unless --apply is passed.
 *
 * Run: cd backend && npx ts-node --transpile-only prisma/scripts/normalize-employee-ids.ts [--keep-existing] [--apply]
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PREFIX = 'CC-';
const TMP_PREFIX = 'TMP-';
const CC_PATTERN = /^CC-(\d{4})$/;
const pad = (n: number): string => String(n).padStart(4, '0');

interface UserRow {
  id: string;
  employeeId: string | null;
}

interface Assignment {
  id: string;
  from: string | null;
  to: string;
}

function planFullRenumber(users: UserRow[]): Assignment[] {
  return users.map((user, index) => ({
    id: user.id,
    from: user.employeeId,
    to: `${PREFIX}${pad(index + 1)}`,
  }));
}

function planKeepExisting(users: UserRow[]): Assignment[] {
  const kept = new Set<string>();
  for (const user of users) {
    if (user.employeeId && CC_PATTERN.test(user.employeeId)) {
      kept.add(user.employeeId);
    }
  }
  let next =
    Math.max(0, ...[...kept].map((id) => Number(id.slice(PREFIX.length)))) + 1;
  return users.map((user) => {
    if (user.employeeId && kept.has(user.employeeId)) {
      return { id: user.id, from: user.employeeId, to: user.employeeId };
    }
    const to = `${PREFIX}${pad(next)}`;
    next += 1;
    return { id: user.id, from: user.employeeId, to };
  });
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const keepExisting = process.argv.includes('--keep-existing');

  const users = await prisma.user.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, employeeId: true },
  });

  if (users.some((user) => user.employeeId?.startsWith(TMP_PREFIX))) {
    throw new Error(
      `Some employee IDs already start with ${TMP_PREFIX}; a previous run may have been interrupted. Resolve those first.`,
    );
  }

  const plan = keepExisting ? planKeepExisting(users) : planFullRenumber(users);
  const finalIds = new Set(plan.map((a) => a.to));
  if (finalIds.size !== plan.length) {
    throw new Error('Planned IDs are not unique - aborting.');
  }
  if (plan.length > 9999) {
    throw new Error('More than 9999 users - CC-NNNN cannot hold them all.');
  }

  const changes = plan.filter((a) => a.from !== a.to);
  for (const a of changes) {
    console.log(`${a.from ?? '(none)'} → ${a.to}`);
  }
  const maxNumber = Math.max(
    0,
    ...plan.map((a) => Number(a.to.slice(PREFIX.length))),
  );
  console.log(
    `\nMode: ${keepExisting ? 'keep existing CC IDs' : 'full renumber by createdAt'}. ` +
      `${changes.length} of ${plan.length} users change; ${plan.length - changes.length} unchanged. ` +
      `Next new employee will be ${PREFIX}${pad(maxNumber + 1)}.`,
  );

  if (!apply) {
    console.log('\nDry run - nothing written. Re-run with --apply to commit.');
    return;
  }

  await prisma.$transaction(
    async (tx) => {
      // Same lock as UserManagementService.nextEmployeeId: no creates mid-run.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('employee_id_seq'))`;

      // Pass 1: move every changing row onto a unique temporary value.
      for (const [index, a] of changes.entries()) {
        await tx.$executeRaw`
          UPDATE "user" SET employee_id = ${`${TMP_PREFIX}${pad(index + 1)}`}
          WHERE id = ${a.id}
        `;
      }
      // Pass 2: temporary → final.
      for (const a of changes) {
        await tx.$executeRaw`
          UPDATE "user" SET employee_id = ${a.to}
          WHERE id = ${a.id}
        `;
      }

      // Continue new employees from MAX + 1.
      if (maxNumber > 0) {
        await tx.$queryRaw`SELECT setval('employee_id_seq', ${maxNumber}::bigint, true)`;
      } else {
        await tx.$queryRaw`SELECT setval('employee_id_seq', 1, false)`;
      }
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  console.log(`\nDone. ${changes.length} employees renumbered.`);
}

main()
  .catch((error: unknown) => {
    console.error('Employee ID normalization failed (nothing committed):', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
