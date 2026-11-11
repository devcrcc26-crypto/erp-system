import * as fs from 'fs';
import * as path from 'path';

const CONTROLLERS_DIR = path.join(__dirname, '..');

const PERMISSION_DECORATORS = [
  '@RequirePermission',
  '@RequireAnyPermission',
  '@DelegatePermissionCheck',
] as const;

function listControllerFiles(): string[] {
  return fs
    .readdirSync(CONTROLLERS_DIR)
    .filter((file) => file.endsWith('.controller.ts'));
}

function routesMissingPermissionDecorator(source: string): string[] {
  const lines = source.split('\n');
  const missing: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? '';
    const routeMatch = line.match(/^\s*@(Get|Post|Patch|Put|Delete)\(/);
    if (!routeMatch) {
      continue;
    }

    const windowBefore = lines.slice(Math.max(0, index - 8), index + 1).join('\n');
    const windowAfter = lines.slice(index, Math.min(lines.length, index + 10)).join('\n');
    const windowText = `${windowBefore}\n${windowAfter}`;
    const hasDecorator = PERMISSION_DECORATORS.some((decorator) =>
      windowText.includes(decorator),
    );
    if (!hasDecorator) {
      missing.push(`${routeMatch[1]} at line ${index + 1}`);
    }
  }

  return missing;
}

describe('PM controller permission decorator coverage', () => {
  for (const file of listControllerFiles()) {
    it(`${file} decorates every HTTP route with an explicit permission guard`, () => {
      const source = fs.readFileSync(path.join(CONTROLLERS_DIR, file), 'utf8');
      const missing = routesMissingPermissionDecorator(source);
      expect(missing).toEqual([]);
    });
  }
});
