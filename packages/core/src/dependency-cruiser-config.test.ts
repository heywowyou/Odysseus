import { afterEach, describe, expect, it } from 'vitest';
import { cruise } from 'dependency-cruiser';
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Exercises the repo-root `.dependency-cruiser.cjs` config directly (not a
 * synthetic copy), so a rule that's silently loosened or a boundary that's
 * silently reopened shows up here instead of only in `pnpm run
 * architecture:check`. Fixture files below are written into and removed
 * from the real package trees for the duration of each test - the same
 * on-disk resolution the real check goes through - rather than a hand-built
 * workspace, since reproducing pnpm's symlinked node_modules would be more
 * fragile than the thing it's testing.
 */

const require = createRequire(import.meta.url);
const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const config = require(path.join(REPO_ROOT, '.dependency-cruiser.cjs'));

// Resolve the physical, pnpm-managed install of a package from the same
// place its own declaring package.json would, so fixture imports below are
// deterministic instead of depending on whatever happens to be reachable
// via Node's directory walk-up from this test file.
function resolveRealPackageEntry(declaringPackageDir: string, specifier: string): string {
  const declaringRequire = createRequire(path.join(REPO_ROOT, declaringPackageDir, 'package.json'));
  return declaringRequire.resolve(specifier);
}

async function architectureViolations(
  filesOrDirs: string[],
): Promise<Array<{ from: string; to: string; rule: { name: string; severity: string } }>> {
  const result = await cruise(filesOrDirs, {
    validate: true,
    outputType: 'json',
    ruleSet: { forbidden: config.forbidden },
    ...config.options,
  });
  const output = JSON.parse(result.output as string);
  return output.summary.violations;
}

const fixturesWritten: string[] = [];

function writeFixture(relativePath: string, contents: string): string {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, contents);
  fixturesWritten.push(absolutePath);
  return relativePath;
}

function relativeImportSpecifier(fixtureRelativePath: string, targetAbsolutePath: string): string {
  const fixtureDir = path.dirname(path.join(REPO_ROOT, fixtureRelativePath));
  const relative = path.relative(fixtureDir, targetAbsolutePath).replaceAll(path.sep, '/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}

afterEach(() => {
  while (fixturesWritten.length > 0) {
    rmSync(fixturesWritten.pop()!, { force: true });
  }
});

describe('dependency-cruiser architecture rules', () => {
  it('finds no error-severity violation in the current package sources', async () => {
    const violations = await architectureViolations([
      'packages/core/src',
      'packages/scanner/src',
      'packages/llm/src',
      'packages/store/src',
      'packages/report/src',
      'packages/interface/src',
      'packages/cli/src',
      'packages/site/app',
      'packages/site/lib',
    ]);
    const errors = violations.filter((violation) => violation.rule.severity === 'error');
    expect(errors).toEqual([]);
  });

  it("flags a package reaching directly into another package's src", async () => {
    const file = writeFixture(
      'packages/scanner/src/__depcruise_fixture_deep_import__.ts',
      "export { REVIEW_ACTOR } from '../../interface/src/routes/prospects.js';\n",
    );
    const violations = await architectureViolations([file]);
    expect(violations.map((violation) => violation.rule.name)).toContain(
      'no-deep-import-into-interface',
    );
  });

  it('flags a package importing a workspace dependency outside its allowed graph', async () => {
    const file = writeFixture(
      'packages/core/src/__depcruise_fixture_disallowed_dependency__.ts',
      "export { default } from '../../store/dist/index.js';\n",
    );
    const violations = await architectureViolations([file]);
    expect(violations.map((violation) => violation.rule.name)).toContain(
      'core-allowed-dependencies',
    );
  });

  it('flags a runtime Mongoose import outside @odysseus/store', async () => {
    const fixturePath = 'packages/core/src/__depcruise_fixture_mongoose__.ts';
    const mongooseEntry = resolveRealPackageEntry('packages/store', 'mongoose');
    const file = writeFixture(
      fixturePath,
      `import mongoose from '${relativeImportSpecifier(fixturePath, mongooseEntry)}';\nexport default mongoose;\n`,
    );
    const violations = await architectureViolations([file]);
    expect(violations.map((violation) => violation.rule.name)).toContain('mongoose-only-in-store');
  });

  it('allows a type-only Mongoose import outside @odysseus/store', async () => {
    const fixturePath = 'packages/core/src/__depcruise_fixture_mongoose_type_only__.ts';
    const mongooseEntry = resolveRealPackageEntry('packages/store', 'mongoose');
    const file = writeFixture(
      fixturePath,
      `import type { Connection } from '${relativeImportSpecifier(fixturePath, mongooseEntry)}';\nexport type { Connection };\n`,
    );
    const violations = await architectureViolations([file]);
    expect(violations.map((violation) => violation.rule.name)).not.toContain(
      'mongoose-only-in-store',
    );
  });

  it('flags a runtime OpenAI import outside @odysseus/llm', async () => {
    const fixturePath = 'packages/core/src/__depcruise_fixture_openai__.ts';
    const openaiEntry = resolveRealPackageEntry('packages/llm', 'openai');
    const file = writeFixture(
      fixturePath,
      `import OpenAI from '${relativeImportSpecifier(fixturePath, openaiEntry)}';\nexport default OpenAI;\n`,
    );
    const violations = await architectureViolations([file]);
    expect(violations.map((violation) => violation.rule.name)).toContain('openai-only-in-llm');
  });

  it('allows @odysseus/site to be built with no audit-engine dependency', async () => {
    const disallowed = new Set([
      'core-allowed-dependencies',
      'scanner-allowed-dependencies',
      'llm-allowed-dependencies',
      'store-allowed-dependencies',
      'report-allowed-dependencies',
      'interface-allowed-dependencies',
      'cli-allowed-dependencies',
    ]);
    const violations = await architectureViolations(['packages/site/app', 'packages/site/lib']);
    const architectureViolationNames = violations
      .map((violation) => violation.rule.name)
      .filter((name) => disallowed.has(name));
    expect(architectureViolationNames).toEqual([]);
  });
});
