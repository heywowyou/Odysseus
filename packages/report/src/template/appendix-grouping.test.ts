import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { groupAppendix } from './appendix-grouping.js';
import { loadSasFernandeFindings } from '../test-fixtures.js';

describe('groupAppendix', () => {
  it('groups the real sas-fernande color-contrast findings by rule+severity, summing occurrences and taking the max page count', async () => {
    const findings = await loadSasFernandeFindings();
    const groups = groupAppendix(findings);

    const colorContrast = groups.find((g) => g.ruleId === 'color-contrast');
    if (!colorContrast) throw new Error('expected a color-contrast group');

    // Known-good numbers, docs/normalization-rules.md section 7 and
    // CLAUDE.md: 4 findings, 35 occurrences (11+11+2+11), max 11 pages.
    expect(colorContrast.findings).toHaveLength(4);
    expect(colorContrast.totalOccurrences).toBe(35);
    expect(colorContrast.maxPages).toBe(11);
    expect(colorContrast.severity).toBe('serious');
  });

  it('keeps a single-finding, high-occurrence rule as its own group (link-in-text-block, 69 occurrences on one page)', async () => {
    const findings = await loadSasFernandeFindings();
    const groups = groupAppendix(findings);

    const linkInTextBlock = groups.find((g) => g.ruleId === 'link-in-text-block');
    if (!linkInTextBlock) throw new Error('expected a link-in-text-block group');
    expect(linkInTextBlock.findings).toHaveLength(1);
    expect(linkInTextBlock.totalOccurrences).toBe(69);
    expect(linkInTextBlock.maxPages).toBe(1);
  });

  it('sorts groups by severity descending, then total occurrences descending', async () => {
    const findings = await loadSasFernandeFindings();
    const groups = groupAppendix(findings);

    for (let i = 1; i < groups.length; i++) {
      const prev = groups[i - 1]!;
      const curr = groups[i]!;
      const severityOrder = { critical: 4, serious: 3, moderate: 2, minor: 1 };
      const prevWeight = severityOrder[prev.severity];
      const currWeight = severityOrder[curr.severity];
      expect(prevWeight >= currWeight).toBe(true);
      if (prevWeight === currWeight) {
        expect(prev.totalOccurrences >= curr.totalOccurrences).toBe(true);
      }
    }
  });

  it('accumulates every distinct finding into exactly one group, none dropped or duplicated', async () => {
    const findings = await loadSasFernandeFindings();
    const groups = groupAppendix(findings);

    const totalFindingsInGroups = groups.reduce((sum, g) => sum + g.findings.length, 0);
    expect(totalFindingsInGroups).toBe(findings.length);
  });

  it('unions wcagCriteria across a group, sorted numerically', () => {
    const base = {
      findingId: 'f1',
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      ruleId: 'link-name',
      category: 'accessibility' as const,
      severity: 'serious' as const,
      title: 'Link has no accessible name',
      description: 'desc',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'd1',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const findings: Finding[] = [
      { ...base, findingId: 'f1', wcagCriteria: ['4.1.2'], dedupeKey: 'd1' },
      { ...base, findingId: 'f2', wcagCriteria: ['2.4.4', '4.1.2'], dedupeKey: 'd2' },
    ];

    const groups = groupAppendix(findings);
    expect(groups[0]!.wcagCriteria).toEqual(['2.4.4', '4.1.2']);
  });
});

// item 26: minor findings no longer get a separate condensed pass - they
// group through groupAppendix like every other severity, and sort to the
// bottom by SEVERITY_ORDER rather than having their own detail withheld.
describe('groupAppendix includes minor findings with full detail, sorted last', () => {
  it('groups the 61 real minor findings into per-rule RuleGroups, not a condensed summary', async () => {
    const findings = await loadSasFernandeFindings();
    const minor = findings.filter((f) => f.severity === 'minor');
    expect(minor).toHaveLength(61);

    const groups = groupAppendix(minor);

    // 30 distinct minor ruleIds in the real fixture.
    expect(groups).toHaveLength(30);
    expect(groups.reduce((sum, g) => sum + g.findings.length, 0)).toBe(61);
    // Every finding object survives intact in its group - this is the
    // whole point of item 26: full page/selector detail, not a summary.
    for (const group of groups) {
      for (const finding of group.findings) {
        expect(finding.pageUrls.length).toBeGreaterThan(0);
      }
    }
  });

  it('sorts minor-severity groups after every other severity when mixed', async () => {
    const findings = await loadSasFernandeFindings();
    const groups = groupAppendix(findings);
    const minorIndex = groups.findIndex((g) => g.severity === 'minor');
    const lastNonMinorIndex = groups.map((g) => g.severity).lastIndexOf('serious');
    expect(minorIndex).toBeGreaterThan(-1);
    if (lastNonMinorIndex !== -1) {
      expect(minorIndex).toBeGreaterThan(lastNonMinorIndex);
    }
  });
});
