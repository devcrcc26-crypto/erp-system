import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HELP_MODULE_SLUGS } from '../config/help-slugs.js';
import { isPmAppRoute } from '../config/pm-routes.js';
import {
  dynamicValuesForRole,
  resolveSegmentValue,
  type DynamicValueMap,
} from '../config/dynamic-values.js';
import type { DocsRoleKey } from '../roles.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const APP_DIR = path.join(REPO_ROOT, 'frontend', 'app');

const AUTH_PREFIXES = [
  '/login',
  '/activate',
  '/forgot-password',
  '/reset-password',
  '/confirm-email-change',
] as const;

export interface DiscoveredRoute {
  /** Pattern with [param] segments, e.g. /hr/leave-requests/[id] */
  readonly pattern: string;
  /** Concrete URL when all segments resolve; null if skipped. */
  readonly url: string | null;
  readonly skipReason?: 'auth' | 'logout' | 'missing-dynamic' | 'excluded-pm';
  readonly missingSegments?: readonly string[];
}

function walkPageFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) {
    return acc;
  }
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'api' || entry.name.startsWith('_')) {
        continue;
      }
      walkPageFiles(full, acc);
      continue;
    }
    if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      acc.push(full);
    }
  }
  return acc;
}

/** Convert a page.tsx path under app/ into a URL pattern. */
export function pageFileToPattern(filePath: string): string {
  const rel = path.relative(APP_DIR, path.dirname(filePath)).replace(/\\/g, '/');
  if (!rel || rel === '.') {
    return '/';
  }
  const parts = rel.split('/').filter((part) => {
    if (!part) return false;
    if (part.startsWith('(') && part.endsWith(')')) return false; // route groups
    if (part.startsWith('@')) return false; // parallel routes
    if (part.startsWith('_')) return false; // private
    return true;
  });
  return `/${parts.join('/')}`;
}

function isAuthRoute(pattern: string): boolean {
  return AUTH_PREFIXES.some(
    (p) => pattern === p || pattern.startsWith(`${p}/`),
  );
}

function collectSegments(pattern: string): string[] {
  const matches = pattern.matchAll(/\[([^\]]+)\]/g);
  return [...matches].map((m) => m[1]);
}

function materialize(
  pattern: string,
  values: DynamicValueMap,
): { url: string | null; missing: string[] } {
  const missing: string[] = [];
  const url = pattern.replace(/\[([^\]]+)\]/g, (_full, segment: string) => {
    const value = resolveSegmentValue(pattern, segment, values);
    if (!value) {
      missing.push(segment);
      return `[${segment}]`;
    }
    return value;
  });
  if (missing.length > 0) {
    return { url: null, missing };
  }
  return { url, missing: [] };
}

/**
 * Discover every capturable route for a role.
 * Help [module] is expanded into one URL per help slug.
 */
export function discoverRoutesForRole(role: DocsRoleKey): DiscoveredRoute[] {
  const values = dynamicValuesForRole(role);
  const files = walkPageFiles(APP_DIR);
  const patterns = [...new Set(files.map(pageFileToPattern))].sort();
  const results: DiscoveredRoute[] = [];

  for (const pattern of patterns) {
    if (isAuthRoute(pattern) || pattern === '/logout') {
      results.push({
        pattern,
        url: null,
        skipReason: pattern === '/logout' ? 'logout' : 'auth',
      });
      continue;
    }

    if (isPmAppRoute(pattern)) {
      results.push({
        pattern,
        url: null,
        skipReason: 'excluded-pm',
      });
      continue;
    }

    const segments = collectSegments(pattern);
    if (segments.includes('module') && pattern.startsWith('/help/')) {
      for (const slug of HELP_MODULE_SLUGS) {
        const concrete = pattern.replace('[module]', slug);
        results.push({ pattern: concrete, url: concrete });
      }
      continue;
    }

    if (segments.length === 0) {
      results.push({ pattern, url: pattern === '' ? '/' : pattern });
      continue;
    }

    const { url, missing } = materialize(pattern, values);
    if (!url) {
      results.push({
        pattern,
        url: null,
        skipReason: 'missing-dynamic',
        missingSegments: missing,
      });
      continue;
    }
    results.push({ pattern, url });
  }

  return results;
}

export function capturableUrls(role: DocsRoleKey): string[] {
  return discoverRoutesForRole(role)
    .filter((r) => r.url != null)
    .map((r) => r.url as string);
}
