import type { Prisma, PrismaClient } from '@prisma/client';
import {
  POLICY_DEFAULTS,
  policyDefinition,
  type PolicyKey,
  type PolicyValues,
} from './policy-definitions';

type Db = PrismaClient | Prisma.TransactionClient;

export interface PolicyVersionRow {
  key: string;
  value: unknown;
  effectiveFrom: Date;
  createdAt: Date;
}

/** First day of the month containing `date` (UTC). Policies change on month boundaries. */
export function policyMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Values in force on `date`: per key, the version with the latest
 * effectiveFrom ≤ date (ties: latest createdAt); otherwise the code default.
 * Invalid stored values fall back to the default rather than break a run.
 */
export function resolvePolicyValues(
  rows: ReadonlyArray<PolicyVersionRow>,
  date: Date,
): PolicyValues {
  const asOf = date.getTime();
  const chosen = new Map<string, PolicyVersionRow>();
  for (const row of rows) {
    if (row.effectiveFrom.getTime() > asOf) continue;
    const current = chosen.get(row.key);
    if (
      !current ||
      row.effectiveFrom.getTime() > current.effectiveFrom.getTime() ||
      (row.effectiveFrom.getTime() === current.effectiveFrom.getTime() &&
        row.createdAt.getTime() > current.createdAt.getTime())
    ) {
      chosen.set(row.key, row);
    }
  }
  const values = structuredClone(POLICY_DEFAULTS) as PolicyValues;
  for (const [key, row] of chosen) {
    const definition = policyDefinition(key);
    if (definition && definition.validate(row.value) === null) {
      (values as unknown as Record<string, unknown>)[key] = row.value;
    }
  }
  return values;
}

const CACHE_TTL_MS = 60_000;
const cache = new WeakMap<object, Map<string, { rows: PolicyVersionRow[]; loadedAt: number }>>();

async function loadRows(db: Db, companyId: string): Promise<PolicyVersionRow[]> {
  let byCompany = cache.get(db);
  if (!byCompany) {
    byCompany = new Map();
    cache.set(db, byCompany);
  }
  const hit = byCompany.get(companyId);
  if (hit && Date.now() - hit.loadedAt < CACHE_TTL_MS) {
    return hit.rows;
  }
  const rows = await db.policySetting.findMany({
    where: { companyId },
    select: { key: true, value: true, effectiveFrom: true, createdAt: true },
  });
  byCompany.set(companyId, { rows, loadedAt: Date.now() });
  return rows;
}

/** Drops cached versions so the next read sees a just-saved policy. */
export function invalidatePolicyCache(db: Db, companyId: string): void {
  cache.get(db)?.delete(companyId);
}

/** All policy values in force for the month containing `date`. */
export async function loadPolicySnapshot(
  db: Db,
  companyId: string,
  date: Date,
): Promise<PolicyValues> {
  const rows = await loadRows(db, companyId);
  return resolvePolicyValues(rows, policyMonthStart(date));
}

export async function getPolicy<K extends PolicyKey>(
  db: Db,
  companyId: string,
  key: K,
  date: Date,
): Promise<PolicyValues[K]> {
  return (await loadPolicySnapshot(db, companyId, date))[key];
}
