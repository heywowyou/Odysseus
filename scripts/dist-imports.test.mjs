/**
 * Issue #519: operator scripts load built modules by hard-coded `dist` paths
 * (renormalize-audits.mjs imports `/app/packages/interface/dist/...` inside
 * the production container). tsc, dependency-cruiser and ESLint cannot see
 * those strings, so renaming a module passed every gate and the first failure
 * came when the operator ran the recovery script during an incident. This
 * maps every such path back to its source file and requires it to exist.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPTS = path.join(REPO_ROOT, 'scripts');

/** `packages/<pkg>/dist/<file>.js`, however the script spells the prefix
 *  (`${app}/`, `../packages/`, `/app/packages/`, a path.join argument). */
const DIST_PATH = /(?:packages|\$\{app\})\/([a-z-]+)\/dist\/([\w./-]+)\.js/gu;

function distImports() {
  return readdirSync(SCRIPTS)
    .filter((file) => file.endsWith('.mjs') && !file.endsWith('.test.mjs'))
    .flatMap((file) =>
      [...readFileSync(path.join(SCRIPTS, file), 'utf8').matchAll(DIST_PATH)].map((match) => ({
        script: file,
        packageName: match[1],
        modulePath: match[2],
      })),
    );
}

describe('dist paths the operator scripts load (issue #519)', () => {
  const imports = distImports();

  it('finds the scripts that load built modules', () => {
    expect(imports.map((entry) => entry.script)).toContain('renormalize-audits.mjs');
  });

  it.each(imports.map((entry) => [entry.script, `${entry.packageName}/${entry.modulePath}`]))(
    '%s loads %s, which has a source file',
    (_script, target) => {
      const [packageName, ...rest] = target.split('/');
      const source = path.join(REPO_ROOT, 'packages', packageName, 'src', `${rest.join('/')}.ts`);
      expect(existsSync(source), source).toBe(true);
    },
  );
});
