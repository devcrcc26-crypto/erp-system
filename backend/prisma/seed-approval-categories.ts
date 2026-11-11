/**
 * Standalone runner for approval category seed.
 * Usage: npx ts-node --transpile-only prisma/seed-approval-categories.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { seedApprovalCategories } from './seeds/approval-categories.seed';

/** Waits for a free pooler connection (Supabase cold start or pool exhaustion). */
async function waitForDatabase(
  prisma: PrismaClient,
  maxAttempts = 8,
  delayMs = 8_000,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      if (attempt > 1) {
        console.log('Database connection established.');
      }
      return;
    } catch (error: unknown) {
      const poolTimeout =
        error instanceof PrismaClientKnownRequestError &&
        error.code === 'P2024';
      const initFail = error instanceof PrismaClientKnownRequestError;
      if (attempt === maxAttempts) {
        throw new Error(
          poolTimeout
            ? 'Database connection pool exhausted (limit 5). Stop the Nest API and any other prisma scripts, wait ~30s, then retry.'
            : 'Database unreachable. Check Supabase is awake and DATABASE_URL is correct.',
          { cause: error },
        );
      }
      const reason = poolTimeout
        ? 'pool busy'
        : initFail
          ? 'not ready'
          : 'unreachable';
      console.log(
        `Database ${reason} (attempt ${attempt}/${maxAttempts}), retrying in ${delayMs / 1000}s...`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await waitForDatabase(prisma);
    await seedApprovalCategories(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Approval categories seed failed:', error);
  process.exit(1);
});
