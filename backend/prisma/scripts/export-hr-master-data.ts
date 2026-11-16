/**
 * Export HR master / configuration data from the LOCAL database to JSON.
 *
 *   cd backend && npx ts-node --transpile-only prisma/scripts/export-hr-master-data.ts
 *
 * - Reads DATABASE_URL (local DB) only; read-only queries.
 * - Writes prisma/data/export/<table>.json (git-ignored: contains employee PII).
 * - Secrets (password hashes, OTPs, MFA/lockout state) are excluded with Prisma
 *   `omit`, so they are never loaded into memory.
 * - Logs row counts only, never row contents.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  EXPORT_DIR_SEGMENTS,
  SECRET_SETTING_KEY,
  TABLES,
  USER_OMIT,
} from './hr-master-data.tables';

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname : '';
  } catch {
    return '';
  }
}

async function main(): Promise<void> {
  const localUrl = process.env.DATABASE_URL;
  if (!localUrl) throw new Error('DATABASE_URL is not set');
  const prodHosts = [process.env.PROD_DATABASE_URL, process.env.PROD_DIRECT_URL].map(hostOf);
  if (prodHosts.includes(hostOf(localUrl)) || /supabase/i.test(hostOf(localUrl))) {
    throw new Error('DATABASE_URL points at the production host; refusing to export from it.');
  }

  const outDir = path.join(process.cwd(), ...EXPORT_DIR_SEGMENTS);
  fs.mkdirSync(outDir, { recursive: true });

  const prisma = new PrismaClient({ datasources: { db: { url: localUrl } } });
  const counts: Array<[string, number]> = [];
  try {
    for (const t of TABLES) {
      const delegate = (prisma as any)[t.model];
      if (!delegate) throw new Error(`Unknown Prisma model delegate: ${t.model}`);

      const omit = t.omit?.length
        ? Object.fromEntries(t.omit.map((f) => [f, true]))
        : undefined;
      let rows: Record<string, unknown>[] = await delegate.findMany({
        where: t.where,
        omit,
        orderBy: { id: 'asc' },
      });

      // Defence in depth: never write secret columns even if omit were ignored.
      if (t.model === 'user') {
        for (const r of rows) for (const f of USER_OMIT) delete r[f];
      }
      if (t.model === 'companySetting') {
        rows = rows.filter((r) => !SECRET_SETTING_KEY.test(String(r.key)));
      }

      // Decimal -> string, Date -> ISO string via their toJSON().
      fs.writeFileSync(path.join(outDir, t.file), JSON.stringify(rows, null, 2) + '\n', 'utf8');
      counts.push([t.label, rows.length]);
      console.log(`Exported ${rows.length} ${t.label} rows -> ${t.file}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  const total = counts.reduce((s, [, n]) => s + n, 0);
  console.log(`\nExport complete. ${counts.length} tables, ${total} total rows -> ${outDir}`);
}

main().catch((err) => {
  console.error('Export failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
