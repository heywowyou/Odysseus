/**
 * The same enforcement mechanism rule-translations.test.ts uses: a rule id
 * observed in real scanner output but carrying no remediation copy fails the
 * build rather than rendering as a finding a client is told nothing about.
 */
import { describe, expect, it } from 'vitest';
import { loadObservedFixtureRuleIds } from '../../test-fixtures.js';
import { REMEDIATION_FR, REMEDIATION_EN, remediationFor } from './index.js';

describe('remediation copy', () => {
  it('covers every rule id observed in the committed reference audits', async () => {
    const observed = await loadObservedFixtureRuleIds();
    expect(observed.size).toBeGreaterThan(50);

    const uncovered = [...observed].filter((ruleId) => REMEDIATION_FR[ruleId] === undefined).sort();
    expect(uncovered).toEqual([]);
  }, 20000);

  it('holds identical key sets in both languages', () => {
    expect(Object.keys(REMEDIATION_FR).sort()).toEqual(Object.keys(REMEDIATION_EN).sort());
  });

  it('returns undefined for an unobserved rule rather than inventing guidance', () => {
    expect(remediationFor('a-rule-nobody-has-seen', 'fr')).toBeUndefined();
    expect(remediationFor('a-rule-nobody-has-seen', 'en')).toBeUndefined();
  });

  it('uses no em or en dashes, per the house style rule', () => {
    for (const table of [REMEDIATION_FR, REMEDIATION_EN]) {
      for (const [ruleId, text] of Object.entries(table)) {
        expect(text, ruleId).not.toMatch(/[–—]/);
      }
    }
  });

  it('is written as guidance, not as a restatement of the problem', () => {
    // Every line must say something; a one-word or fragment entry would
    // pass the coverage test above while telling the reader nothing.
    for (const table of [REMEDIATION_FR, REMEDIATION_EN]) {
      for (const [ruleId, text] of Object.entries(table)) {
        expect(text.length, ruleId).toBeGreaterThan(30);
        expect(text.trim().endsWith('.'), ruleId).toBe(true);
      }
    }
  });
});
