import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CUSTOM_CHECK_SEVERITY, type Finding } from '@odysseus/core';
import { RULE_TRANSLATIONS_FR } from './rule-translations.js';
import { loadSasFernandeFindings } from '../test-fixtures.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function loadFindings(relativeDir: string): Finding[] {
  return JSON.parse(
    readFileSync(path.join(moduleDir, relativeDir, 'findings.json'), 'utf-8'),
  ) as Finding[];
}

/**
 * item 38 [REGRESSION]: rule titles and codes rendered in English inside
 * a French report - flagged once (v2 prototype had translations + a
 * gloss), regressed when the shipped report dropped both. This test is
 * the enforcement mechanism the doc's own acceptance check asks for: a
 * ruleId appearing in real, committed fixture data with no translation
 * entry fails the build, so a newly observed rule can't silently ship
 * untranslated the way this class of rule did before.
 */
describe('item 38: every ruleId observed in real fixture data has a French translation', () => {
  it('every ruleId in the sas-fernande.fr fixture is covered', async () => {
    const findings = await loadSasFernandeFindings();
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter(
      (id) => !RULE_TRANSLATIONS_FR[id],
    );
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every ruleId in the real haaitza.com fixture is covered', () => {
    const findings = loadFindings('../../../../artifacts/haaitza.com/2026-08-06T20-30-06Z');
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter(
      (id) => !RULE_TRANSLATIONS_FR[id],
    );
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every ruleId in the real Palais Gallien fixture is covered', () => {
    const findings = loadFindings(
      '../../../../artifacts/www.hotel-palais-gallien-bordeaux.com/2026-08-17T14-13-52Z',
    );
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter(
      (id) => !RULE_TRANSLATIONS_FR[id],
    );
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  // item 2.3 [REGRESSION]: frame-title rendered as raw English
  // ("Frames must have an accessible name") in a real La Corniche
  // report - this fixture is exactly what would have caught it, had it
  // been added when the site was first scanned.
  it('every ruleId in the real La Corniche fixture is covered', () => {
    const findings = loadFindings('../../../../artifacts/lacoorniche.com/2026-08-19T00-54-32Z');
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter(
      (id) => !RULE_TRANSLATIONS_FR[id],
    );
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  // P1.1 (2026-08-21 La Corniche feedback pass, regression): the
  // 00-54-32Z fixture above doesn't contain 'aria-command-name' or
  // 'opengraph-missing' - this later same-day scan does, and is exactly
  // what would have caught both leaking untranslated into a real report.
  it('every ruleId in the 2026-08-19T11-15-01Z La Corniche fixture is covered (aria-command-name, opengraph-missing)', () => {
    const findings = loadFindings('../../../../artifacts/lacoorniche.com/2026-08-19T11-15-01Z');
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter(
      (id) => !RULE_TRANSLATIONS_FR[id],
    );
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  // A5 (2026-08-24 three-site review): every fixture pinned above
  // predates milestone 8.6, so all five security-header rules plus
  // structured-data-invalid, canonical-target-noindex, crux-lcp-poor,
  // link-text and scrollable-region-focusable leaked untranslated into
  // three real client reports while this suite stayed green. These three
  // 2026-08-22 scans are the ones that would have caught it. Pin a fresh
  // scan here whenever a detection milestone adds rules, or this guard
  // silently stops covering the newest half of the scanner.
  it.each([
    [
      'Palais Gallien 2026-08-22',
      '../../../../artifacts/www.hotel-palais-gallien-bordeaux.com/2026-08-22T16-31-02Z',
    ],
    ['haaitza.com 2026-08-22', '../../../../artifacts/haaitza.com/2026-08-22T22-07-44Z'],
    ['La Corniche 2026-08-22', '../../../../artifacts/www.lacoorniche.com/2026-08-22T22-07-45Z'],
  ])('every ruleId in the real %s fixture is covered', (_name, dir) => {
    const findings = loadFindings(dir);
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter(
      (id) => !RULE_TRANSLATIONS_FR[id],
    );
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every entry has both a non-empty label and a non-empty gloss', () => {
    for (const [ruleId, translation] of Object.entries(RULE_TRANSLATIONS_FR)) {
      expect(translation.label.length, `${ruleId} has an empty label`).toBeGreaterThan(0);
      expect(translation.gloss.length, `${ruleId} has an empty gloss`).toBeGreaterThan(0);
    }
  });
});

/**
 * Source-derived coverage, added 2026-08-24 after `hreflang-missing` and
 * `sitemap-stale` both rendered in English inside a real French report
 * (Domaine Lagnonu).
 *
 * The fixture-driven tests above can only see a ruleId that some committed
 * scan happened to emit, so this table was extended reactively four times,
 * each time after a client-facing report had already leaked English. This
 * check does not wait for a scan: every custom rule that has a severity
 * mapping is a rule the system can emit, so every one of them needs a
 * French label before it can ever reach a report.
 *
 * Scoped to CUSTOM_CHECK_SEVERITY rather than all of axe and Lighthouse
 * deliberately - those two have far larger rule universes that this repo
 * does not own, and the fixture tests above remain the right mechanism for
 * them. Custom rules are ours, enumerable, and the ones this table has
 * repeatedly missed.
 */
describe('every custom rule that can be emitted has a French translation', () => {
  it('covers every ruleId in CUSTOM_CHECK_SEVERITY', () => {
    const missing = Object.keys(CUSTOM_CHECK_SEVERITY).filter((id) => !RULE_TRANSLATIONS_FR[id]);
    expect(
      missing,
      `custom rules with a severity mapping but no French label: ${missing.join(', ')}`,
    ).toEqual([]);
  });
});

/**
 * Full reachable-set coverage, 2026-08-24 (operator decision: translate
 * everything rather than wait for the next leak).
 *
 * reachable-rule-ids.json lists every axe rule our WCAG tag filter can reach
 * and every Lighthouse performance/seo audit that can emit a finding. It is
 * committed data because this package depends on neither scanner, and adding
 * them here would mean new dependencies for a test;
 * packages/scanner/src/reachable-rule-ids.test.ts recomputes the same list
 * from the installed packages and fails if the committed copy has drifted, so
 * an axe or Lighthouse upgrade cannot quietly introduce an untranslated rule.
 *
 * Together with the CUSTOM_CHECK_SEVERITY check above, this covers all three
 * sources a finding can come from.
 */
describe('every rule the scanners can emit has a French translation', () => {
  const reachable = JSON.parse(
    readFileSync(path.join(moduleDir, 'reachable-rule-ids.json'), 'utf-8'),
  ) as { axe: string[]; lighthouse: string[] };

  it('covers every reachable axe rule', () => {
    const missing = reachable.axe.filter((id) => !RULE_TRANSLATIONS_FR[id]);
    expect(missing, `axe rules with no French label: ${missing.join(', ')}`).toEqual([]);
  });

  it('covers every reachable Lighthouse audit', () => {
    const missing = reachable.lighthouse.filter((id) => !RULE_TRANSLATIONS_FR[id]);
    expect(missing, `Lighthouse audits with no French label: ${missing.join(', ')}`).toEqual([]);
  });
});
