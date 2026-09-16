import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CUSTOM_CHECK_SEVERITY } from '@odysseus/core';
import { RULE_TRANSLATIONS_FR } from './rule-translations.js';
import { loadObservedFixtureRuleIds } from '../test-fixtures.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

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
  it('covers every ruleId in the committed de-identified fixture set', async () => {
    const observed = await loadObservedFixtureRuleIds();
    expect(observed.size).toBeGreaterThan(50);

    const missing = [...observed].filter((id) => !RULE_TRANSLATIONS_FR[id]);
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

// Issue #329: Lighthouse titles read as literal translations and mixed
// nouns ("Arbre des dépendances réseau") with imperatives ("Minifier le
// CSS"). Every label is now a finding statement, like the axe and SEO
// titles.
describe('French rule labels are finding statements (issue #329)', () => {
  const IMPERATIVE_OPENERS =
    /^(Réduire|Éviter|Utiliser|Minifier|Servir|Différer|Précharger|Éliminer|Garantir|Encoder|Préconnecter|Dimensionner|Activer)\b/;
  const LITERAL_NOUN_TITLES = [
    'Arbre des dépendances réseau',
    "Détail du temps d'affichage principal",
    'Découverte de la requête du LCP',
    'Amélioration de la diffusion des images',
    'Latence de la requête du document',
    'Recalcul de mise en page forcé',
  ];

  it('never opens a label on an imperative verb', () => {
    const imperative = Object.entries(RULE_TRANSLATIONS_FR)
      .filter(([, t]) => IMPERATIVE_OPENERS.test(t.label))
      .map(([id, t]) => `${id}: ${t.label}`);
    expect(imperative).toEqual([]);
  });

  it('no longer carries the literal noun titles from the review', () => {
    const labels = Object.values(RULE_TRANSLATIONS_FR).map((t) => t.label.replace(/’/g, "'"));
    for (const title of LITERAL_NOUN_TITLES) expect(labels).not.toContain(title);
  });
});
