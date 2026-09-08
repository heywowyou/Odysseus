import { describe, expect, it } from 'vitest';
import type { Finding, Theme } from '@odysseus/core';
import { LCEN_MENTIONS_LEGALES_RULE_ID } from '@odysseus/core';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../test-fixtures.js';
import { buildRenderedPriorities, summarizePriorityOwnership } from './rendered-priorities.js';
import { renderThemes } from './sections/themes.js';
import { getStrings } from './strings/i18n.js';

function buildFinding(overrides: Partial<Finding> & { findingId: string }): Finding {
  return {
    auditId: 'a1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: [],
    title: `Title ${overrides.findingId}`,
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: overrides.findingId,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  };
}

function buildTheme(findingIds: string[]): Theme {
  return {
    title: 'Contraste insuffisant',
    category: 'accessibility',
    businessImpact: 'Impact',
    effort: 'low',
    impact: 'high',
    priorityRank: 1,
    findingIds,
    recommendedActions: ['Action'],
  };
}

describe('buildRenderedPriorities', () => {
  it('assigns contiguous display ranks while preserving model ranks', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('en'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    const themes = analysis.themes.map((theme, index) => ({
      ...theme,
      priorityRank: index === 1 ? 9 : theme.priorityRank,
    }));
    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    expect(priorities.map((priority) => priority.displayRank)).toEqual(
      priorities.map((_, index) => index + 1),
    );
    expect(
      priorities.some((priority) => priority.theme.priorityRank !== priority.displayRank),
    ).toBe(true);
    expect(priorities.every((priority) => priority.remediations.length > 0)).toBe(true);
  });

  it('fails with every missing reviewed rule ID', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('en'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    const usedId = analysis.themes[0]!.findingIds[0]!;
    const changed = findings.map((finding) =>
      finding.findingId === usedId ? { ...finding, ruleId: 'unreviewed-rule' } : finding,
    );
    expect(() => buildRenderedPriorities(analysis.themes, changed, manifest, 'en')).toThrow(
      'unreviewed-rule',
    );
  });

  it('rejects a legacy analysis theme that still contains an LCEN finding', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    const usedId = analysis.themes[0]!.findingIds[0]!;
    const changed = findings.map((finding) =>
      finding.findingId === usedId
        ? { ...finding, ruleId: LCEN_MENTIONS_LEGALES_RULE_ID }
        : finding,
    );
    expect(() => buildRenderedPriorities(analysis.themes, changed, manifest, 'fr')).toThrow(
      'Regenerate the analysis structure',
    );
  });
});

describe('summarizePriorityOwnership', () => {
  // Issue #83: a finding shared between two priorities used to be counted
  // once per priority it appeared in, so this total could exceed the
  // distinct-finding count printed elsewhere in the executive summary.
  it('counts a finding shared between two priorities exactly once', async () => {
    const manifest = await loadSmallSiteManifest();
    const shared = buildFinding({ findingId: 'shared-1' });
    const onlyInB = buildFinding({ findingId: 'only-in-b' });
    const themeA = buildTheme([shared.findingId]);
    const themeB = { ...buildTheme([shared.findingId, onlyInB.findingId]), priorityRank: 2 };
    const priorities = buildRenderedPriorities([themeA, themeB], [shared, onlyInB], manifest, 'en');

    const naiveSum = priorities.reduce(
      (sum, priority) => sum + Object.values(priority.ownershipCounts).reduce((a, b) => a + b, 0),
      0,
    );
    expect(naiveSum).toBe(3);

    const total = summarizePriorityOwnership(priorities, manifest);
    const totalCount = Object.values(total).reduce((a, b) => a + b, 0);
    expect(totalCount).toBe(2);
  });
});

