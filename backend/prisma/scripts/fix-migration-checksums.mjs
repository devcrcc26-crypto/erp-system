/**
 * Recompute Prisma migration checksums for migrations that were edited after apply.
 * Updates _prisma_migrations.checksum to match current migration.sql files.
 *
 * Usage (from backend/):
 *   node prisma/scripts/fix-migration-checksums.mjs
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsRoot = join(__dirname, '..', 'migrations');

/** Migrations edited after apply - recompute checksum to match migration.sql on disk */
const TARGETS = [
  '20260706110000_phase1_department_project_fk',
  '20260706120000_phase2_engineering_discipline',
  '20260707100000_add_design_package_code',
  '20260710120000_grant_institute_chief_epc_view',
  '20260716120000_add_document_load_perf_indexes',
  '20260721_add_cr_workflow_fields',
  '20260724_extend_issue_fields',
  '20260727_extend_daily_log',
  '20260728_er_external_approval',
  '20260810083348_fix_overtime_time_precision',
  '20260810090000_fix_overtime_time_precision',
];

function checksumFor(migrationName) {
  const sqlPath = join(migrationsRoot, migrationName, 'migration.sql');
  if (!existsSync(sqlPath)) {
    throw new Error(`Missing ${sqlPath}`);
  }
  const content = readFileSync(sqlPath);
  return createHash('sha256').update(content).digest('hex');
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const available = new Set(readdirSync(migrationsRoot));
    for (const name of TARGETS) {
      if (!available.has(name)) {
        console.warn(`skip missing folder: ${name}`);
        continue;
      }
      const checksum = checksumFor(name);
      const result = await prisma.$executeRaw`
        UPDATE "_prisma_migrations"
        SET "checksum" = ${checksum}
        WHERE "migration_name" = ${name}
      `;
      console.log(`${name}: checksum=${checksum.slice(0, 12)}… rows=${result}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
