/**
 * Copies dependency-free backend config modules into frontend/lib/generated/
 * so the frontend never imports from backend/.
 *
 * Usage (from backend/): npm run sync:shared
 *
 * field-movement-shared-config.spec.ts fails when the generated copies drift.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

export const BACKEND_ROOT = resolve(__dirname, '..');
export const FRONTEND_GENERATED_DIR = resolve(
  BACKEND_ROOT,
  '../frontend/lib/generated',
);

/** Paths relative to backend/. Each file must have no imports. */
export const SHARED_CONFIG_FILES = [
  'src/modules/attendance/application/utils/field-movement-field-rules.ts',
  'src/modules/attendance/application/utils/field-movement-issue-compatibility.ts',
] as const;

export function generatedFileName(sourcePath: string): string {
  return sourcePath.split('/').pop()!;
}

export function generatedFilePath(sourcePath: string): string {
  return join(FRONTEND_GENERATED_DIR, generatedFileName(sourcePath));
}

/** LF-normalised so a CRLF checkout (core.autocrlf) never counts as drift. */
export function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, '\n');
}

export function renderGenerated(sourcePath: string, source: string): string {
  return (
    `// GENERATED from backend/${sourcePath} - do not edit; run npm run sync:shared (in backend/)\n\n` +
    normalizeLineEndings(source)
  );
}

export function readSource(sourcePath: string): string {
  return readFileSync(join(BACKEND_ROOT, sourcePath), 'utf8');
}

/** True if the module has an import / re-export statement (shared files must not). */
export function hasModuleImports(source: string): boolean {
  return /^\s*import[\s{*'"]|^\s*export\s[^\n]*\sfrom\s+['"]|\brequire\(/m.test(
    source,
  );
}

function main(): void {
  mkdirSync(FRONTEND_GENERATED_DIR, { recursive: true });
  for (const sourcePath of SHARED_CONFIG_FILES) {
    const source = readSource(sourcePath);
    if (hasModuleImports(source)) {
      throw new Error(`${sourcePath} must not import other modules`);
    }
    const target = generatedFilePath(sourcePath);
    writeFileSync(target, renderGenerated(sourcePath, source), 'utf8');
    console.log(`synced ${sourcePath} -> ${target}`);
  }
}

if (require.main === module) {
  main();
}
