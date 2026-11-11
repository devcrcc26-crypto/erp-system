/**
 * Guards for login-setup scripts: SEED_MODE required; dry-run by default;
 * non-localhost DATABASE_URL only with --allow-remote (host printed first).
 */

export type LoginSetupArgs = {
  apply: boolean;
  allowRemote: boolean;
  reset: boolean;
  onlyIds: string[];
};

export function parseLoginSetupArgs(argv: string[]): LoginSetupArgs {
  const apply = argv.includes('--apply');
  const allowRemote = argv.includes('--allow-remote');
  const reset = argv.includes('--reset');
  const onlyArg = argv.find((a) => a.startsWith('--only='));
  const onlyIds = onlyArg
    ? onlyArg
        .slice('--only='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  return { apply, allowRemote, reset, onlyIds };
}

export function assertSeedMode(): void {
  const seedMode = process.env.SEED_MODE;
  if (seedMode !== 'true' && seedMode !== '1') {
    console.error('Refused: set SEED_MODE=true in the environment.');
    process.exit(1);
  }
}

export function resolveDatabaseTarget(allowRemote: boolean): {
  host: string;
  database: string;
  url: string;
} {
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

  const isLocal = host === 'localhost' || host === '127.0.0.1';
  if (!isLocal) {
    console.log(`Target database host: ${host}`);
    if (!allowRemote) {
      console.error(
        'Refused: non-localhost DATABASE_URL requires --allow-remote.',
      );
      process.exit(1);
    }
  }

  return { host, database, url: raw };
}

export function assertCredentialsPathGitignored(
  gitignoreText: string,
  relativePath: string,
): void {
  const normalised = relativePath.replace(/\\/g, '/');
  const patterns = gitignoreText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));

  const covered = patterns.some((pattern) => {
    const p = pattern.replace(/\\/g, '/').replace(/\/$/, '');
    if (p === 'backend/data/private' || p === 'backend/data/private/') {
      return normalised.startsWith('backend/data/private/');
    }
    if (p.endsWith('/')) {
      return normalised.startsWith(p);
    }
    return normalised === p || normalised.startsWith(`${p}/`);
  });

  if (!covered) {
    console.error(
      `Refused: ${relativePath} is not covered by .gitignore - credentials must not be committed.`,
    );
    process.exit(1);
  }
}
