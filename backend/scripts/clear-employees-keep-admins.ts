/**
 * Clear all non–System Administrator users and all employee contracts.
 *
 * Keeps: users who hold an active System Administrator role (and their
 * System Administrator user_role rows).
 * Deletes: every other user (+ sessions, roles, tokens) and ALL contracts.
 *
 * Usage (from backend/):
 *   $env:SEED_MODE='true'
 *   npx ts-node --transpile-only scripts/clear-employees-keep-admins.ts
 */
import { PrismaClient } from '@prisma/client';
import { assertLocalhostSeedGuards } from './lib/localhost-seed-guard';

async function main(): Promise<void> {
  assertLocalhostSeedGuards({ requireDatabase: 'pwf_fresh' });

  const prisma = new PrismaClient();
  try {
    const admins = await prisma.user.findMany({
      where: {
        deletedAt: null,
        userRoles: {
          some: {
            deletedAt: null,
            role: { name: 'System Administrator', deletedAt: null },
          },
        },
      },
      select: {
        id: true,
        email: true,
        employeeId: true,
        firstName: true,
        lastName: true,
      },
    });

    if (admins.length === 0) {
      throw new Error('No System Administrator users found - aborting');
    }

    const adminIds = admins.map((a) => a.id);
    console.log('Keeping System Administrators:');
    for (const a of admins) {
      console.log(
        `  ${a.employeeId ?? '(no id)'}  ${a.firstName} ${a.lastName}  ${a.email}`,
      );
    }

    const contractDelete = await prisma.employeeContract.deleteMany({});
    console.log(`Deleted employee contracts: ${contractDelete.count}`);

    const toDelete = await prisma.user.findMany({
      where: { id: { notIn: adminIds }, deletedAt: null },
      select: { id: true, employeeId: true, email: true, firstName: true, lastName: true },
    });
    console.log(`Users to delete: ${toDelete.length}`);

    // Clear person FKs that may point at departing users
    await prisma.department.updateMany({
      where: { leaderUserId: { in: toDelete.map((u) => u.id) } },
      data: { leaderUserId: null },
    });
    await prisma.discipline.updateMany({
      where: {
        OR: [
          { leaderId: { in: toDelete.map((u) => u.id) } },
          { localLeaderId: { in: toDelete.map((u) => u.id) } },
        ],
      },
      data: { leaderId: null, localLeaderId: null },
    });
    await prisma.user.updateMany({
      where: { reportsToUserId: { in: toDelete.map((u) => u.id) } },
      data: { reportsToUserId: null },
    });

    for (const user of toDelete) {
      await prisma.$transaction(async (tx) => {
        await tx.userSession.deleteMany({ where: { userId: user.id } });
        await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
        await tx.emailVerificationToken.deleteMany({ where: { userId: user.id } });
        await tx.userRole.deleteMany({ where: { userId: user.id } });
        await tx.notificationPreference.deleteMany({ where: { userId: user.id } });
        await tx.notification.deleteMany({ where: { recipientId: user.id } });
        await tx.user.delete({ where: { id: user.id } });
      });
      console.log(
        `  deleted ${user.employeeId ?? user.id}  ${user.firstName} ${user.lastName}`,
      );
    }

    // Drop non-admin roles on kept admins (keep System Administrator only)
    for (const admin of admins) {
      const removed = await prisma.userRole.deleteMany({
        where: {
          userId: admin.id,
          role: { name: { not: 'System Administrator' } },
        },
      });
      if (removed.count > 0) {
        console.log(
          `  cleared ${removed.count} non-admin role(s) on ${admin.employeeId ?? admin.email}`,
        );
      }
    }

    await prisma.$executeRawUnsafe(
      `SELECT setval('employee_contract_number_seq', 1, false)`,
    );

    const remaining = await prisma.user.findMany({
      where: { deletedAt: null },
      select: {
        employeeId: true,
        email: true,
        firstName: true,
        lastName: true,
        userRoles: {
          where: { deletedAt: null },
          select: { role: { select: { name: true } } },
        },
      },
    });
    const contractsLeft = await prisma.employeeContract.count();

    console.log('\n=== Clear complete ===');
    console.log(`Remaining users: ${remaining.length}`);
    for (const u of remaining) {
      console.log(
        `  ${u.employeeId ?? '(no id)'}  ${u.firstName} ${u.lastName}  ${u.email}  [${u.userRoles.map((r) => r.role.name).join(', ')}]`,
      );
    }
    console.log(`Employee contracts remaining: ${contractsLeft}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('clear-employees-keep-admins failed:', error);
  process.exit(1);
});
