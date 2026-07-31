/**
 * Standalone runner for primary-role backfill.
 * Usage: npx ts-node --transpile-only prisma/seed-fix-primary-roles.ts
 */
import { PrismaClient } from '@prisma/client';
import { fixPrimaryRoles } from './seeds/fix-primary-roles.seed';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await fixPrimaryRoles(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Fix primary roles seed failed:', error);
  process.exit(1);
});
