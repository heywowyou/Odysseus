import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The wall, asserted.
 *
 * `packages/site` is deployed separately and deliberately cannot reach the
 * database or the audit engine: that isolation is what means a mistake on a
 * public page can never expose audit data, and it is the reason the preview
 * route reads an object from a bucket instead of resolving a token in Mongo.
 * Plan 009 is the first work that gives the site a reason to want a private
 * import, so this is where the constraint stops being a convention.
 */

const siteRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN = [
  '@odysseus/core',
  '@odysseus/store',
  '@odysseus/interface',
  '@odysseus/report',
  '@odysseus/scanner',
  '@odysseus/llm',
  'mongoose',
  'mongodb',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    if (entry === 'node_modules' || entry === '.next' || entry.startsWith('.')) return [];
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|mjs|js)$/u.test(entry) ? [full] : [];
  });
}

describe('site package isolation', () => {
  const files = [
    ...sourceFiles(path.join(siteRoot, 'app')),
    ...sourceFiles(path.join(siteRoot, 'lib')),
  ];

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  it.each(FORBIDDEN)('imports nothing from %s', (specifier) => {
    const offenders = files.filter((file) => {
      const source = readFileSync(file, 'utf8');
      return new RegExp(`from ['"]${specifier}(/|['"])`, 'u').test(source);
    });
    expect(offenders).toEqual([]);
  });

  it('declares no private workspace dependency', () => {
    const manifest = JSON.parse(readFileSync(path.join(siteRoot, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies });
    expect(declared.filter((name) => name.startsWith('@odysseus/'))).toEqual([]);
  });
});
