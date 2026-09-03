import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Assigns sequential employee IDs (EM-001, EM-002, ...) to every non-deleted
 * user, ordered alphabetically by full name (firstName + " " + lastName).
 *
 * Existing employeeId values are overwritten. Because employeeId is unique,
 * all values are cleared first so re-numbering cannot collide mid-way.
 *
 * Usage: ts-node prisma/scripts/assign-employee-ids.ts [--dry-run]
 */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');

  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, firstName: true, lastName: true, employeeId: true },
  });

  const sorted = [...users].sort((a, b) => {
    const nameA = `${a.firstName} ${a.lastName}`.trim();
    const nameB = `${b.firstName} ${b.lastName}`.trim();
    return nameA.localeCompare(nameB, undefined, { sensitivity: 'base' });
  });

  const assignments = sorted.map((user, index) => ({
    user,
    employeeId: `EM-${String(index + 1).padStart(3, '0')}`,
  }));

  for (const { user, employeeId } of assignments) {
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    const from = user.employeeId ?? '(none)';
    console.log(`${employeeId}  ${fullName}  [was ${from}]`);
  }

  if (dryRun) {
    console.log(`\nDry run: ${assignments.length} users would be updated.`);
    return;
  }

  await prisma.$transaction([
    prisma.user.updateMany({
      where: { deletedAt: null },
      data: { employeeId: null },
    }),
    ...assignments.map(({ user, employeeId }) =>
      prisma.user.update({
        where: { id: user.id },
        data: { employeeId },
      }),
    ),
  ]);

  console.log(`\nDone: ${assignments.length} users updated.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
