/**
 * Re-derives every stored audit the test suite reads as a fixture, then
 * stamps each one with the fingerprint of the normalization code that
 * produced it.
 *
 * Run this after any change under packages/core/src/normalize. The freshness
 * test will tell you when, and name this command.
 *
 *   pnpm fixtures:refresh
 *
 * Offline and local-only: `normalize <dir>` re-runs against stored scanner
 * output and never touches a network or a database, so this re-scans nothing
 * and costs no live site a single request.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { REPO_ROOT, FINGERPRINT_FILENAME, fixtureAudits, normalizeFingerprint } from './fixture-fingerprint.mjs';

const cli = path.join(REPO_ROOT, 'packages/cli/dist/index.js');
if (!existsSync(cli)) {
  console.error('Build first: pnpm build');
  process.exit(1);
}

const fingerprint = normalizeFingerprint();
const audits = fixtureAudits();
let refreshed = 0;
const missing = [];

for (const audit of audits) {
  const dir = path.join(REPO_ROOT, audit.dir);
  if (!existsSync(path.join(dir, 'findings.json'))) {
    missing.push(audit.dir);
    continue;
  }
  const output = execFileSync('node', [cli, 'normalize', dir], { encoding: 'utf-8' });
  const count = /Findings:\s*(\d+)/.exec(output)?.[1] ?? '?';
  writeFileSync(path.join(dir, FINGERPRINT_FILENAME), `${fingerprint}\n`, 'utf-8');
  console.log(`  ${String(count).padStart(5)} findings  ${audit.dir}`);
  refreshed += 1;
}

console.log(`\nRefreshed ${refreshed} of ${audits.length} fixture audits at fingerprint ${fingerprint}.`);
if (missing.length > 0) {
  console.error(
    `\n${missing.length} listed in fixtures/audits.json but not present on this machine:\n` +
      missing.map((dir) => `  ${dir}`).join('\n') +
      '\nThese are real scans of real sites and are not committed. See fixtures/audits.json.',
  );
  process.exit(1);
}
