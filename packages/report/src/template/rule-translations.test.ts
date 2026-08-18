import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { RULE_TRANSLATIONS_FR } from './rule-translations.js';
import { loadSasFernandeFindings } from '../test-fixtures.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

function loadFindings(relativeDir: string): Finding[] {
  return JSON.parse(readFileSync(path.join(moduleDir, relativeDir, 'findings.json'), 'utf-8')) as Finding[];
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
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter((id) => !RULE_TRANSLATIONS_FR[id]);
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every ruleId in the real haaitza.com fixture is covered', () => {
    const findings = loadFindings('../../../../artifacts/haaitza.com/2026-08-06T20-30-06Z');
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter((id) => !RULE_TRANSLATIONS_FR[id]);
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every ruleId in the real Palais Gallien fixture is covered', () => {
    const findings = loadFindings(
      '../../../../artifacts/www.hotel-palais-gallien-bordeaux.com/2026-08-17T14-13-52Z',
    );
    const missing = [...new Set(findings.map((f) => f.ruleId))].filter((id) => !RULE_TRANSLATIONS_FR[id]);
    expect(missing, `missing translations for: ${missing.join(', ')}`).toEqual([]);
  });

  it('every entry has both a non-empty label and a non-empty gloss', () => {
    for (const [ruleId, translation] of Object.entries(RULE_TRANSLATIONS_FR)) {
      expect(translation.label.length, `${ruleId} has an empty label`).toBeGreaterThan(0);
      expect(translation.gloss.length, `${ruleId} has an empty gloss`).toBeGreaterThan(0);
    }
  });
});
