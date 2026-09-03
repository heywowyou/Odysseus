/**
 * The same enforcement mechanism rule-translations.test.ts uses: a rule id
 * observed in real scanner output but carrying no remediation copy fails the
 * build rather than rendering as a finding a client is told nothing about.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CUSTOM_CHECK_SEVERITY } from '@odysseus/core';
import { loadObservedFixtureRuleIds } from '../../test-fixtures.js';
import { REMEDIATION_FR, REMEDIATION_EN, remediationFor } from './index.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

describe('remediation copy', () => {
  it('covers every rule id observed in the committed reference audits', async () => {
    const observed = await loadObservedFixtureRuleIds();
    expect(observed.size).toBeGreaterThan(50);

    const uncovered = [...observed].filter((ruleId) => REMEDIATION_FR[ruleId] === undefined).sort();
    expect(uncovered).toEqual([]);
  }, 20000);

  /**
   * Source-derived coverage, the same mechanism and the same reasoning as
   * rule-translations.test.ts's CUSTOM_CHECK_SEVERITY check.
   *
   * The fixture-driven test above can only see a rule id some committed scan
   * happened to emit, and the missing-remediation boundary in
   * rendered-priorities.ts is fail-loud: a priority finding naming a rule with
   * no entry aborts report generation entirely. Those two together mean a rule
   * absent from every fixture takes down a paid audit at the last stage, after
   * the scan and the model passes have already been paid for. That is exactly
   * what happened with keyboard-trap, and the copy fix alone left 17 other
   * custom rules in the same position.
   */
  it('covers every custom rule that can be emitted, in both languages', () => {
    const ruleIds = Object.keys(CUSTOM_CHECK_SEVERITY);
    const missingFr = ruleIds.filter((ruleId) => REMEDIATION_FR[ruleId] === undefined).sort();
    const missingEn = ruleIds.filter((ruleId) => REMEDIATION_EN[ruleId] === undefined).sort();
    expect(missingFr, `custom rules with a severity mapping but no French remediation`).toEqual([]);
    expect(missingEn, `custom rules with a severity mapping but no English remediation`).toEqual(
      [],
    );
  });

  /**
   * Full reachable-set coverage, 2026-09-03, the same operator decision
   * rule-translations.test.ts took on 2026-08-24: cover everything the
   * scanners can emit rather than wait for the next production failure.
   *
   * Filling the custom rules above closed one class and left this one open:
   * 66 of the 113 reachable axe and Lighthouse rules had no copy, and the
   * fail-loud boundary treats them identically, so any of them could still
   * abort a paid report. Every one of those rules already carried a reviewed
   * French label and gloss in rule-translations.ts, so the remediation lines
   * were written from reviewed descriptions of what each rule detects, not
   * invented.
   *
   * reachable-rule-ids.json is committed data because this package depends on
   * neither scanner; packages/scanner/src/reachable-rule-ids.test.ts
   * recomputes it from the installed packages and fails on drift. So an
   * axe-core or Lighthouse upgrade that introduces a rule now fails here
   * until copy is written for it, which is the intended cost of this check.
   */
  describe('every rule the scanners can emit has remediation copy', () => {
    const reachable = JSON.parse(
      readFileSync(path.join(moduleDir, '../reachable-rule-ids.json'), 'utf-8'),
    ) as { axe: string[]; lighthouse: string[] };

    it('covers every reachable axe rule, in both languages', () => {
      const missingFr = reachable.axe.filter((ruleId) => REMEDIATION_FR[ruleId] === undefined);
      const missingEn = reachable.axe.filter((ruleId) => REMEDIATION_EN[ruleId] === undefined);
      expect(missingFr, `axe rules with no French remediation: ${missingFr.join(', ')}`).toEqual(
        [],
      );
      expect(missingEn, `axe rules with no English remediation: ${missingEn.join(', ')}`).toEqual(
        [],
      );
    });

    it('covers every reachable Lighthouse audit, in both languages', () => {
      const missingFr = reachable.lighthouse.filter(
        (ruleId) => REMEDIATION_FR[ruleId] === undefined,
      );
      const missingEn = reachable.lighthouse.filter(
        (ruleId) => REMEDIATION_EN[ruleId] === undefined,
      );
      expect(
        missingFr,
        `Lighthouse audits with no French remediation: ${missingFr.join(', ')}`,
      ).toEqual([]);
      expect(
        missingEn,
        `Lighthouse audits with no English remediation: ${missingEn.join(', ')}`,
      ).toEqual([]);
    });
  });

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
