import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { buildFallbackSiteContext, buildLlmInput, filterFindingsForLlm } from './build-input.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Real committed scan (11 pages, 78 findings), reused as the reference
 *  fixture per CLAUDE.md's testing conventions: "Both bugs found after
 *  Milestone 4 ... passed the entire test suite and were visible only in
 *  a real-site scan." Exercising the severity filter against real,
 *  messy scanner output is more meaningful than a hand-built fixture. */
function loadSasFernandeFindings(): Finding[] {
  const findingsPath = path.join(
    moduleDir,
    '../../../artifacts/sas-fernande.fr/2026-08-02T17-31-56Z/findings.json',
  );
  return JSON.parse(readFileSync(findingsPath, 'utf-8')) as Finding[];
}

describe('filterFindingsForLlm', () => {
  it('drops the 61 minor findings out of 78 on the real sas-fernande scan', () => {
    const findings = loadSasFernandeFindings();
    expect(findings).toHaveLength(78);

    const filtered = filterFindingsForLlm(findings);

    expect(filtered).toHaveLength(17);
    expect(filtered.every((f) => f.severity !== 'minor')).toBe(true);
  });

  it('keeps critical, serious, and moderate findings', () => {
    const findings = loadSasFernandeFindings();
    const filtered = filterFindingsForLlm(findings);

    const bySeverity = { critical: 0, serious: 0, moderate: 0 };
    for (const f of filtered) {
      if (f.severity === 'critical' || f.severity === 'serious' || f.severity === 'moderate') {
        bySeverity[f.severity]++;
      }
    }
    expect(bySeverity).toEqual({ critical: 7, serious: 8, moderate: 2 });
  });
});

describe('buildLlmInput', () => {
  it('maps filtered findings to the LlmInput.findings Pick shape', () => {
    const filtered = filterFindingsForLlm(loadSasFernandeFindings());
    const siteContext = buildFallbackSiteContext();

    const input = buildLlmInput(filtered, siteContext, 'fr');

    expect(input.language).toBe('fr');
    expect(input.siteContext).toBe(siteContext);
    expect(input.findings).toHaveLength(filtered.length);

    const mapped = input.findings[0];
    const source = filtered[0];
    if (!mapped || !source) throw new Error('expected at least one finding');
    expect(mapped).toEqual({
      findingId: source.findingId,
      source: source.source,
      ruleId: source.ruleId,
      category: source.category,
      severity: source.severity,
      wcagCriteria: source.wcagCriteria,
      title: source.title,
      description: source.description,
      pageUrls: source.pageUrls,
      occurrences: source.occurrences,
    });

    // Only the Pick<Finding, ...> fields should be present - no
    // rawEvidence, dedupeKey, elements, auditId, etc.
    expect(Object.keys(mapped).sort()).toEqual(
      [
        'findingId',
        'source',
        'ruleId',
        'category',
        'severity',
        'wcagCriteria',
        'title',
        'description',
        'pageUrls',
        'occurrences',
      ].sort(),
    );
  });
});

describe('buildFallbackSiteContext', () => {
  it('returns placeholder values that do not claim real intake data', () => {
    const context = buildFallbackSiteContext();

    expect(context).toEqual({
      businessType: 'unknown (no intake context provided)',
      primaryGoal: 'unknown (no intake context provided)',
      languagesServed: [],
      targetMarkets: [],
    });
  });
});
