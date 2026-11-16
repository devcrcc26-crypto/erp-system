/**
 * Import HR master / configuration data from prisma/data/export/*.json into the
 * PRODUCTION database.
 *
 *   cd backend && npx ts-node --transpile-only prisma/scripts/import-hr-master-data.ts           # dry run
 *   cd backend && npx ts-node --transpile-only prisma/scripts/import-hr-master-data.ts --apply   # write
 *
 * - Connects to PROD_DIRECT_URL (Supabase session pooler), falling back to
 *   PROD_DATABASE_URL. Never touches DATABASE_URL (local DB).
 * - Every row is upserted, so the script is safe to re-run. Re-running overwrites
 *   production master-data columns with the exported values.
 * - Users: passwordHash is created as '' (no usable password: login is rejected
 *   until HR issues an OTP), mustChangePassword = false. On re-run, password /
 *   OTP columns of existing users are never touched.
 * - Forward references (department/discipline leaders, user.reportsTo,
 *   user.leavePolicy, role.parentRole) are written in a second pass.
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { Prisma, PrismaClient } from '@prisma/client';
import { EXPORT_DIR_SEGMENTS, TABLES, TableSpec, USER_OMIT } from './hr-master-data.tables';

type Row = Record<string, any>;

const APPLY = process.argv.includes('--apply');
const CONCURRENCY = 5;

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname : '';
  } catch {
    return '';
  }
}

function readRows(t: TableSpec): Row[] {
  const file = path.join(process.cwd(), ...EXPORT_DIR_SEGMENTS, t.file);
  if (!fs.existsSync(file)) throw new Error(`Missing export file ${t.file}; run the export first.`);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Json-typed columns per model: a null there must be sent as Prisma.DbNull. */
const JSON_FIELDS = new Map<string, Set<string>>(
  Prisma.dmmf.datamodel.models.map((m) => [
    m.name,
    new Set(m.fields.filter((f) => f.type === 'Json').map((f) => f.name)),
  ]),
);

function normalise(t: TableSpec, row: Row): Row {
  const out: Row = { ...row };
  for (const f of t.readOnly ?? []) delete out[f];
  const jsonFields = JSON_FIELDS.get(t.label) ?? new Set<string>();
  for (const f of jsonFields) if (out[f] === null) out[f] = Prisma.DbNull;
  return out;
}

async function runPool<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (i < items.length) await fn(items[i++]);
  });
  await Promise.all(workers);
}

async function main(): Promise<void> {
  const prodUrl = process.env.PROD_DIRECT_URL || process.env.PROD_DATABASE_URL;
  if (!prodUrl) throw new Error('PROD_DIRECT_URL / PROD_DATABASE_URL is not set');
  if (hostOf(prodUrl) === hostOf(process.env.DATABASE_URL)) {
    throw new Error('Production URL has the same host as DATABASE_URL (local); refusing to run.');
  }
  console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} -> ${hostOf(prodUrl)}\n`);

  // ── Load + pre-process everything before opening a connection ──────────────
  const data = new Map<string, Row[]>(TABLES.map((t) => [t.model, readRows(t)]));
  const users = data.get('user')!;
  const userIds = new Set(users.map((u) => u.id));

  // Fallback for required audit columns (createdBy/updatedBy) that point at a user
  // who was not migrated: the earliest-created migrated user.
  const fallbackUserId = [...users].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))[0]?.id;
  if (!fallbackUserId) throw new Error('users.json is empty');

  const remapped: string[] = [];
  for (const t of TABLES) {
    for (const [field, mode] of Object.entries(t.userRefs ?? {})) {
      let n = 0;
      for (const r of data.get(t.model)!) {
        if (r[field] && !userIds.has(r[field])) {
          r[field] = mode === 'required' ? fallbackUserId : null;
          n++;
        }
      }
      if (n) remapped.push(`${t.label}.${field}: ${n} -> ${mode === 'required' ? 'fallback user' : 'null'}`);
    }
  }
  console.log(`Fallback user for orphaned audit refs: ${fallbackUserId}`);
  console.log(remapped.length ? `Remapped refs:\n  ${remapped.join('\n  ')}` : 'Remapped refs: none');

  if (!APPLY) {
    for (const t of TABLES) console.log(`Would upsert ${data.get(t.model)!.length} rows into ${t.label}`);
    console.log('\nDry run only. Re-run with --apply to write to production.');
    return;
  }

  // Supabase's session pooler caps clients (pool_size 15); keep Prisma's pool small.
  const url = new URL(prodUrl);
  url.searchParams.set('connection_limit', String(CONCURRENCY));
  const prisma = new PrismaClient({ datasources: { db: { url: url.toString() } } });
  const permissionIdMap = new Map<string, string>(); // local id -> prod id
  let tables = 0;
  let total = 0;

  try {
    // ── Pass 1: upsert every table in FK order ─────────────────────────────────
    for (const t of TABLES) {
      const delegate = (prisma as any)[t.model];
      const rows = data.get(t.model)!;
      const deferred = t.deferred ?? [];

      await runPool(rows, async (raw) => {
        const row = normalise(t, raw);

        if (t.model === 'permission') {
          const { id, ...rest } = row;
          const saved = await delegate.upsert({
            where: { module_action: { module: row.module, action: row.action } },
            create: row,
            update: rest,
            select: { id: true },
          });
          permissionIdMap.set(id, saved.id);
          return;
        }

        if (t.model === 'rolePermission') {
          row.permissionId = permissionIdMap.get(row.permissionId) ?? row.permissionId;
          const { id, ...rest } = row;
          await delegate.upsert({
            where: { roleId_permissionId: { roleId: row.roleId, permissionId: row.permissionId } },
            create: row,
            update: rest,
          });
          return;
        }

        const create: Row = { ...row };
        const update: Row = { ...row };
        delete update.id;
        for (const f of deferred) {
          create[f] = null; // written in pass 2
          delete update[f]; // keep existing value until pass 2
        }

        if (t.model === 'user') {
          for (const f of USER_OMIT) {
            delete create[f];
            delete update[f];
          }
          create.passwordHash = ''; // no usable password until HR issues an OTP
          create.mustChangePassword = false;
        }

        await delegate.upsert({ where: { id: row.id }, create, update });
      });

      tables++;
      total += rows.length;
      console.log(`Upserted ${rows.length} rows into ${t.label}`);
    }

    // ── Pass 2: forward / self references ──────────────────────────────────────
    for (const t of TABLES.filter((x) => x.deferred?.length)) {
      const delegate = (prisma as any)[t.model];
      const rows = data.get(t.model)!;
      await runPool(rows, async (r) => {
        const patch = Object.fromEntries(t.deferred!.map((f) => [f, r[f] ?? null]));
        await delegate.update({ where: { id: r.id }, data: patch });
      });
      console.log(`Linked ${t.deferred!.join(', ')} on ${rows.length} ${t.label} rows`);
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(`\nImport complete. ${tables} tables imported. ${total} total rows.`);
}

main().catch((err) => {
  console.error('Import failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
