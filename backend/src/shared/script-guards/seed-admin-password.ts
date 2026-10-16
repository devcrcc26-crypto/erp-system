/**
 * Resolves SEED_ADMIN_PASSWORD for seed scripts.
 * Localhost may fall back to Admin@12345; non-local hosts require the env var.
 */

const LOCAL_FALLBACK = 'Admin@12345';

function databaseHost(): string | null {
  const raw = process.env.DATABASE_URL;
  if (!raw) {
    return null;
  }
  try {
    return new URL(raw).hostname;
  } catch {
    return null;
  }
}

export function isLocalDatabaseHost(host: string | null): boolean {
  return host === 'localhost' || host === '127.0.0.1';
}

/**
 * Returns the seed admin password. Exits the process when a non-local
 * DATABASE_URL is used without SEED_ADMIN_PASSWORD.
 */
export function resolveSeedAdminPassword(): string {
  const fromEnv = process.env.SEED_ADMIN_PASSWORD?.trim();
  if (fromEnv) {
    return fromEnv;
  }

  const host = databaseHost();
  if (isLocalDatabaseHost(host)) {
    return LOCAL_FALLBACK;
  }

  console.error(
    'Refused: SEED_ADMIN_PASSWORD is required when DATABASE_URL host is not localhost/127.0.0.1' +
      (host ? ` (got ${host})` : ' (DATABASE_URL missing or unparseable)'),
  );
  process.exit(1);
}

/** Console-safe description - never prints the password value. */
export function seedAdminPasswordSourceLabel(): string {
  return process.env.SEED_ADMIN_PASSWORD?.trim()
    ? '(from SEED_ADMIN_PASSWORD)'
    : '(local default; set SEED_ADMIN_PASSWORD to override)';
}
