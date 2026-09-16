import { describe, expect, it } from 'vitest';
import type { Finding } from '@odysseus/core';
import { groupAppendix } from './appendix-grouping.js';
import { loadSmallSiteFindings } from '../test-fixtures.js';

describe('groupAppendix', () => {
  it('groups the real small-site color-contrast findings by rule+severity, summing occurrences and unioning pages', async () => {
    const findings = await loadSmallSiteFindings();
    const groups = groupAppendix(findings);

    const colorContrast = groups.find((g) => g.ruleId === 'color-contrast');
    if (!colorContrast) throw new Error('expected a color-contrast group');

    // Known-good numbers, docs/rules/normalization-rules.md section 7 and
    // CLAUDE.md: 4 findings, 35 occurrences (11+11+2+11).
    expect(colorContrast.findings).toHaveLength(4);
    expect(colorContrast.totalOccurrences).toBe(35);
    // item 1.6: union of page URLs across the group's findings, not the
    // largest single finding's own page count (used to read 11, the max
    // of one finding alone) - the real fixture's 4 findings' page sets
    // union to the number asserted here.
    const unionPages = new Set(colorContrast.findings.flatMap((f) => f.pageUrls));
    expect(colorContrast.pages).toBe(unionPages.size);
    expect(colorContrast.severity).toBe('serious');
  });

  it('keeps a single-finding, high-occurrence rule as its own group (link-in-text-block, 69 occurrences on one page)', async () => {
    const findings = await loadSmallSiteFindings();
    const groups = groupAppendix(findings);

    const linkInTextBlock = groups.find((g) => g.ruleId === 'link-in-text-block');
    if (!linkInTextBlock) throw new Error('expected a link-in-text-block group');
    expect(linkInTextBlock.findings).toHaveLength(1);
    expect(linkInTextBlock.totalOccurrences).toBe(69);
    expect(linkInTextBlock.pages).toBe(1);
  });

  // item 1.6 (Large Rule Families pass): a real report showed a priority card
  // stating "18 pages sur 18" for a rule while the annex group for that
  // same rule said "jusqu'à 17 pages" - two findings of the same rule
  // covered overlapping but not identical page sets, and the old
  // Math.max computation undercounted the true union.
  it('unions pages across multiple findings of the same rule, not the largest single finding', () => {
    const base = {
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      ruleId: 'button-name',
      category: 'accessibility' as const,
      severity: 'critical' as const,
      wcagCriteria: ['4.1.2'],
      title: 't',
      description: 'd',
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
    const findings: Finding[] = [
      {
        ...base,
        findingId: 'f1',
        dedupeKey: 'd1',
        pageUrls: ['https://example.com/a', 'https://example.com/b'],
      },
      {
        ...base,
        findingId: 'f2',
        dedupeKey: 'd2',
        pageUrls: ['https://example.com/b', 'https://example.com/c'],
      },
    ];

    const groups = groupAppendix(findings);
    // Math.max of either finding alone would be 2; the true union is 3.
    expect(groups[0]!.pages).toBe(3);
  });

  it('sorts groups by severity descending, then total occurrences descending', async () => {
    const findings = await loadSmallSiteFindings();
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
    const findings = await loadSmallSiteFindings();
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

// Issue #291: findings record every real URL - language variants kept after
// a translation-cluster merge, plus origin-level findings citing
// discovered-but-not-scanned pages - so the group's page union could exceed
// the analysed-page total (a real report claimed 206 pages out of 140).
// findings-appendix.ts always passes the visited-page scope; the count is
// confined, the findings and occurrences are not.
describe('issue #291: group page unions are confined to the analysed (visited) scope', () => {
  const base = {
    auditId: 'a1',
    schemaVersion: 1 as const,
    source: 'axe' as const,
    ruleId: 'button-name',
    category: 'accessibility' as const,
    severity: 'critical' as const,
    wcagCriteria: ['4.1.2'],
    title: 't',
    description: 'd',
    occurrences: 2,
    elements: [],
    rawEvidence: {},
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
  const scopePageUrls = new Set(['https://example.com/in-1', 'https://example.com/in-2']);

  it('counts only in-scope URLs in group.pages, leaving findings and occurrences intact', () => {
    const findings: Finding[] = [
      {
        ...base,
        findingId: 'f1',
        dedupeKey: 'd1',
        pageUrls: ['https://example.com/in-1', 'https://example.com/out-1'],
      },
      {
        ...base,
        findingId: 'f2',
        dedupeKey: 'd2',
        pageUrls: ['https://example.com/in-2', 'https://example.com/out-2'],
      },
    ];

    const groups = groupAppendix(findings, scopePageUrls);
    expect(groups).toHaveLength(1);
    // The raw union would read 4; only the 2 visited pages count.
    expect(groups[0]!.pages).toBe(2);
    expect(groups[0]!.findings).toHaveLength(2);
    expect(groups[0]!.totalOccurrences).toBe(4);
  });

  it('a group cited only on out-of-scope pages drops to zero pages rather than an unconfined figure', () => {
    const findings: Finding[] = [
      {
        ...base,
        findingId: 'f1',
        dedupeKey: 'd1',
        pageUrls: ['https://example.com/out-1', 'https://example.com/out-2'],
      },
    ];

    const groups = groupAppendix(findings, scopePageUrls);
    expect(groups[0]!.pages).toBe(0);
    expect(groups[0]!.findings).toHaveLength(1);
  });

  it('without a scope the raw union is kept, matching the pre-#291 behavior', () => {
    const findings: Finding[] = [
      {
        ...base,
        findingId: 'f1',
        dedupeKey: 'd1',
        pageUrls: ['https://example.com/in-1', 'https://example.com/out-1'],
      },
    ];

    expect(groupAppendix(findings)[0]!.pages).toBe(2);
  });
});

// item 26: minor findings no longer get a separate condensed pass - they
// group through groupAppendix like every other severity, and sort to the
// bottom by SEVERITY_ORDER rather than having their own detail withheld.
describe('groupAppendix includes minor findings with full detail, sorted last', () => {
  it('groups every real minor finding into per-rule RuleGroups, not a condensed summary', async () => {
    const findings = await loadSmallSiteFindings();
    const minor = findings.filter((f) => f.severity === 'minor');
    // Derived, not pinned: this fixture is re-normalizable and its minor
    // count moves with every collapse change. The invariant is that grouping
    // loses none of them.
    expect(minor.length).toBeGreaterThan(0);

    const groups = groupAppendix(minor);

    // 30 distinct minor ruleIds in the real fixture, but item 1.3's
    // image-weight family clustering (added in the v2 pass) folds several
    // of them into one group - 26 groups, not 30, is the expected result
    // now, not a regression. Findings themselves are neither dropped nor
    // duplicated by clustering, confirmed by the total below.
    // Fewer groups than findings is the property under test (rule-family
    // clustering), not a specific total: the fixture is re-normalizable and
    // both numbers move together.
    expect(groups.length).toBeLessThan(minor.length);
    expect(groups.length).toBeGreaterThan(0);
    expect(groups.reduce((sum, g) => sum + g.findings.length, 0)).toBe(minor.length);
    // Every finding object survives intact in its group - this is the
    // whole point of item 26: full page/selector detail, not a summary.
    for (const group of groups) {
      for (const finding of group.findings) {
        expect(finding.pageUrls.length).toBeGreaterThan(0);
      }
    }
  });

  it('sorts minor-severity groups after every other severity when mixed', async () => {
    const findings = await loadSmallSiteFindings();
    const groups = groupAppendix(findings);
    const minorIndex = groups.findIndex((g) => g.severity === 'minor');
    const lastNonMinorIndex = groups.map((g) => g.severity).lastIndexOf('serious');
    expect(minorIndex).toBeGreaterThan(-1);
    if (lastNonMinorIndex !== -1) {
      expect(minorIndex).toBeGreaterThan(lastNonMinorIndex);
    }
  });
});

// item 1.3: seven separate Lighthouse rules ("your images are heavy")
// read as seven distinct problems to a client when they are one
// remediation job - confirmed against a real report (~60 findings, ~550
// occurrences across the seven rules combined).
describe('item 1.3: the image-weight rule family clusters into one group', () => {
  const base = {
    auditId: 'a1',
    schemaVersion: 1 as const,
    source: 'lighthouse' as const,
    category: 'performance' as const,
    severity: 'moderate' as const,
    wcagCriteria: [],
    title: 't',
    description: 'd',
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };
  const familyRuleIds = [
    'unsized-images',
    'modern-image-formats',
    'offscreen-images',
    'uses-responsive-images',
    'uses-optimized-images',
    'image-delivery-insight',
    'prioritize-lcp-image',
  ];

  it('folds all 7 family members, at the same severity, into a single group', () => {
    const findings: Finding[] = familyRuleIds.map((ruleId, i) => ({
      ...base,
      findingId: `f${i}`,
      ruleId,
      dedupeKey: `d${i}`,
      pageUrls: [`https://example.com/${i}`],
    }));

    const groups = groupAppendix(findings);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.findings).toHaveLength(7);
    expect(groups[0]!.ruleId).toBe('image-weight');
    expect(groups[0]!.memberRuleIds).toEqual([...familyRuleIds].sort());
  });

  it('keeps a family split into two groups when members have different severities', () => {
    const findings: Finding[] = [
      {
        ...base,
        findingId: 'f1',
        ruleId: 'unsized-images',
        severity: 'moderate',
        dedupeKey: 'd1',
        pageUrls: ['https://example.com/a'],
      },
      {
        ...base,
        findingId: 'f2',
        ruleId: 'modern-image-formats',
        severity: 'minor',
        dedupeKey: 'd2',
        pageUrls: ['https://example.com/b'],
      },
    ];

    const groups = groupAppendix(findings);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.ruleId === 'image-weight')).toBe(true);
  });

  it('leaves a non-family ruleId completely unaffected (memberRuleIds has exactly one entry)', () => {
    const findings: Finding[] = [
      {
        ...base,
        findingId: 'f1',
        ruleId: 'color-contrast',
        severity: 'serious',
        dedupeKey: 'd1',
        pageUrls: ['https://example.com/a'],
      },
    ];

    const groups = groupAppendix(findings);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.ruleId).toBe('color-contrast');
    expect(groups[0]!.memberRuleIds).toEqual(['color-contrast']);
  });
});
