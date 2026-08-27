/**
 * Build the site-agnostic rule inventory used by the normalization recall
 * ratchet. The output contains rule IDs only: no audit names, paths, URLs,
 * findings, or mapping back to a client.
 *
 * Run with: pnpm fixtures:rules
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const listing = JSON.parse(readFileSync(path.join(repoRoot, 'fixtures/audits.json'), 'utf-8'));
const ruleIds = new Set();
const missing = [];

for (const audit of listing.audits) {
  const findingsPath = path.join(repoRoot, audit.dir, 'findings.json');
  if (!existsSync(findingsPath)) {
    missing.push(audit.dir);
    continue;
  }

  const findings = JSON.parse(readFileSync(findingsPath, 'utf-8'));
  for (const finding of findings) ruleIds.add(finding.ruleId);
}

if (missing.length > 0) {
  console.error(
    `Cannot rebuild the observed rule inventory; ${missing.length} curated audit(s) are missing:\n` +
      missing.map((dir) => `  ${dir}`).join('\n'),
  );
  process.exit(1);
}

const targetDir = path.join(repoRoot, 'fixtures/test-audits');
const targetPath = path.join(targetDir, 'observed-rule-ids.json');
mkdirSync(targetDir, { recursive: true });
writeFileSync(targetPath, `${JSON.stringify([...ruleIds].sort(), null, 2)}\n`);
console.log(
  `Wrote ${ruleIds.size} site-agnostic rule IDs to ${path.relative(repoRoot, targetPath)}`,
);
