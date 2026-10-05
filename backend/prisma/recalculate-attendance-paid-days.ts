/**
 * One-off: recompute absentDays/paidDays and daily log status from dayDeduction.
 * Usage: npx ts-node --transpile-only prisma/recalculate-attendance-paid-days.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const { AttendanceService } = await import(
    '../src/modules/attendance/application/services/attendance.service'
  );
  // Minimal inline recalc without Nest bootstrap — use raw service pattern via records loop.
  const records = await prisma.attendanceRecord.findMany({
    select: {
      id: true,
      companyId: true,
      employeeId: true,
      month: true,
      year: true,
      absentDays: true,
      paidDays: true,
    },
    orderBy: [{ year: 'asc' }, { month: 'asc' }],
  });

  const before = records.map((r) => ({
    id: r.id,
    absent: Number(r.absentDays),
    paid: Number(r.paidDays),
  }));

  const byCompanyMonth = new Map<string, { companyId: string; month: number; year: number }>();
  for (const r of records) {
    byCompanyMonth.set(`${r.companyId}:${r.year}:${r.month}`, {
      companyId: r.companyId,
      month: r.month,
      year: r.year,
    });
  }

  // Dynamic import Nest context is heavy; use AttendanceService via compiled dist if available.
  // Fallback: invoke recalc SQL-only path through prisma script duplication is avoided —
  // run via Nest application context.
  const { NestFactory } = await import('@nestjs/core');
  const { AppModule } = await import('../src/app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const attendance = app.get(AttendanceService);

  for (const bucket of byCompanyMonth.values()) {
    await attendance.recalculateCompanyAttendanceMonth(
      bucket.companyId,
      bucket.month,
      bucket.year,
    );
  }

  await app.close();

  const afterRows = await prisma.attendanceRecord.findMany({
    select: { id: true, absentDays: true, paidDays: true },
  });
  const afterMap = new Map(afterRows.map((r) => [r.id, r]));

  const changes: Array<{
    id: string;
    absentDelta: number;
    paidDelta: number;
  }> = [];

  for (const row of before) {
    const next = afterMap.get(row.id);
    if (!next) {
      continue;
    }
    const absentDelta =
      Math.round((Number(next.absentDays) - row.absent) * 100) / 100;
    const paidDelta =
      Math.round((Number(next.paidDays) - row.paid) * 100) / 100;
    if (absentDelta !== 0 || paidDelta !== 0) {
      changes.push({ id: row.id, absentDelta, paidDelta });
    }
  }

  changes.sort(
    (a, b) =>
      Math.abs(b.paidDelta) + Math.abs(b.absentDelta) -
      (Math.abs(a.paidDelta) + Math.abs(a.absentDelta)),
  );

  console.log(`Recalculated ${records.length} attendance record(s).`);
  console.log(`${changes.length} record(s) changed.`);
  console.log('Top 5 largest changes (by paid-day delta magnitude):');
  for (const change of changes.slice(0, 5)) {
    console.log(
      `  ${change.id}: absent Δ ${change.absentDelta}, paid Δ ${change.paidDelta}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
