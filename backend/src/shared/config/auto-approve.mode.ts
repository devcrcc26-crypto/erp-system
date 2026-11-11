/**
 * Local-only AUTO_APPROVE_ALL helpers.
 * Active only when AUTO_APPROVE_ALL=true and DATABASE_URL host is localhost/127.0.0.1.
 */

export const DEFAULT_AUTO_APPROVE_ACTOR_ID =
  '16040ab7-b923-4fe4-87cf-cc3a916c7325';

export const AUTO_APPROVE_COMMENT = 'Auto-approved (test mode)';

export const AUTO_APPROVE_FALLBACK_TIER_LABEL = 'Test auto-approval';

/** Categories that must never be auto-approved (own status machines). */
export const AUTO_APPROVE_EXCLUDED_CATEGORIES = new Set<string>([
  'PAYROLL_RUN',
  'EVALUATION',
]);

export interface AutoApproveMode {
  /** True only when flag is on and DB host is local. */
  active: boolean;
  /** Flag was true but ignored because DB is not local. */
  ignoredNonLocal: boolean;
  actorId: string;
}

/**
 * Extracts hostname from a PostgreSQL / URL connection string.
 */
export function resolveDatabaseHostFromUrl(
  databaseUrl: string | undefined,
): string {
  if (!databaseUrl?.trim()) {
    return 'unknown';
  }
  try {
    return new URL(databaseUrl).hostname || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * True for localhost / 127.0.0.1 only (IPv6 loopback included).
 */
export function isLocalDatabaseHost(host: string): boolean {
  const normalised = host.trim().toLowerCase();
  return (
    normalised === 'localhost' ||
    normalised === '127.0.0.1' ||
    normalised === '::1'
  );
}

function parseTruthyFlag(value: unknown): boolean {
  if (value === true || value === 1) {
    return true;
  }
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    return v === 'true' || v === '1';
  }
  return false;
}

/**
 * Resolves auto-approve mode from env-like values (testable without Nest DI).
 */
export function resolveAutoApproveMode(env: {
  AUTO_APPROVE_ALL?: unknown;
  AUTO_APPROVE_ACTOR_ID?: unknown;
  DATABASE_URL?: unknown;
}): AutoApproveMode {
  const flagOn = parseTruthyFlag(env.AUTO_APPROVE_ALL);
  const actorRaw =
    typeof env.AUTO_APPROVE_ACTOR_ID === 'string'
      ? env.AUTO_APPROVE_ACTOR_ID.trim()
      : '';
  const actorId = actorRaw || DEFAULT_AUTO_APPROVE_ACTOR_ID;
  const host = resolveDatabaseHostFromUrl(
    typeof env.DATABASE_URL === 'string' ? env.DATABASE_URL : undefined,
  );
  const local = isLocalDatabaseHost(host);

  if (!flagOn) {
    return { active: false, ignoredNonLocal: false, actorId };
  }
  if (!local) {
    return { active: false, ignoredNonLocal: true, actorId };
  }
  return { active: true, ignoredNonLocal: false, actorId };
}

/**
 * Reads process.env (used at runtime by services and bootstrap).
 */
export function getAutoApproveModeFromEnv(): AutoApproveMode {
  return resolveAutoApproveMode({
    AUTO_APPROVE_ALL: process.env.AUTO_APPROVE_ALL,
    AUTO_APPROVE_ACTOR_ID: process.env.AUTO_APPROVE_ACTOR_ID,
    DATABASE_URL: process.env.DATABASE_URL,
  });
}

/**
 * Whether a category code is excluded from auto-approve.
 */
export function isAutoApproveExcludedCategory(categoryCode: string): boolean {
  return AUTO_APPROVE_EXCLUDED_CATEGORIES.has(categoryCode);
}
