import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { discoverRoutesForRole } from '../src/routes/discover.js';
import { detectAccess } from '../src/helpers/access.js';
import {
  disableAnimations,
  readPageTitle,
  waitForPageSettled,
} from '../src/helpers/wait.js';
import { captureDataShotModals } from '../src/helpers/modals.js';
import {
  ensureRoleDirs,
  imageRelativePath,
  writeManifestRecord,
} from '../src/helpers/manifest.js';
import { writeCoverageReport } from '../src/helpers/coverage.js';
import { DOCS_ROLES, type DocsRoleKey } from '../src/roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_ROOT = path.join(__dirname, '..', 'out');

function roleKeyFromProject(projectName: string): DocsRoleKey {
  const match = /^capture-(.+)$/.exec(projectName);
  if (!match) {
    throw new Error(`Unexpected capture project: ${projectName}`);
  }
  const role = DOCS_ROLES.find((r) => r.slug === match[1]);
  if (!role) {
    throw new Error(`Unknown role slug: ${match[1]}`);
  }
  return role.key;
}

test.describe.configure({ mode: 'serial' });

test('capture pages for role', async ({ page }, testInfo) => {
  // One test walks every route for the role — allow a long run.
  test.setTimeout(45 * 60_000);

  const roleKey = roleKeyFromProject(testInfo.project.name);
  const role = DOCS_ROLES.find((r) => r.key === roleKey)!;
  ensureRoleDirs(role.slug, OUT_ROOT);

  const discovered = discoverRoutesForRole(roleKey);

  // Record excluded / skipped up front (one manifest each)
  for (const route of discovered) {
    if (route.skipReason === 'excluded-pm') {
      writeManifestRecord(role.slug, OUT_ROOT, `excluded__${route.pattern}`, {
        role: role.label,
        kind: 'excluded',
        route: route.pattern,
        reason: 'project-management module excluded from this release',
        capturedAt: new Date().toISOString(),
      });
      continue;
    }
    if (
      route.skipReason === 'auth' ||
      route.skipReason === 'logout' ||
      route.skipReason === 'missing-dynamic'
    ) {
      writeManifestRecord(role.slug, OUT_ROOT, `skipped__${route.pattern}`, {
        role: role.label,
        kind: 'skipped',
        route: route.pattern,
        reason:
          route.skipReason === 'missing-dynamic'
            ? `missing dynamic: ${(route.missingSegments ?? []).join(', ')}`
            : route.skipReason,
        capturedAt: new Date().toISOString(),
      });
    }
  }

  const toCapture = discovered.filter((r) => r.url != null);

  for (const entry of toCapture) {
    const url = entry.url!;
    await test.step(url, async () => {
      try {
        await page.goto(url, {
          waitUntil: 'domcontentloaded',
          timeout: 60_000,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        writeManifestRecord(role.slug, OUT_ROOT, `failed-nav__${url}`, {
          role: role.label,
          kind: 'skipped',
          route: entry.pattern,
          url,
          reason: `navigation failed: ${message.slice(0, 300)}`,
          capturedAt: new Date().toISOString(),
        });
        return;
      }

      try {
        await waitForPageSettled(page);
        await disableAnimations(page);

        const access = await detectAccess(page, url);
        if (access.kind === 'dead-session') {
          throw new Error(
            `Dead session while capturing ${url} as ${role.label}. ` +
              `Login storageState is invalid — re-run auth setup.`,
          );
        }

        if (access.kind === 'no-access') {
          writeManifestRecord(role.slug, OUT_ROOT, `no-access__${url}`, {
            role: role.label,
            kind: 'no-access',
            route: entry.pattern,
            url,
            reason: access.reason,
            capturedAt: new Date().toISOString(),
          });
          return;
        }

        if (access.kind === 'bad-id') {
          writeManifestRecord(role.slug, OUT_ROOT, `bad-id__${url}`, {
            role: role.label,
            kind: 'bad-id',
            route: entry.pattern,
            url,
            reason: access.reason,
            capturedAt: new Date().toISOString(),
          });
          return;
        }

        const title = await readPageTitle(page);
        const rel = imageRelativePath('page', url);
        const abs = path.join(OUT_ROOT, role.slug, rel);
        await page.screenshot({ path: abs, fullPage: true });

        writeManifestRecord(role.slug, OUT_ROOT, `page__${url}`, {
          role: role.label,
          kind: 'page',
          route: entry.pattern,
          url,
          title,
          descriptionKey: entry.pattern,
          image: rel,
          capturedAt: new Date().toISOString(),
        });

        await captureDataShotModals({
          page,
          roleSlug: role.slug,
          roleLabel: role.label,
          route: entry.pattern,
          outRoot: OUT_ROOT,
        });
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes('Dead session')
        ) {
          throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        writeManifestRecord(role.slug, OUT_ROOT, `failed-page__${url}`, {
          role: role.label,
          kind: 'skipped',
          route: entry.pattern,
          url,
          reason: `capture failed: ${message.slice(0, 300)}`,
          capturedAt: new Date().toISOString(),
        });
      }
    });
  }

  const coveragePath = writeCoverageReport(roleKey, OUT_ROOT);
  expect(coveragePath).toBeTruthy();
});
