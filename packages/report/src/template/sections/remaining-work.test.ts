import { describe, expect, it } from 'vitest';
import type { AuditManifest, Finding, StoredTheme } from '@odysseus/core';
import type { StoredAnalysis } from '../../types.js';
import { renderRemainingWork, selectRemainingFindings } from './remaining-work.js';
import { selectRenderedThemes } from './themes.js';
import { buildRenderedPriorities } from '../rendered-priorities.js';
import { getStrings } from '../strings/i18n.js';
import { loadSmallSiteAnalysis, loadSmallSiteFindings } from '../../test-fixtures.js';

describe('renderRemainingWork against the real small-site.test scan', () => {
  it('covers exactly the findings no rendered priority accounts for', async () => {
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');

    const remaining = selectRemainingFindings(analysis, findings);
    // selectRenderedThemes, not analysis.themes: a theme the priorities
    // section does not render is one the client never saw ranked, so its
    // findings belong here. Asserting against the raw theme list would
    // encode the opposite, and silently drop those findings from both.
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const covered = new Set(
      selectRenderedThemes(analysis.themes, findingsById).flatMap((t) => t.findingIds),
    );

    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.length).toBeLessThan(findings.length);
    for (const finding of remaining) expect(covered.has(finding.findingId)).toBe(false);
    // A partition: every finding is either ranked or listed here, never both
    // and never neither.
    expect(remaining.length + covered.size).toBe(findings.length);
  });

  it('gives every rendered rule group an action line, not only counts', async () => {
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');

    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);

    // The section exists to answer "what do I do about these". A group with
    // counts and no action is the defect this section was built to fix.
    const groupCount = html.split('class="remaining-rule"').length - 1;
    const actionCount = html.split('class="remaining-action"').length - 1;
    expect(groupCount).toBeGreaterThan(0);
    expect(actionCount).toBe(groupCount);
  });

  it('names every finding it covers, so nothing is silently omitted', async () => {
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');

    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);
    const remaining = selectRemainingFindings(analysis, findings);
    const rules = new Set(remaining.map((f) => f.ruleId));

    // One block per distinct rule, and each block's counts add back up.
    expect(html.split('class="remaining-rule"').length - 1).toBe(rules.size);
  });

  it('renders in English too, with no French leaking through', async () => {
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');

    const html = renderRemainingWork(getStrings('en'), 6, 'en', analysis, findings);

    expect(html).toContain('Still to address');
    expect(html).not.toContain('Reste');
  });

  it('renders important for critical/serious remainder and improvement for moderate/minor remainder', async () => {
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');
    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);
    const remaining = selectRemainingFindings(analysis, findings);

    const hasImportant = remaining.some(
      (finding) => finding.severity === 'critical' || finding.severity === 'serious',
    );
    const hasImprovement = remaining.some(
      (finding) => finding.severity === 'moderate' || finding.severity === 'minor',
    );

    if (hasImportant) expect(html).toContain('Important');
    if (hasImprovement) expect(html).toContain('Amélioration');
  });

  it("fix #5 (2026-08-25 report review): shows each rule group's own worst severity, not a uniform blank list", async () => {
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');

    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);
    const remaining = selectRemainingFindings(analysis, findings);
    const groupCount = html.split('class="remaining-rule"').length - 1;

    const severityRank = { critical: 0, serious: 1, moderate: 2, minor: 3 } as const;
    const worstByRule = new Map<string, keyof typeof severityRank>();
    for (const finding of remaining) {
      const current = worstByRule.get(finding.ruleId);
      if (!current || severityRank[finding.severity] < severityRank[current]) {
        worstByRule.set(finding.ruleId, finding.severity);
      }
    }

    expect(groupCount).toBe(worstByRule.size);
    // Every group carries the severity vocabulary reused from
    // findingsAppendix.severityLabels, and remaining findings span more than
    // one worst-severity value on this real fixture, so more than one label
    // must appear.
    const severityLabels = getStrings('fr').findingsAppendix.severityLabels;
    const worstSeveritiesPresent = new Set(worstByRule.values());
    expect(worstSeveritiesPresent.size).toBeGreaterThan(1);
    for (const severity of worstSeveritiesPresent) {
      expect(html).toContain(severityLabels[severity]);
    }
  });

  it('plan 041 Part A: shows a fixed snippet, escaped, for a rule classified fixed', async () => {
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');

    // meta-viewport is classified `fixed` with a language-neutral template
    // (no {{selector}}/{{resourceUrl}} placeholders), so its rendered form
    // is stable regardless of which element this fixture happens to carry.
    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);
    expect(html).toContain('Correctif type');
    expect(html).toContain(
      '&lt;meta name=&quot;viewport&quot; content=&quot;width=device-width, initial-scale=1&quot;&gt;',
    );
  });

  it('plan 041 Part A: shows a fill-in-blank note for a rule classified fill-in-blank', async () => {
    const findings = await loadSmallSiteFindings();
    const analysis = await loadSmallSiteAnalysis('fr');

    // meta-description is classified fill-in-blank; its template's blank
    // must never be filled with the finding's own captured content.
    const html = renderRemainingWork(getStrings('fr'), 6, 'fr', analysis, findings);
    expect(html).toContain('À compléter avec votre propre contenu.');
  });
});

