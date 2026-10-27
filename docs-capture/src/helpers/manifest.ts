import fs from 'node:fs';
import path from 'node:path';

export type ManifestKind =
  | 'page'
  | 'modal'
  | 'stepper-step'
  | 'no-access'
  | 'skipped'
  | 'excluded'
  | 'failed-modal'
  | 'bad-id';

export interface ManifestRecord {
  readonly role: string;
  readonly kind: ManifestKind;
  readonly route: string;
  readonly url?: string;
  readonly title?: string;
  readonly descriptionKey?: string;
  readonly image?: string;
  readonly modalName?: string;
  readonly stepIndex?: number;
  readonly stepTitle?: string;
  readonly reason?: string;
  readonly capturedAt: string;
}

function safeFilePart(value: string): string {
  return value
    .replace(/^\//, '')
    .replace(/[/?#&=]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 180) || 'root';
}

export function roleOutDir(roleSlug: string, root: string): {
  root: string;
  img: string;
  manifest: string;
} {
  const roleRoot = path.join(root, roleSlug);
  return {
    root: roleRoot,
    img: path.join(roleRoot, 'img'),
    manifest: path.join(roleRoot, 'manifest'),
  };
}

export function ensureRoleDirs(roleSlug: string, outRoot: string): ReturnType<typeof roleOutDir> {
  const dirs = roleOutDir(roleSlug, outRoot);
  fs.mkdirSync(dirs.img, { recursive: true });
  fs.mkdirSync(dirs.manifest, { recursive: true });
  return dirs;
}

export function writeManifestRecord(
  roleSlug: string,
  outRoot: string,
  fileStem: string,
  record: ManifestRecord,
): string {
  const dirs = ensureRoleDirs(roleSlug, outRoot);
  const filePath = path.join(dirs.manifest, `${safeFilePart(fileStem)}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return filePath;
}

export function imageRelativePath(
  kind: 'page' | 'modal' | 'step',
  route: string,
  extra?: string,
): string {
  const base = safeFilePart(route);
  if (kind === 'page') return `img/${base}.png`;
  if (kind === 'modal') return `img/${base}__modal-${safeFilePart(extra ?? 'dialog')}.png`;
  return `img/${base}__step-${safeFilePart(extra ?? '0')}.png`;
}

export function readAllManifests(roleSlug: string, outRoot: string): ManifestRecord[] {
  const dir = path.join(outRoot, roleSlug, 'manifest');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) =>
      JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) as ManifestRecord,
    );
}
