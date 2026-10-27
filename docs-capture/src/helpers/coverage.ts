import fs from 'node:fs';
import path from 'node:path';
import type { ManifestRecord } from './manifest.js';
import { readAllManifests } from './manifest.js';
import { discoverRoutesForRole } from '../routes/discover.js';
import type { DocsRoleKey } from '../roles.js';
import { getRoleByKey } from '../roles.js';

export function writeCoverageReport(
  roleKey: DocsRoleKey,
  outRoot: string,
): string {
  const role = getRoleByKey(roleKey);
  const discovered = discoverRoutesForRole(roleKey);
  const manifests = readAllManifests(role.slug, outRoot);

  const excluded = discovered.filter((r) => r.skipReason === 'excluded-pm');
  const skippedAuth = discovered.filter(
    (r) => r.skipReason === 'auth' || r.skipReason === 'logout',
  );
  const skippedDynamic = discovered.filter(
    (r) => r.skipReason === 'missing-dynamic',
  );
  const noAccess = manifests.filter((m) => m.kind === 'no-access');
  const badId = manifests.filter((m) => m.kind === 'bad-id');
  const failedModals = manifests.filter((m) => m.kind === 'failed-modal');
  const pages = manifests.filter((m) => m.kind === 'page');

  const lines: string[] = [
    `Coverage report — ${role.label}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    `Pages captured: ${pages.length}`,
    `No-access: ${noAccess.length}`,
    `Bad id: ${badId.length}`,
    `Failed modals: ${failedModals.length}`,
    `Excluded (PM): ${excluded.length}`,
    `Skipped (auth/logout): ${skippedAuth.length}`,
    `Skipped (missing dynamic): ${skippedDynamic.length}`,
    '',
    '=== EXCLUDED (project-management routes) ===',
    ...excluded.map((r) => r.pattern),
    '',
    '=== SKIPPED (auth / logout) ===',
    ...skippedAuth.map((r) => `${r.pattern} (${r.skipReason})`),
    '',
    '=== SKIPPED (missing dynamic values) ===',
    ...skippedDynamic.map(
      (r) =>
        `${r.pattern} — missing: ${(r.missingSegments ?? []).join(', ')}`,
    ),
    '',
    '=== NO-ACCESS ===',
    ...noAccess.map((m) => `${m.route} — ${m.reason ?? ''}`),
    '',
    '=== BAD ID ===',
    ...badId.map((m) => `${m.route} — ${m.reason ?? ''}`),
    '',
    '=== FAILED MODALS ===',
    ...failedModals.map(
      (m) => `${m.route}#${m.modalName ?? '?'} — ${m.reason ?? ''}`,
    ),
    '',
  ];

  const outPath = path.join(outRoot, role.slug, 'coverage.txt');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
  return outPath;
}

export function summarizeManifestKinds(
  records: ManifestRecord[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const r of records) {
    counts[r.kind] = (counts[r.kind] ?? 0) + 1;
  }
  return counts;
}
