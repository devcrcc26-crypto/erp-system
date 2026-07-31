/**
 * Standalone runner for approval category seed.
 * Usage: npx ts-node --transpile-only prisma/seed-approval-categories.ts
 */
import { PrismaClient } from '@prisma/client';
import { seedApprovalCategories } from './seeds/approval-categories.seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await seedApprovalCategories(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Approval categories seed failed:', error);
  process.exit(1);
});
