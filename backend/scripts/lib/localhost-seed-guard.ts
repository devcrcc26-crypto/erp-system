/**
 * Shared guard: refuse destructive/seed scripts unless SEED_MODE and localhost.
 */
export function assertLocalhostSeedGuards(options?: {
  requireDatabase?: string;
}): { host: string; database: string; url: string } {
  const seedMode = process.env.SEED_MODE;
  if (seedMode !== 'true' && seedMode !== '1') {
    console.error('Refused: set SEED_MODE=true in the environment.');
    process.exit(1);
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error('Refused: DATABASE_URL is not set.');
    process.exit(1);
  }

  let host: string;
  let database: string;
  try {
    const url = new URL(raw);
    host = url.hostname;
    database = url.pathname.replace(/^\//, '').split('?')[0] || '';
  } catch {
    console.error('Refused: DATABASE_URL is not parseable.');
    process.exit(1);
  }

  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error(
      `Refused: DATABASE_URL host must be localhost or 127.0.0.1 (got ${host}).`,
    );
    process.exit(1);
  }

  if (options?.requireDatabase && database !== options.requireDatabase) {
    console.error(
      `Refused: DATABASE_URL database must be ${options.requireDatabase} (got ${database}).`,
    );
    process.exit(1);
  }

  return { host, database, url: raw };
}

export function withDatabase(url: string, database: string): string {
  const parsed = new URL(url);
  parsed.pathname = `/${database}`;
  return parsed.toString();
}
