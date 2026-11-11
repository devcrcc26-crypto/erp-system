/**
 * Payroll test seed guardrails - local DB + SEED_MODE only.
 */
export function assertPayrollSeedGuards(): { host: string; database: string } {
  const seedMode = process.env.SEED_MODE;
  if (seedMode !== 'true' && seedMode !== '1') {
    console.error(
      'Payroll test seed refused: set SEED_MODE=true in the environment.',
    );
    process.exit(1);
  }

  const raw = process.env.DATABASE_URL;
  if (!raw) {
    console.error('Payroll test seed refused: DATABASE_URL is not set.');
    process.exit(1);
  }

  let host: string;
  let database: string;
  try {
    const url = new URL(raw);
    host = url.hostname;
    database = url.pathname.replace(/^\//, '').split('?')[0] || '';
  } catch {
    console.error('Payroll test seed refused: DATABASE_URL is not parseable.');
    process.exit(1);
  }

  if (host !== 'localhost' && host !== '127.0.0.1') {
    console.error(
      `Payroll test seed refused: DATABASE_URL host must be localhost or 127.0.0.1 (got ${host}).`,
    );
    process.exit(1);
  }

  return { host, database };
}