function buildScenarioFinding(
  overrides: Partial<Finding> & { findingId: string; ruleId: string },
): Finding {
  return {
    auditId: 'a1',
    schemaVersion: 1,
    source: 'axe',
    category: 'accessibility',
    severity: 'serious',
    wcagCriteria: [],
    title: `Title ${overrides.findingId}`,
    description: 'd',
    pageUrls: ['https://example.com/a'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: overrides.findingId,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  };
}

function buildScenarioTheme(findingIds: string[]): StoredTheme {
  return {
    title: 'Images sans alternative',
    category: 'accessibility',
    businessImpact: 'Impact',
    effort: 'low',
    impact: 'high',
    priorityRank: 1,
    findingIds,
    recommendedActions: ['Action'],
  };
}

// Issue #293 (Villas Foch, image-alt): the theme named 6 of a rule's 170
// findings, and this section excluded by findingId - so the other 164
// findings of the SAME rule rendered here as "Reste à traiter" with a
// second, contradictory count against the priority card's and the WCAG
// table's figures. A rule chosen for a priority brings all of its findings
// into that priority, so this section must not list the rule at all.
describe('issue #293: a rule ranked in a priority never reappears here', () => {
  const manifest = {
    pages: ['a', 'b', 'c'].map((slug) => ({
      url: `https://example.com/${slug}`,
      status: 'visited',
    })),
  } as never as AuditManifest;

  function buildScenario() {
    const findings = [
      buildScenarioFinding({
        findingId: 'f001',
        ruleId: 'image-alt',
        occurrences: 2,
        pageUrls: ['https://example.com/a'],
      }),
      buildScenarioFinding({
        findingId: 'f002',
        ruleId: 'image-alt',
        occurrences: 3,
        pageUrls: ['https://example.com/b'],
      }),
      buildScenarioFinding({
        findingId: 'f003',
        ruleId: 'image-alt',
        occurrences: 4,
        pageUrls: ['https://example.com/c'],
      }),
      // A rule the theme never names: stays in the remainder.
      buildScenarioFinding({
        findingId: 'f004',
        ruleId: 'meta-viewport',
        occurrences: 1,
        pageUrls: ['https://example.com/a'],
      }),
    ];
    const analysis = {
      themes: [buildScenarioTheme(['f001'])],
      language: 'fr',
    } as unknown as StoredAnalysis;
    return { findings, analysis };
  }

  it('a theme referencing 1 of 3 same-rule findings excludes all 3 from the remainder', () => {
    const { findings, analysis } = buildScenario();
    const priorities = buildRenderedPriorities(analysis.themes, findings, manifest, 'fr');

    const remaining = selectRemainingFindings(analysis, findings, priorities);

    expect(remaining.map((finding) => finding.findingId)).toEqual(['f004']);
    expect(remaining.map((finding) => finding.ruleId)).not.toContain('image-alt');
  });

  it('the priority carries the rule s whole footprint, so the counts agree across sections', () => {
    const { findings, analysis } = buildScenario();
    const priorities = buildRenderedPriorities(analysis.themes, findings, manifest, 'fr');
    const priority = priorities[0]!;

    expect(priority.findings).toHaveLength(3);
    // 2 + 3 + 4 - the WCAG/rollup figures for the same rule, not the 6-vs-164
    // split the real report showed.
    expect(priority.evidence.occurrenceCount).toBe(9);
    expect(priority.evidence.uniquePageCount).toBe(3);
  });

  it('the rendered section no longer names the split rule', () => {
    const { findings, analysis } = buildScenario();
    const priorities = buildRenderedPriorities(analysis.themes, findings, manifest, 'fr');

    const html = renderRemainingWork(
      getStrings('fr'),
      6,
      'fr',
      analysis,
      findings,
      priorities,
      new Set(manifest.pages.map((page) => page.url)),
    );

    expect(html).not.toContain('Les images doivent avoir un texte alternatif');
    expect(html.split('class="remaining-rule"').length - 1).toBe(1);
  });
});

// Issue #291: findings record every real URL - language variants kept after
// a translation-cluster merge, plus origin-level findings citing
// discovered-but-not-scanned pages - so the per-rule page figure here could
// exceed the analysed-page total (206 pages claimed out of 140 in a real
// report). render-html.ts now passes the visited-page scope and every figure
// is confined to it.
describe('issue #291: remaining-work page counts stay inside the analysed scope', () => {
  const visitedUrls = ['https://example.com/a', 'https://example.com/b'];
  const scopePageUrls = new Set(visitedUrls);

  it('a rule citing out-of-scope pages counts only its visited ones', async () => {
    const findings = [
      buildScenarioFinding({
        findingId: 'f001',
        ruleId: 'image-alt',
        occurrences: 2,
        pageUrls: ['https://example.com/a', 'https://example.com/not-crawled-1'],
      }),
      buildScenarioFinding({
        findingId: 'f002',
        ruleId: 'image-alt',
        occurrences: 3,
        pageUrls: ['https://example.com/b', 'https://example.com/not-crawled-2'],
      }),
    ];
    const analysis = {
      themes: [],
      language: 'fr',
    } as unknown as StoredAnalysis;

    // No priorities: every finding lands in the remainder, grouped under
    // its one rule.
    const html = renderRemainingWork(
      getStrings('fr'),
      6,
      'fr',
      analysis,
      findings,
      undefined,
      scopePageUrls,
    );

    // 2 constats · 5 occurrences · 2 pages - not 4 pages, the raw union.
    expect(html).toContain('2 constats · 5 occurrences · 2 pages');
  });
});

describe('a rule with no page inside the analysed scope', () => {
  const scopePageUrls = new Set(['https://example.com/a']);

  // A real report printed "1 constat · 1 occurrence · 0 page" for a rule
  // that holds for the site as a whole, which reads as a missing number
  // rather than as "no single page carries it".
  it('states its findings and occurrences without a page segment', () => {
    const findings = [
      buildScenarioFinding({
        findingId: 'f001',
        ruleId: 'structured-data-organization-missing',
        occurrences: 1,
        pageUrls: [],
      }),
    ];
    const analysis = { themes: [], language: 'fr' } as unknown as StoredAnalysis;

    const html = renderRemainingWork(
      getStrings('fr'),
      6,
      'fr',
      analysis,
      findings,
      undefined,
      scopePageUrls,
    );

    expect(html).toContain('1 constat · 1 occurrence');
    expect(html).not.toContain('0 page');
  });
});
