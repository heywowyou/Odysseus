/**
 * Issue #544: a test importing `@odysseus/<pkg>/<module>.js` resolves through
 * the package's `./*` export to built dist, unless vitest.config.ts aliases it
 * to source. Seven Mongo suites once failed on a fresh clone that way. This
 * requires every such subpath import in the packages to name a workspace
 * package the aliases cover and a source module that exists.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = path.join(REPO_ROOT, 'packages');
const ALIASED = new Set(['core', 'store', 'scanner', 'llm', 'interface', 'report']);
const SUBPATH_IMPORT = /from '@odysseus\/([a-z-]+)\/([^']+)'/gu;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx|mjs)$/u.test(entry.name) ? [full] : [];
  });
}

function subpathImports() {
  return sourceFiles(PACKAGES).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(SUBPATH_IMPORT)].map((match) => ({
      file: path.relative(REPO_ROOT, file),
      packageName: match[1],
      subpath: match[2],
    })),
  );
}

describe('workspace subpath imports resolve to source in tests (issue #544)', () => {
  const imports = subpathImports();

  it('finds the store test-support imports', () => {
    expect(imports.some((entry) => entry.subpath === 'test-support.js')).toBe(true);
  });

  it.each(imports.map((entry) => [entry.file, `@odysseus/${entry.packageName}/${entry.subpath}`]))(
    '%s imports %s, which the test aliases map to an existing source module',
    (_file, specifier) => {
      const [, packageName, subpath] = /^@odysseus\/([a-z-]+)\/(.+)$/u.exec(specifier);
      expect(ALIASED.has(packageName)).toBe(true);
      expect(subpath.endsWith('.js')).toBe(true);
      const source = path.join(PACKAGES, packageName, 'src', subpath.replace(/\.js$/u, '.ts'));
      expect(existsSync(source)).toBe(true);
    },
  );
});
