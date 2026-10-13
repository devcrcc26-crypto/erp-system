#!/usr/bin/env node
/**
 * Runs `tsc --noEmit` and enforces a committed per-file error baseline.
 *
 * The baseline records, per file, the error count and each error's signature
 * (`TSxxxx: message`, no line/column so unrelated edits don't shift it).
 *
 * - Fails if any file has an error that is not in its baseline: a higher count,
 *   a new file, or the same count with a different error (fixing one error and
 *   adding another in the same file). Fixes elsewhere never offset new errors.
 * - When nothing new appeared and at least one error was fixed, rewrites the
 *   baseline to the current state so fixed errors permanently lower the bar.
 * - Fails if tsc exits non-zero without parseable errors (crash / config
 *   error), so a broken run can never rewrite the baseline to 0.
 *
 * Usage: node scripts/typecheck-baseline.mjs
 * npm:   npm run typecheck:baseline
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const frontendRoot = resolve(__dirname, '..');
const baselinePath = join(frontendRoot, 'typecheck-baseline.json');

const ERROR_LINE =
  /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s*(.*)$/;

/**
 * @typedef {{ count: number, errors: string[] }} FileEntry
 * @typedef {Record<string, FileEntry>} FileMap
 * @typedef {{ count: number, files: FileMap, updatedAt?: string }} Baseline
 */

/**
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * @param {FileMap} files
 * @returns {FileMap}
 */
function sortFiles(files) {
  return Object.fromEntries(
    Object.entries(files)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([file, entry]) => [
        file,
        { count: entry.errors.length, errors: [...entry.errors].sort() },
      ]),
  );
}

/**
 * @returns {{ count: number, files: FileMap, lines: string[] }}
 */
function runTsc() {
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['tsc', '--noEmit', '-p', 'tsconfig.json', '--pretty', 'false'],
    {
      cwd: frontendRoot,
      encoding: 'utf8',
      shell: process.platform === 'win32',
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  /** @type {string[]} */
  const lines = [];
  /** @type {FileMap} */
  const files = {};

  for (const line of output.split(/\r?\n/)) {
    const match = ERROR_LINE.exec(line);
    if (!match) continue;
    lines.push(normalizePath(line));
    const file = normalizePath(match[1]);
    files[file] ??= { count: 0, errors: [] };
    files[file].errors.push(`${match[4]}: ${match[5].trim()}`);
  }

  if (result.error || (result.status !== 0 && lines.length === 0)) {
    console.error('tsc did not run cleanly and reported no parseable errors:');
    console.error(result.error?.message ?? output.trim().slice(0, 2000));
    process.exit(2);
  }

  return { count: lines.length, files: sortFiles(files), lines };
}

/**
 * @returns {Baseline | null}
 */
function loadBaseline() {
  if (!existsSync(baselinePath)) return null;
  const raw = JSON.parse(readFileSync(baselinePath, 'utf8'));
  if (Array.isArray(raw.files)) {
    throw new Error(
      `${relative(frontendRoot, baselinePath)} uses the old file-list format; ` +
        'delete it and re-run to record per-file errors.',
    );
  }
  /** @type {FileMap} */
  const files = {};
  for (const [file, entry] of Object.entries(raw.files ?? {})) {
    files[normalizePath(file)] = {
      count: Number(entry.count),
      errors: entry.errors ?? [],
    };
  }
  return { count: Number(raw.count), files, updatedAt: raw.updatedAt };
}

/**
 * @param {{ count: number, files: FileMap }} baseline
 */
function writeBaseline(baseline) {
  const payload = {
    count: baseline.count,
    files: sortFiles(baseline.files),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

/**
 * Multiset difference: signatures in `current` not covered by `allowed`.
 * @param {string[]} current
 * @param {string[]} allowed
 * @returns {string[]}
 */
function uncovered(current, allowed) {
  /** @type {Map<string, number>} */
  const remaining = new Map();
  for (const sig of allowed) remaining.set(sig, (remaining.get(sig) ?? 0) + 1);
  return current.filter((sig) => {
    const left = remaining.get(sig) ?? 0;
    if (left === 0) return true;
    remaining.set(sig, left - 1);
    return false;
  });
}

function main() {
  const current = runTsc();
  const baseline = loadBaseline();
  const fileCount = (/** @type {FileMap} */ files) => Object.keys(files).length;

  if (!baseline) {
    writeBaseline(current);
    console.log(
      `Created typecheck baseline: ${current.count} errors across ${fileCount(current.files)} files.`,
    );
    console.log(`Wrote ${relative(frontendRoot, baselinePath)}`);
    process.exit(current.count > 0 ? 1 : 0);
  }

  const regressions = Object.entries(current.files)
    .map(([file, entry]) => {
      const was = baseline.files[file] ?? { count: 0, errors: [] };
      return {
        file,
        count: entry.count,
        was: was.count,
        added: uncovered(entry.errors, was.errors),
      };
    })
    .filter(({ count, was, added }) => count > was || added.length > 0);

  if (regressions.length > 0) {
    console.error('Typecheck baseline regression (new errors per file):');
    for (const { file, count, was, added } of regressions) {
      const note =
        was === 0 ? ' (new erroring file)' : count <= was ? ' (error swapped)' : '';
      console.error(`  ${file}: ${was} → ${count}${note}`);
      for (const sig of added) console.error(`    + ${sig}`);
      for (const line of current.lines.filter((l) => l.startsWith(`${file}(`))) {
        console.error(`      ${line}`);
      }
    }
    console.error(
      `  Total: ${current.count} (baseline ${baseline.count}). ` +
        'Fix the new errors; fixing errors elsewhere does not offset them.',
    );
    process.exit(1);
  }

  const lowered = Object.entries(baseline.files).filter(
    ([file, was]) => (current.files[file]?.count ?? 0) < was.count,
  );

  if (lowered.length > 0) {
    writeBaseline(current);
    console.log(
      `Baseline lowered: ${baseline.count} → ${current.count} errors; ` +
        `${fileCount(baseline.files)} → ${fileCount(current.files)} files.`,
    );
    for (const [file, was] of lowered) {
      console.log(`  ${file}: ${was.count} → ${current.files[file]?.count ?? 0}`);
    }
    console.log(`Updated ${relative(frontendRoot, baselinePath)}`);
  } else {
    console.log(
      `Typecheck baseline OK: ${current.count} errors across ${fileCount(current.files)} files (unchanged).`,
    );
  }

  // Baseline gate passes even when known errors remain; CI can still fail
  // a separate strict `typecheck` when ready to drive to zero.
  process.exit(0);
}

main();
