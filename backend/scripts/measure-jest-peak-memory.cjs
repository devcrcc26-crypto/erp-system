/**
 * Runs Jest and reports peak memory of Jest's own node processes on Windows
 * (parent + workers, matched by command line, so a running dev server or other
 * node process does not skew the numbers).
 *
 * Usage: node scripts/measure-jest-peak-memory.cjs [--baseline] [-- jest args...]
 *   --baseline  use jest.config.baseline.ts (pre memory-tuning config)
 *
 * Prints:
 *   PEAK_JEST_PROCESS_MB  largest single Jest process (worker) working set
 *   PEAK_JEST_TOTAL_MB    largest sum over all Jest processes at one moment
 */
const { spawn, execFileSync } = require('child_process');
const path = require('path');

const backendRoot = path.join(__dirname, '..');
const rawArgs = process.argv.slice(2).filter((a) => a !== '--');
const useBaseline = rawArgs.includes('--baseline');
const jestArgs = rawArgs.filter((a) => a !== '--baseline');
if (jestArgs.length === 0) {
  jestArgs.push('--no-coverage');
}
if (useBaseline) {
  jestArgs.unshift('--config', path.join(backendRoot, 'jest.config.baseline.ts'));
}

const SAMPLE_PS = [
  '$p = Get-CimInstance Win32_Process -Filter "Name=\'node.exe\'" |',
  "  Where-Object { $_.CommandLine -match 'jest' };",
  'if ($p) {',
  '  $m = ($p | Measure-Object -Property WorkingSetSize -Maximum -Sum);',
  '  "$($m.Maximum) $($m.Sum)"',
  '}',
].join(' ');

const peak = { process: 0, total: 0 };

function sample() {
  if (process.platform !== 'win32') return;
  try {
    const out = execFileSync('powershell', ['-NoProfile', '-Command', SAMPLE_PS], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const [max, sum] = out.split(/\s+/).map(Number);
    if (Number.isFinite(max) && max > peak.process) peak.process = max;
    if (Number.isFinite(sum) && sum > peak.total) peak.total = sum;
  } catch {
    // no matching processes yet
  }
}

const child = spawn(
  process.execPath,
  [path.join(backendRoot, 'node_modules/jest/bin/jest.js'), ...jestArgs],
  { cwd: backendRoot, stdio: 'inherit' },
);

let sampling = false;
const timer = setInterval(() => {
  if (sampling) return;
  sampling = true;
  sample();
  sampling = false;
}, 1000);

child.on('close', (code) => {
  clearInterval(timer);
  const mb = (n) => Math.round(n / (1024 * 1024));
  process.stdout.write(
    `\nPEAK_JEST_PROCESS_MB=${mb(peak.process)}\nPEAK_JEST_TOTAL_MB=${mb(peak.total)}\n`,
  );
  process.exit(code ?? 1);
});
