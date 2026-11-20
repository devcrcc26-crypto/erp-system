/**
 * Soft-deletes every employee_per_diem_rate row so requests fall back to the
 * employee-entered rate flow until official rates are confirmed and re-seeded.
 *
 * Does not drop the table or change schema. Existing per diem requests keep
 * their stored dailyRate / totals; only the rate-table rows are cleared
 * (soft-delete) so lookups stop matching.
 *
 * // Per diem rates cleared Nov 2026 — re-seed when official rates are confirmed
 *
 * Usage (from backend/):
 *   npx ts-node --transpile-only scripts/clear-employee-per-diem-rates.ts
 *
 * Optional dry run:
 *   DRY_RUN=1 npx ts-node --transpile-only scripts/clear-employee-per-diem-rates.ts
 */
import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  const dryRun = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

  try {
    // Per diem rates cleared Nov 2026 — re-seed when official rates are confirmed
    const activeCount = await prisma.employeePerDiemRate.count({
      where: { deletedAt: null },
    });

    console.log(
      `Found ${activeCount} active employee_per_diem_rate row(s) to clear.`,
    );

    if (activeCount === 0) {
      console.log('Nothing to do.');
      return;
    }

    if (dryRun) {
      console.log('DRY_RUN=1 — no rows updated.');
      return;
    }

    const clearedAt = new Date();
    const result = await prisma.employeePerDiemRate.updateMany({
      where: { deletedAt: null },
      data: {
        deletedAt: clearedAt,
        deletedBy: null,
        updatedAt: clearedAt,
      },
    });

    console.log(
      `Soft-deleted ${result.count} employee_per_diem_rate row(s) at ${clearedAt.toISOString()}.`,
    );
    console.log(
      'Re-seed official rates via HR Employee Per Diem Rates (or upsert scripts) when confirmed.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
