/**
 * Sets ApprovalCategory.isUserRequestable = false for PAYROLL_RUN on all companies.
 * Does not clear or reseed other categories.
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only prisma/scripts/set-payroll-run-not-user-requestable.ts
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const result = await prisma.approvalCategory.updateMany({
      where: { code: 'PAYROLL_RUN', deletedAt: null },
      data: { isUserRequestable: false },
    });
    console.log(
      `Updated ${result.count} PAYROLL_RUN approval categor(ies) to isUserRequestable=false`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