// Plan 018 step 6: RenderedPriority owns a deterministic evidence summary
// consumed by every priority surface, so no template ever re-derives rule
// selection. These tests pin the selection rules themselves: representative
// finding by highest severity then lexicographically smallest findingId,
// representative page as the lexicographically first entry of that
// finding's own pageUrls (issue #40), and exact unique-page and occurrence
// counts, with both counts confined to the same visited-page population
// (issue #41 for pages, issue #100 for occurrences) and computed over the
// card's full finding set (issue #100).
describe('plan 018 step 6: deterministic priority evidence', () => {
  const manifest = { pages: [] } as never;

  it('breaks a severity tie with the lexicographically smallest findingId, whatever the array order', () => {
    const findings = [buildFinding({ findingId: 'f002' }), buildFinding({ findingId: 'f001' })];
    const themes = [buildTheme(['f002', 'f001'])];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.representativeFinding.findingId).toBe('f001');
    expect(priority.evidence.representativeLabel).toBe('Title f001');
  });

  it('prefers the higher severity over the smaller findingId', () => {
    const findings = [
      buildFinding({ findingId: 'f001', severity: 'serious' }),
      buildFinding({ findingId: 'f009', severity: 'critical' }),
    ];
    const themes = [buildTheme(['f001', 'f009'])];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.representativeFinding.findingId).toBe('f009');
  });

  it('picks the lexicographically first page of the deduplicated union and carries exact counts', () => {
    const longUrl =
      'https://example.com/very/long/path/that/keeps/going/and-going/beyond/any/reasonable/width/b';
    const findings = [
      buildFinding({
        findingId: 'f001',
        occurrences: 2,
        pageUrls: [longUrl, 'https://example.com/a'],
      }),
      buildFinding({
        findingId: 'f002',
        occurrences: 3,
        pageUrls: ['https://example.com/a'],
        severity: 'critical',
      }),
    ];
    const themes = [buildTheme(['f001', 'f002'])];

    // Issue #41: the unique-page count is confined to the manifest's
    // visited pages, the same population the "sur {totalPages}" denominator
    // counts, so this test's manifest declares both cited URLs visited.
    const manifest = {
      pages: [
        { url: longUrl, status: 'visited' },
        { url: 'https://example.com/a', status: 'visited' },
      ],
    } as never;
    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    // The union is {longUrl, /a}; /a sorts first. The duplicate /a entry is
    // counted once, not twice.
    expect(priority.evidence.representativePageUrl).toBe('https://example.com/a');
    expect(priority.evidence.uniquePageCount).toBe(2);
    // Occurrences sum across every finding in the priority, not the max.
    expect(priority.evidence.occurrenceCount).toBe(5);
    // The critical finding wins the representative slot (see the rule above).
    expect(priority.evidence.representativeFinding.findingId).toBe('f002');
  });

  // Issue #40: the representative page used to be the first URL of the
  // whole priority's union, so the "observed for example on page P"
  // sentence could name a page the quoted finding never occurred on (a
  // real report cited the never-scanned homepage for a finding whose only
  // page was /fr/mentions-et-credits). The page must come from the
  // representative finding itself, so the sentence and the finding cannot
  // disagree.
  it('takes the representative page from the representative finding own pageUrls, not the priority union', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        severity: 'serious',
        pageUrls: ['https://example.com/a', 'https://example.com/b'],
      }),
      buildFinding({
        findingId: 'f002',
        severity: 'critical',
        pageUrls: ['https://example.com/z'],
      }),
    ];
    const themes = [buildTheme(['f001', 'f002'])];

    const priorities = buildRenderedPriorities(themes, findings, { pages: [] } as never, 'en');
    const priority = priorities[0]!;

    // f002 wins the representative slot on severity; /a sorts before /z,
    // so the old union-based choice would have named /a - a page f002 was
    // never observed on.
    expect(priority.evidence.representativeFinding.findingId).toBe('f002');
    expect(priority.evidence.representativePageUrl).toBe('https://example.com/z');
    expect(priority.evidence.representativePageUrl).toBe(
      [...priority.evidence.representativeFinding.pageUrls].sort()[0],
    );
  });

  // Issue #41 invariant: a priority's page count renders against the
  // visited-page total ("N pages sur M"), so a URL outside the visited
  // scope (here, a discovered-but-not-scanned page an origin-level finding
  // still cites) must never push the numerator past the denominator.
  it('never counts a cited page outside the visited scope into uniquePageCount', () => {
    const visitedUrls = Array.from({ length: 4 }, (_, i) => `https://example.com/page-${i}`);
    const findings = [
      buildFinding({
        findingId: 'f001',
        occurrences: 2,
        pageUrls: [...visitedUrls, 'https://example.com/'],
      }),
      buildFinding({
        findingId: 'f002',
        occurrences: 1,
        pageUrls: ['https://example.com/page-0'],
      }),
    ];
    const themes = [buildTheme(['f001', 'f002'])];
    const manifest = {
      pages: [
        ...visitedUrls.map((url) => ({ url, status: 'visited' })),
        { url: 'https://example.com/', status: 'discovered-not-scanned' },
      ],
    } as never;

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const visitedCount = 4;

    expect(priorities[0]!.evidence.uniquePageCount).toBeLessThanOrEqual(visitedCount);
    // The out-of-scope homepage is excluded from the count specifically,
    // not just bounded by it.
    expect(priorities[0]!.evidence.uniquePageCount).toBe(4);
  });

  it('carries zero-page evidence unchanged when no finding in the priority has a page URL', () => {
    const findings = [
      buildFinding({ findingId: 'f001', pageUrls: [], occurrences: 2 }),
      buildFinding({ findingId: 'f002', pageUrls: [], occurrences: 3 }),
    ];
    const themes = [buildTheme(['f001', 'f002'])];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.representativePageUrl).toBeUndefined();
    expect(priority.evidence.uniquePageCount).toBe(0);
    expect(priority.evidence.occurrenceCount).toBe(5);
  });

  it('resolves the representative label through the shared helper: reviewed French rule label in fr, scanner title in en', async () => {
    const findings = [buildFinding({ findingId: 'f001', ruleId: 'color-contrast' })];
    const themes = [buildTheme(['f001'])];

    const enPriorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const enPriority = enPriorities[0]!;
    const frPriorities = buildRenderedPriorities(themes, findings, manifest, 'fr');
    const frPriority = frPriorities[0]!;

    expect(enPriority.evidence.representativeLabel).toBe('Title f001');
    // Same reviewed label the findings appendix renders for this rule.
    expect(frPriority.evidence.representativeLabel).toBe(
      'Le contraste des couleurs est insuffisant',
    );
  });

  it('reaches the theme card HTML escaped: a scanner title carrying markup cannot execute through the observation', async () => {
    const analysis = await loadSmallSiteAnalysis('fr');
    const findings = [
      buildFinding({
        findingId: 'f001',
        ruleId: 'rule-not-in-the-translations',
        title: '<img src=x onerror=alert(1)>',
      }),
    ];
    const themes = [buildTheme(['f001'])];
    const withThemes = { ...analysis, themes };

    const html = renderThemes(getStrings('fr'), 4, withThemes, findings, manifest);

    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  // Issue #84: a critical off-category finding (a CLS performance metric
  // grouped into an accessibility theme) was winning representative
  // selection over a same-category finding, and its occurrences were
  // inflating the accessibility total past the site's own accessibility
  // figure.
  it('prefers a same-category finding as representative over a higher-severity finding from another category', () => {
    const findings = [
      buildFinding({ findingId: 'f001', category: 'accessibility', severity: 'serious' }),
      buildFinding({ findingId: 'f002', category: 'performance', severity: 'critical' }),
    ];
    const themes = [{ ...buildTheme(['f001', 'f002']), category: 'accessibility' as const }];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.representativeFinding.findingId).toBe('f001');
  });

  // Issue #100: the card's counts cover its full resolved finding set, the
  // same set the card lists under its finding references and its ownership
  // line counts. The category narrowing (issue #84) survives only in
  // representative selection: the same-category f001 still wins the quoted
  // slot over the higher-severity cross-category f002, but f002's page and
  // its 46 occurrences are now counted (the old code printed 5 occurrences
  // on 1 page for a card listing findings carrying 51 on 2).
  it('counts the full finding set across categories while the representative stays same-category', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        category: 'accessibility',
        severity: 'serious',
        occurrences: 5,
        pageUrls: ['https://example.com/a'],
      }),
      buildFinding({
        findingId: 'f002',
        category: 'performance',
        severity: 'critical',
        occurrences: 46,
        pageUrls: ['https://example.com/b'],
      }),
    ];
    const themes = [{ ...buildTheme(['f001', 'f002']), category: 'accessibility' as const }];
    const scopedManifest = {
      pages: [
        { url: 'https://example.com/a', status: 'visited' },
        { url: 'https://example.com/b', status: 'visited' },
      ],
    } as never;

    const priorities = buildRenderedPriorities(themes, findings, scopedManifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.occurrenceCount).toBe(51);
    expect(priority.evidence.uniquePageCount).toBe(2);
    expect(priority.evidence.representativeFinding.findingId).toBe('f001');
  });

  // Issue #100, second asymmetry: both counts describe one population. A
  // finding whose every cited page sits outside the visited scope
  // contributes to neither count (the old code counted its occurrence
  // while excluding its page, so the pages half and the occurrences half
  // of one sentence disagreed about a page). A finding cited on both
  // scopes contributes its in-scope pages and its full occurrence total:
  // occurrences are stored as one per-finding number, so there is nothing
  // to apportion a partially out-of-scope finding by.
  it('excludes a wholly out-of-scope finding from the occurrence count exactly as from the page count', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        occurrences: 3,
        pageUrls: ['https://example.com/a', 'https://example.com/b'],
      }),
      buildFinding({
        findingId: 'f002',
        occurrences: 1,
        pageUrls: ['https://example.com/not-crawled'],
      }),
      buildFinding({
        findingId: 'f003',
        occurrences: 5,
        pageUrls: ['https://example.com/a', 'https://example.com/also-not-crawled'],
      }),
    ];
    const themes = [buildTheme(['f001', 'f002', 'f003'])];
    const manifest = {
      pages: [
        { url: 'https://example.com/a', status: 'visited' },
        { url: 'https://example.com/b', status: 'visited' },
        { url: 'https://example.com/not-crawled', status: 'discovered-not-scanned' },
      ],
    } as never;

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    // f002 is wholly outside the visited scope: no page, no occurrence.
    // f003 spans both scopes: only its in-scope /a enters the page count,
    // and its occurrences stay its stored total of 5. 3 + 0 + 5 = 8.
    expect(priority.evidence.occurrenceCount).toBe(8);
    expect(priority.evidence.uniquePageCount).toBe(2);
  });

  it('falls back to the full finding set when the theme has no same-category finding at all', () => {
    const findings = [
      buildFinding({ findingId: 'f001', category: 'performance', severity: 'critical' }),
    ];
    const themes = [{ ...buildTheme(['f001']), category: 'accessibility' as const }];

    const priorities = buildRenderedPriorities(themes, findings, manifest, 'en');
    const priority = priorities[0]!;

    expect(priority.evidence.representativeFinding.findingId).toBe('f001');
  });

  it('throws rather than let two priorities quote the same representative finding', () => {
    const findings = [buildFinding({ findingId: 'f001', category: 'performance' })];
    const themeA = { ...buildTheme(['f001']), category: 'performance' as const, priorityRank: 1 };
    const themeB = { ...buildTheme(['f001']), category: 'performance' as const, priorityRank: 2 };

    expect(() => buildRenderedPriorities([themeA, themeB], findings, manifest, 'en')).toThrow(
      'share the same representative finding',
    );
  });
});
