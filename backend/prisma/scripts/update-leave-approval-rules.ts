/**
 * Updates LEAVE_REQUEST approval rules in-place (removes General Manager tier).
 * Does not wipe existing approval requests.
 *
 * Usage: npx ts-node --transpile-only prisma/scripts/update-leave-approval-rules.ts
 */
import { Prisma, PrismaClient } from '@prisma/client';

const LEAVE_RULES = [
  {
    name: 'Short leave (≤ 3 days)',
    when: { days: { lte: 3 } },
    tiers: [
      {
        role: 'DEPARTMENT_HEAD',
        label: 'Department Head',
        order: 1,
        resolver: 'ROLE',
      },
      {
        role: 'HR_MANAGER',
        label: 'HR Manager',
        order: 2,
        resolver: 'ROLE',
      },
    ],
  },
  {
    name: 'Long leave (> 3 days)',
    when: { days: { gt: 3 } },
    tiers: [
      {
        role: 'DEPARTMENT_HEAD',
        label: 'Department Head',
        order: 1,
        resolver: 'ROLE',
      },
      {
        role: 'HR_MANAGER',
        label: 'HR Manager',
        order: 2,
        resolver: 'ROLE',
      },
    ],
  },
  {
    name: 'Default',
    tiers: [
      {
        role: 'DEPARTMENT_HEAD',
        label: 'Department Head',
        order: 1,
        resolver: 'ROLE',
      },
      {
        role: 'HR_MANAGER',
        label: 'HR Manager',
        order: 2,
        resolver: 'ROLE',
      },
    ],
  },
];

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.approvalCategory.updateMany({
      where: { code: 'LEAVE_REQUEST', deletedAt: null },
      data: {
        approvalRules: LEAVE_RULES as unknown as Prisma.InputJsonValue,
      },
    });
    console.log(
      `Updated LEAVE_REQUEST approval rules on ${result.count} categor(y/ies) - GM tier removed.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
