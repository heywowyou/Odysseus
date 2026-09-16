import { describe, expect, it } from 'vitest';
import { renderChecklist } from './checklist.js';
import { getStrings } from '../strings/i18n.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';

// item 35: the printable checklist was a near-exact restatement of the
// priorities section with nothing added - same three items, same effort/
// impact labels, same page counts. Now carries finding IDs and WCAG
// criteria so it functions as an actual working checklist.
describe('item 35: the checklist carries finding IDs and WCAG criteria', () => {
  it("renders each rendered theme's finding IDs", async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    for (const theme of analysis.themes.slice(0, 6)) {
      expect(html).toContain(theme.findingIds[0]!);
    }
  });

  it('renders the WCAG criteria column header', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).toContain('WCAG');
  });

  it('is no longer identical to a bare rank/title/effort/impact/pages table', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).toContain('Constats');
    expect(html).toContain('mono');
  });
});

// item 2.7: a trailing "Statut / Date" column rendered as a bare
// underline with no visible boundary in a narrow cell, reading as a stray
// dash rather than a writable field - removed rather than restyled.
describe('item 2.7: the checklist has no stray status/date column, and carries a company/date identifier instead', () => {
  it('renders no "Statut / Date" column header', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).not.toContain('Statut / Date');
  });

  it('renders the site as an identifier line, so the page is identifiable once printed alone', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    expect(html).toContain(manifest.siteUrl);
  });
});

// 2026-08-22, Large Rule Families report review: the checklist's Impact column
// used to render as plain text, identical in weight to Effort. The
// coloured value must survive as a <span data-level="..."> rather than
// on the row's own <div> cell, since paged.css's #section-05 print
// override forces every div's color to a light-mode value with
// !important - only an element outside that selector list (a span) can
// carry its own colour through to the printed PDF.
describe('2026-08-22: the checklist Impact column is colour-coded via a data-level span, Effort is not', () => {
  it("wraps each row's Impact value in a data-level span with LEVEL_COLOR, distinct from the plain Effort cell", async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);

    const html = renderChecklist(getStrings('fr'), 5, 'fr', analysis, findings, manifest);

    const firstTheme = analysis.themes.slice(0, 6).find((t) => t.impact) ?? analysis.themes[0]!;
    expect(html).toMatch(
      new RegExp(`data-level="${firstTheme.impact}" style="color:#[0-9a-f]{6}"`),
    );
  });
});

// 2026-08-22/23, multi-page/la corniche report review: a theme with 100+
// findingIds turned this column into an unbounded wall of text that,
// combined with .row-atomic's break-inside: avoid, gave Paged.js no
// valid break point and collapsed a real PDF into several pages of
// one-character-per-line garbage. Capped at CHECKLIST_FINDING_ID_CAP
// the same way findings-appendix.ts caps a page-URL list.
describe('2026-08-22/23: the Constats cell caps a long findingIds list rather than rendering it unbounded', () => {
  function buildAnalysisWithFindingIds(findingIds: string[]) {
    return {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'high' as const,
      executiveSummary: 'summary',
      themes: [
        {
          title: 'Chantier avec de nombreux constats',
          category: 'accessibility' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds,
          recommendedActions: ['Action'],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  const manifest = {
    pages: [],
    siteUrl: 'https://client.example',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  } as never;

  // selectRenderedThemes (themes.ts) drops any theme none of whose
  // findingIds resolve against the findings array, so the synthetic ids
  // below each need a matching minimal Finding or the whole row vanishes
  // rather than exercising the cap.
  function buildFinding(findingId: string) {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId: 'rule',
      category: 'accessibility' as const,
      severity: 'serious' as const,
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls: ['https://client.example/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  }

  it('shows only the first 10 IDs plus an "et N autres" suffix for a theme with 15 findings', () => {
    const manyIds = Array.from({ length: 15 }, (_, i) => `z${String(i + 1).padStart(3, '0')}`);
    const analysis = buildAnalysisWithFindingIds(manyIds);
    const findings = manyIds.map(buildFinding);

    const html = renderChecklist(
      getStrings('fr'),
      5,
      'fr',
      analysis as never,
      findings as never,
      manifest,
    );

    for (const id of manyIds.slice(0, 10)) expect(html).toContain(id);
    for (const id of manyIds.slice(10)) expect(html).not.toContain(id);
    expect(html).toContain('et 5 autres');
  });

  it('renders every id, uncapped, for a theme at or under the cap', () => {
    const fewIds = Array.from({ length: 10 }, (_, i) => `z${String(i + 1).padStart(2, '0')}`);
    const analysis = buildAnalysisWithFindingIds(fewIds);
    const findings = fewIds.map(buildFinding);

    const html = renderChecklist(
      getStrings('fr'),
      5,
      'fr',
      analysis as never,
      findings as never,
      manifest,
    );

    for (const id of fewIds) expect(html).toContain(id);
    expect(html).not.toContain('autres');
  });
});

// Issue #41: a real report rendered "29 pages sur 28" on a priority card
// and "29/28" here, because the numerator counted every URL cited by the
// theme's findings while the denominator counted only visited manifest
// pages - a homepage recorded discovered-not-scanned was still cited by
// origin-level findings. Invariant: no rendered PAGES ratio can have a
// numerator greater than its denominator.
describe('issue #41: no checklist PAGES ratio exceeds the visited-page total', () => {
  function buildCitingFinding(findingId: string, pageUrls: string[]) {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId: 'rule',
      category: 'accessibility' as const,
      severity: 'serious' as const,
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls,
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  }

  function buildAnalysisWithFindings(findingIds: string[]) {
    return {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'high' as const,
      executiveSummary: 'summary',
      themes: [
        {
          title: 'Chantier citant une page hors périmètre',
          category: 'accessibility' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds,
          recommendedActions: ['Action'],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  const visitedUrls = ['https://client.example/a', 'https://client.example/b'];
  const manifest = {
    pages: [
      ...visitedUrls.map((url) => ({ url, status: 'visited' })),
      // The homepage: discovered but never scanned, still cited by findings
      // (the real audit's origin-level pattern).
      { url: 'https://client.example/', status: 'discovered-not-scanned' },
    ],
    siteUrl: 'https://client.example',
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  } as never;

  it('counts a theme only over the pages the denominator population covers', () => {
    const findings = [
      buildCitingFinding('f001', [...visitedUrls, 'https://client.example/']),
      buildCitingFinding('f002', ['https://client.example/a']),
    ];
    const analysis = buildAnalysisWithFindings(['f001', 'f002']);

    const html = renderChecklist(
      getStrings('fr'),
      5,
      'fr',
      analysis as never,
      findings as never,
      manifest,
    );

    const ratios = [...html.matchAll(/>(\d+)\/(\d+)</gu)].map((m) => ({
      numerator: Number(m[1]),
      denominator: Number(m[2]),
    }));
    expect(ratios.length).toBeGreaterThan(0);
    for (const ratio of ratios) {
      expect(ratio.numerator).toBeLessThanOrEqual(ratio.denominator);
    }
    // The out-of-scope homepage is excluded from the count specifically:
    // the theme touches both visited pages, not three of two.
    expect(ratios).toContainEqual({ numerator: 2, denominator: 2 });
  });
});
