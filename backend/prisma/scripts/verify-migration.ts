/**
 * Compare HR master-data row counts between the local DB (DATABASE_URL) and
 * production (PROD_DIRECT_URL, falling back to PROD_DATABASE_URL). Read-only.
 *
 *   cd backend && npx ts-node --transpile-only prisma/scripts/verify-migration.ts
 *
 * Counts use the same filters as the export (e.g. soft-deleted users excluded).
 * Exits with code 1 if any table mismatches.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { TABLES } from './hr-master-data.tables';

async function main(): Promise<void> {
  const localUrl = process.env.DATABASE_URL;
  const prodUrl = process.env.PROD_DIRECT_URL || process.env.PROD_DATABASE_URL;
  if (!localUrl || !prodUrl) throw new Error('DATABASE_URL and PROD_DIRECT_URL/PROD_DATABASE_URL must be set');

  const local = new PrismaClient({ datasources: { db: { url: localUrl } } });
  const prodLimited = new URL(prodUrl);
  prodLimited.searchParams.set('connection_limit', '3'); // Supabase session pooler caps clients
  const prod = new PrismaClient({ datasources: { db: { url: prodLimited.toString() } } });
  const rows: Array<{ label: string; l: number; p: number }> = [];
  try {
    for (const t of TABLES) {
      const [l, p] = await Promise.all([
        (local as any)[t.model].count({ where: t.where }),
        (prod as any)[t.model].count({ where: t.where }),
      ]);
      rows.push({ label: t.label, l, p });
    }
  } finally {
    await Promise.all([local.$disconnect(), prod.$disconnect()]);
  }

  const w = Math.max(14, ...rows.map((r) => r.label.length));
  console.log(`${'Table'.padEnd(w)} | Local | Production | Match`);
  console.log(`${'-'.repeat(w)} | ----- | ---------- | -----`);
  for (const r of rows) {
    console.log(`${r.label.padEnd(w)} | ${String(r.l).padStart(5)} | ${String(r.p).padStart(10)} | ${r.l === r.p ? '✓' : '✗'}`);
  }
  const bad = rows.filter((r) => r.l !== r.p);
  console.log(bad.length ? `\n${bad.length} mismatch(es): ${bad.map((r) => r.label).join(', ')}` : '\nAll tables match.');
  if (bad.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Verification failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
