import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import en from '@/locales/en/epc.json';
import zh from '@/locales/zh/epc.json';

/**
 * Guards against untranslated screens: English and Chinese must have the same
 * keys, and every literal t('a.b.c') key used in the app must exist in both.
 * (Chinese falls back to English, and a key missing from both shows raw.)
 */

type Tree = { [key: string]: string | Tree };

function leafKeys(tree: Tree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const dotted = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? [dotted] : leafKeys(value, dotted);
  });
}

function lookup(tree: Tree, dotted: string): unknown {
  return dotted
    .split('.')
    .reduce<unknown>((node, part) => (node && typeof node === 'object' ? (node as Tree)[part] : undefined), tree);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name.startsWith('.')) {
      return [];
    }
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [full] : [];
  });
}

const ROOT = path.resolve(__dirname, '../..');

describe('EPC locales', () => {
  it('English and Chinese have exactly the same keys', () => {
    const enKeys = new Set(leafKeys(en as Tree));
    const zhKeys = new Set(leafKeys(zh as Tree));
    expect([...enKeys].filter((key) => !zhKeys.has(key))).toEqual([]);
    expect([...zhKeys].filter((key) => !enKeys.has(key))).toEqual([]);
  });

  it('every literal t() key used in the app exists in both languages', () => {
    const pattern = /\bt\(\s*['"]([a-zA-Z][\w-]*(?:\.[\w-]+)+)['"]/g;
    const used = new Set<string>();
    for (const dir of ['app', 'components', 'config', 'hooks', 'lib']) {
      for (const file of sourceFiles(path.join(ROOT, dir))) {
        for (const match of readFileSync(file, 'utf8').matchAll(pattern)) {
          used.add(match[1]);
        }
      }
    }
    const missing = [...used].filter(
      (key) => typeof lookup(en as Tree, key) !== 'string' || typeof lookup(zh as Tree, key) !== 'string',
    );
    expect(missing).toEqual([]);
  });
});
