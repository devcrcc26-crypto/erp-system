import type { PrismaClient } from '@prisma/client';

/**
 * Display priority for choosing a primary role (lower index = preferred primary).
 * Mirrors frontend ROLE_DISPLAY_PRIORITY so System Admin stays primary when present,
 * and business roles outrank Employee for multi-role users.
 */
const ROLE_PRIMARY_PRIORITY: readonly string[] = [
  'System Administrator',
  'Managing Director',
  'General Manager',
  'Project Director',
  'Project Administrator',
  'Project Manager',
  'Chief Engineer',
  'Institute Chief',
  'Deputy Chief',
  'Department Chief',
  'Finance Manager',
  'HR Officer',
  'Procurement Officer',
  'Document Controller',
  'Planning Engineer',
  'Discipline Lead',
  'Discipline Owner',
  'Site Coordinator',
  'Site Engineer',
  'Designer',
  'Reviewer',
  'Dispatcher',
  'Accountant',
  'Storekeeper',
  'Safety Officer',
  'Client Consultant',
  'Employee',
];

function pickPrimaryRoleName(roleNames: string[]): string | null {
  if (roleNames.length === 0) {
    return null;
  }
  let best = roleNames[0];
  let bestRank = Number.POSITIVE_INFINITY;
  for (const name of roleNames) {
    const index = ROLE_PRIMARY_PRIORITY.indexOf(name);
    const rank = index === -1 ? ROLE_PRIMARY_PRIORITY.length : index;
    if (rank < bestRank) {
      bestRank = rank;
      best = name;
    }
  }
  return best;
}

/**
 * Sets is_primary on each user's highest-priority active role and prints a report.
 */
export async function fixPrimaryRoles(prisma: PrismaClient): Promise<void> {
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      userRoles: {
        where: { deletedAt: null },
        select: {
          id: true,
          roleId: true,
          isPrimary: true,
          role: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  console.log(`Fixing primary roles for ${users.length} user(s)…`);

  for (const user of users) {
    const label =
      `${user.firstName} ${user.lastName}`.trim() ||
      user.email ||
      user.id;
    const roleNames = user.userRoles.map((ur) => ur.role.name);
    const chosenName = pickPrimaryRoleName(roleNames);

    if (!chosenName) {
      console.log(`  ${label}: (no roles)`);
      continue;
    }

    const chosen = user.userRoles.find((ur) => ur.role.name === chosenName);
    if (!chosen) {
      console.log(`  ${label}: could not resolve ${chosenName}`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.userRole.updateMany({
        where: { userId: user.id, deletedAt: null, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.userRole.update({
        where: { id: chosen.id },
        data: { isPrimary: true },
      });
    });

    console.log(
      `  ${label}: primary → ${chosenName}` +
        (roleNames.length > 1 ? `  [${roleNames.join(', ')}]` : ''),
    );
  }

  console.log('Primary role fix complete.');
}
