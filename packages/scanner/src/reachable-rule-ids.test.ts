import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WCAG22AA_TAGS } from './axe.js';

/**
 * Keeps packages/report's committed reachable-rule-ids.json honest.
 *
 * That file is the input to the report's French-translation coverage test.
 * It has to be committed data rather than computed, because packages/report
 * depends on neither axe-core nor lighthouse and adding them there would mean
 * new dependencies for a test. This test closes the resulting gap from the
 * other side: scanner owns both scanners, so it can recompute the list and
 * fail if the committed copy has drifted.
 *
 * The drift that matters is an upgrade. Bumping axe-core or lighthouse can
 * introduce a rule id nobody has written French for, and the failure mode is
 * English text inside a French report sent to a paying client - which has
 * happened four times already, each time caught only after the fact by
 * reading a rendered PDF. If this fails, run:
 *
 *   node scripts/generate-reachable-rule-ids.mjs
 *
 * and then add a French entry for every new id in rule-translations.ts.
 */
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const COMMITTED_PATH = path.join(moduleDir, '../../report/src/template/reachable-rule-ids.json');

/** Mirrors the generator script. Lighthouse marks these informative: they
 *  carry no pass/fail score, so normalize-lighthouse.ts never emits them. */
const INFORMATIVE = new Set([
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
]);

describe('the committed reachable rule-id list matches the installed scanners', () => {
  it('lists exactly the axe rules our WCAG tag filter can reach', () => {
    const scannerRequire = createRequire(path.join(moduleDir, '../package.json'));
    const axe = createRequire(scannerRequire.resolve('@axe-core/playwright'))('axe-core') as {
      getRules(): Array<{ ruleId: string; tags?: string[] }>;
    };
    const tags = new Set<string>(WCAG22AA_TAGS);
    const actual = [
      ...new Set(
        axe
          .getRules()
          .filter((r) => (r.tags ?? []).some((t) => tags.has(t)))
          .map((r) => r.ruleId),
      ),
    ].sort();
    const committed = JSON.parse(readFileSync(COMMITTED_PATH, 'utf-8')) as { axe: string[] };
    expect(actual).toEqual(committed.axe);
  });

  it('lists exactly the Lighthouse performance and seo audits that can emit findings', async () => {
    const scannerRequire = createRequire(path.join(moduleDir, '../package.json'));
    const { LIGHTHOUSE_EXCLUDED_AUDITS } = await import('@odysseus/core');
    const cfg = (
      await import(
        pathToFileURL(scannerRequire.resolve('lighthouse/core/config/default-config.js')).href
      )
    ).default as { categories: Record<string, { auditRefs?: Array<{ id: string }> }> };

    const excluded = new Set<string>([...LIGHTHOUSE_EXCLUDED_AUDITS, ...INFORMATIVE]);
    const actual: string[] = [];
    for (const category of ['performance', 'seo']) {
      for (const ref of cfg.categories[category]?.auditRefs ?? []) {
        if (!excluded.has(ref.id)) actual.push(ref.id);
      }
    }
    const committed = JSON.parse(readFileSync(COMMITTED_PATH, 'utf-8')) as { lighthouse: string[] };
    expect([...new Set(actual)].sort()).toEqual(committed.lighthouse);
    // Importing Lighthouse's default config pulls in a large module graph and
    // takes several seconds on a cold cache, well past vitest's 5s default.
  }, 30_000);
});
