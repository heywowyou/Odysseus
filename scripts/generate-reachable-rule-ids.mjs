/**
 * Regenerates packages/report/src/template/reachable-rule-ids.json, the list
 * of axe and Lighthouse rule ids that can actually reach a report.
 *
 * Run from the repo root, where both axe-core and lighthouse resolve;
 * packages/report itself depends on neither, which is why this list is
 * committed data rather than computed inside the report package's own tests.
 * packages/scanner/src/reachable-rule-ids.test.ts asserts the committed list
 * still matches what the installed scanners expose, so a dependency upgrade
 * that adds a rule fails the build instead of silently leaking English.
 *
 *   node scripts/generate-reachable-rule-ids.mjs
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// Rooted in packages/scanner: under pnpm's isolated layout neither axe-core
// nor lighthouse resolves from the repo root, and axe-core is a transitive
// dependency of @axe-core/playwright rather than a direct one, so it is
// resolved through that package rather than by a hardcoded store path.
const scannerRequire = createRequire(new URL('../packages/scanner/package.json', import.meta.url));
const axe = createRequire(scannerRequire.resolve('@axe-core/playwright'))('axe-core');
const cfg = (
  await import(
    pathToFileURL(scannerRequire.resolve('lighthouse/core/config/default-config.js')).href
  )
).default;
const { LIGHTHOUSE_EXCLUDED_AUDITS } = await import('../packages/core/dist/normalize/constants.js');
const { WCAG22AA_TAGS } = await import('../packages/scanner/dist/axe.js');

/** Audits Lighthouse marks informative: they carry no pass/fail score, so
 *  normalize-lighthouse.ts never turns them into findings. */
const INFORMATIVE = [
  'network-requests',
  'network-rtt',
  'network-server-latency',
  'main-thread-tasks',
  'diagnostics',
  'metrics',
  'screenshot-thumbnails',
  'final-screenshot',
  'script-treemap-data',
  'resource-summary',
  'critical-request-chains',
  'user-timings',
  'largest-contentful-paint-element',
];

const tags = new Set(WCAG22AA_TAGS);
const axeIds = axe
  .getRules()
  .filter((r) => (r.tags || []).some((t) => tags.has(t)))
  .map((r) => r.ruleId);

const excluded = new Set([...LIGHTHOUSE_EXCLUDED_AUDITS, ...INFORMATIVE]);
const lighthouseIds = [];
for (const category of ['performance', 'seo']) {
  for (const ref of cfg.categories[category]?.auditRefs ?? []) {
    if (!excluded.has(ref.id)) lighthouseIds.push(ref.id);
  }
}

const out = {
  generatedBy: 'scripts/generate-reachable-rule-ids.mjs',
  axe: [...new Set(axeIds)].sort(),
  lighthouse: [...new Set(lighthouseIds)].sort(),
};
const path = new URL('../packages/report/src/template/reachable-rule-ids.json', import.meta.url);
writeFileSync(path, JSON.stringify(out, null, 2) + '\n');
console.log(`axe: ${out.axe.length}, lighthouse: ${out.lighthouse.length}`);
