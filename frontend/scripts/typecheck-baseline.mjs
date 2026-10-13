#!/usr/bin/env node
/**
 * Runs `tsc --noEmit` and enforces a committed error baseline.
 *
 * - Fails if the error count grows, or if any new file starts erroring.
 * - When the count shrinks (or the file set shrinks with equal/lower count),
 *   rewrites the baseline so fixed errors permanently lower the bar.
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
 * @typedef {{ count: number, files: string[], updatedAt?: string }} Baseline
 */

/**
 * @param {string} filePath
 * @returns {string}
 */
function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

/**
 * @returns {{ count: number, files: string[], errors: string[] }}
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
  const lines = output.split(/\r?\n/).filter(Boolean);
  /** @type {string[]} */
  const errors = [];
  /** @type {Set<string>} */
  const files = new Set();

  for (const line of lines) {
    const match = ERROR_LINE.exec(line);
    if (!match) continue;
    errors.push(line);
    files.add(normalizePath(match[1]));
  }

  return {
    count: errors.length,
    files: [...files].sort((a, b) => a.localeCompare(b)),
    errors,
  };
}

/**
 * @returns {Baseline | null}
 */
function loadBaseline() {
  if (!existsSync(baselinePath)) return null;
  const raw = JSON.parse(readFileSync(baselinePath, 'utf8'));
  return {
    count: Number(raw.count),
    files: (raw.files ?? []).map(normalizePath).sort((a, b) => a.localeCompare(b)),
    updatedAt: raw.updatedAt,
  };
}

/**
 * @param {Baseline} baseline
 */
function writeBaseline(baseline) {
  const payload = {
    count: baseline.count,
    files: baseline.files,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(baselinePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function main() {
  const current = runTsc();
  const baseline = loadBaseline();

  if (!baseline) {
    writeBaseline({ count: current.count, files: current.files });
    console.log(
      `Created typecheck baseline: ${current.count} errors across ${current.files.length} files.`,
    );
    console.log(`Wrote ${relative(frontendRoot, baselinePath)}`);
    process.exit(current.count > 0 ? 1 : 0);
  }

  const baselineFileSet = new Set(baseline.files);
  const newFiles = current.files.filter((f) => !baselineFileSet.has(f));
  const countGrew = current.count > baseline.count;
  const filesGrew = newFiles.length > 0;

  if (countGrew || filesGrew) {
    console.error('Typecheck baseline regression.');
    console.error(
      `  Errors: ${current.count} (baseline ${baseline.count})${countGrew ? ' — count grew' : ''}`,
    );
    console.error(
      `  Files:  ${current.files.length} (baseline ${baseline.files.length})${filesGrew ? ' — new erroring files' : ''}`,
    );
    if (newFiles.length > 0) {
      console.error('  New erroring files:');
      for (const f of newFiles) console.error(`    - ${f}`);
    }
    const sample = current.errors.slice(0, 20);
    if (sample.length > 0) {
      console.error('  Sample errors:');
      for (const line of sample) console.error(`    ${line}`);
      if (current.errors.length > sample.length) {
        console.error(`    … and ${current.errors.length - sample.length} more`);
      }
    }
    process.exit(1);
  }

  const countDropped = current.count < baseline.count;
  const filesDropped =
    current.files.length < baseline.files.length ||
    baseline.files.some((f) => !current.files.includes(f));

  if (countDropped || filesDropped) {
    writeBaseline({ count: current.count, files: current.files });
    console.log(
      `Baseline lowered: ${baseline.count} → ${current.count} errors; ${baseline.files.length} → ${current.files.length} files.`,
    );
    console.log(`Updated ${relative(frontendRoot, baselinePath)}`);
  } else {
    console.log(
      `Typecheck baseline OK: ${current.count} errors across ${current.files.length} files (unchanged).`,
    );
  }

  // Baseline gate passes even when known errors remain; CI can still fail
  // a separate strict `typecheck` when ready to drive to zero.
  process.exit(0);
}

main();
