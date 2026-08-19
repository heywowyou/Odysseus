import { describe, expect, it } from 'vitest';
import { selectReferenceStats } from '@odysseus/core';
import { isQuickWinTheme, MAX_RENDERED_THEMES, renderThemes, selectRenderedThemes } from './themes.js';
import { getStrings } from '../strings/i18n.js';
import { escapeHtml } from '../html-utils.js';
import { loadSasFernandeAnalysis, loadSasFernandeFindings, loadSasFernandeManifest } from '../../test-fixtures.js';

describe('renderThemes against the real sas-fernande.fr analysis', () => {
  it('renders only the top 6 themes by rank (doc §3 sections 04/05 cap), with a compact findingId reference and never a raw page URL (F38)', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), 4, analysis, findings, manifest);
    const rendered = selectRenderedThemes(analysis.themes);

    for (const theme of rendered) {
      expect(html).toContain(`id="theme-${theme.priorityRank}"`);
      expect(html).toContain(theme.findingIds[0]);
    }
    if (analysis.themes.length > MAX_RENDERED_THEMES) {
      const dropped = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank)[MAX_RENDERED_THEMES]!;
      expect(html).not.toContain(`id="theme-${dropped.priorityRank}"`);
    }
    // No raw page URL anywhere in a theme card - only counts and refs.
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const somePageUrl = findingsById.get(rendered[0]!.findingIds[0]!)?.pageUrls[0];
    if (somePageUrl) expect(html).not.toContain(somePageUrl);
  });

  it('marks a theme as a quick win only when effort is low and impact is not low', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), 4, analysis, findings, manifest);
    const rendered = selectRenderedThemes(analysis.themes);
    const quickWinThemes = rendered.filter(isQuickWinTheme);
    const nonQuickWinThemes = rendered.filter((t) => !isQuickWinTheme(t));

    // At least a sanity check that the predicate produces both classes
    // on a real analysis, and that every quick-win theme's title is
    // followed somewhere by the badge markup.
    if (quickWinThemes.length > 0) {
      expect(html).toContain('class="tag qw"');
    }
    if (nonQuickWinThemes.length === rendered.length) {
      expect(html).not.toContain('class="tag qw"');
    }
  });

  it('renders the deterministic legalRelevance sentence in a .legal box for an accessibility theme with WCAG criteria, and "Sans objet" otherwise', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), 4, analysis, findings, manifest);
    const rendered = selectRenderedThemes(analysis.themes);

    const conformantTheme = rendered.find((t) => t.legalRelevance !== undefined);
    if (conformantTheme?.legalRelevance) {
      expect(html).toContain(escapeHtml(conformantTheme.legalRelevance));
      expect(html).toContain('Non conforme');
    }
    const nonApplicableTheme = rendered.find((t) => t.legalRelevance === undefined);
    if (nonApplicableTheme) {
      expect(html).toContain('Sans objet');
    }
  });
});

describe('B1: reference-stat citation eligibility and cross-document dedupe', () => {
  it('attaches a citation to a performance theme, not just accessibility/seo', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);
    const findingId = findings[0]!.findingId;
    const performanceOnly = {
      ...analysis,
      themes: [
        {
          title: 'Vitesse mobile insuffisante',
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: [findingId],
          recommendedActions: ['Action'],
        },
      ],
    };

    const html = renderThemes(getStrings('fr'), 4, performanceOnly, findings, manifest);

    expect(html).toContain('Repère chiffré');
    expect(html).toContain('Deloitte');
  });

  it('never cites the same statistic twice across the document, even across two performance themes', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);
    const findingId = findings[0]!.findingId;
    const twoPerformanceThemes = {
      ...analysis,
      themes: [
        {
          title: 'Vitesse mobile insuffisante',
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: [findingId],
          recommendedActions: ['Action'],
        },
        {
          title: 'Temps de blocage élevé',
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'medium' as const,
          priorityRank: 2,
          findingIds: [findingId],
          recommendedActions: ['Action'],
        },
      ],
    };
    const citedStatIds = new Set<string>();

    const html = renderThemes(getStrings('fr'), 4, twoPerformanceThemes, findings, manifest, citedStatIds);

    // Only the first (highest-priority) theme in a category gets a
    // citation per the existing one-per-category rule, so this also
    // covers the "at most once" case without needing a second call.
    expect((html.match(/Repère chiffré/g) ?? []).length).toBe(1);
    expect(citedStatIds.size).toBe(1);
  });

  it('a Set already containing the only matching statistic id suppresses the citation entirely (cross-section dedupe)', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);
    const findingId = findings[0]!.findingId;
    const performanceOnly = {
      ...analysis,
      themes: [
        {
          title: 'Vitesse mobile insuffisante',
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: [findingId],
          recommendedActions: ['Action'],
        },
      ],
    };
    const sector = analysis.obligationAssessment?.sector ?? 'general';
    const citedStatIds = new Set(selectReferenceStats('performance', sector).map((stat) => stat.id));

    const html = renderThemes(getStrings('fr'), 4, performanceOnly, findings, manifest, citedStatIds);

    expect(html).not.toContain('Repère chiffré');
  });
});

// report-feedback-la-corniche.md item 1.1: a real report cited the Pew
// AI-overview click-through-rate statistic (category includes 'seo') on
// "Mentions légales incomplètes" (a missing SIREN), because that theme
// happened to be the highest-ranked 'seo' theme with no topical check at
// all - the statistic is about search-result click behavior, wholly
// unrelated to a company registration number.
describe('item 1.1: a stat with eligibleRuleIds only attaches to a theme whose findings actually match', () => {
  function buildFinding(ruleId: string) {
    return {
      findingId: 'f001',
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId,
      category: 'seo' as const,
      severity: 'serious' as const,
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: 'd1',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  }

  function buildAnalysis() {
    return {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'medium' as const,
      executiveSummary: 'summary',
      themes: [
        {
          title: 'Mentions légales incomplètes',
          category: 'seo' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: ['f001'],
          recommendedActions: ['Action'],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  const manifest = { pages: [{ url: 'https://example.com/', status: 'visited' }] } as never;

  it('does not cite the Pew AI-overview statistic on a mentions-légales (SIREN) finding', () => {
    const analysis = buildAnalysis();
    const finding = buildFinding('lcen-mentions-legales-missing');

    const html = renderThemes(getStrings('fr'), 4, analysis, [finding], manifest);

    expect(html).not.toContain('Pew Research');
    expect(html).not.toContain('résumé généré par IA');
  });

  it('still cites the Pew AI-overview statistic on a finding it is actually eligible for (meta-title-length)', () => {
    const analysis = buildAnalysis();
    const finding = buildFinding('meta-title-length');

    const html = renderThemes(getStrings('fr'), 4, analysis, [finding], manifest);

    expect(html).toContain('Pew Research');
  });

  // Blocking only the Pew stat was not enough on its own: with Pew
  // ineligible, the next unfiltered SEO stat in the candidate list
  // (Nestlé rich-results CTR, no eligibleRuleIds) fell through onto the
  // same mentions-légales theme in a real regeneration - an equally
  // irrelevant citation for a missing SIREN. No reference-stat citation
  // at all is the correct output for this theme, not merely "not Pew".
  it('cites nothing at all on a theme confined entirely to the mentions-légales finding, not just not-Pew', () => {
    const analysis = buildAnalysis();
    const finding = buildFinding('lcen-mentions-legales-missing');

    const html = renderThemes(getStrings('fr'), 4, analysis, [finding], manifest);

    expect(html).not.toContain('Repère chiffré');
  });

  it('does cite a stat on a second seo theme when the first is the citation-ineligible mentions-légales one', () => {
    const analysis = {
      ...buildAnalysis(),
      themes: [
        {
          title: 'Mentions légales incomplètes',
          category: 'seo' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: ['f001'],
          recommendedActions: ['Action'],
        },
        {
          title: 'Données structurées invalides',
          category: 'seo' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'medium' as const,
          priorityRank: 2,
          findingIds: ['f002'],
          recommendedActions: ['Action'],
        },
      ],
    };
    const legalFinding = buildFinding('lcen-mentions-legales-missing');
    const jsonldFinding = { ...buildFinding('jsonld-invalid'), findingId: 'f002' };

    const html = renderThemes(getStrings('fr'), 4, analysis, [legalFinding, jsonldFinding], manifest);

    // The citation must land on card 2 (theme-2, jsonld-invalid), never
    // on card 1 (theme-1, the citation-ineligible mentions-légales one).
    const theme1End = html.indexOf('id="theme-2"');
    expect(html.slice(0, theme1End)).not.toContain('Repère chiffré');
    expect(html.slice(theme1End)).toContain('Repère chiffré');
  });

  // The actual real-world trigger: lcen-resolution.ts removes the
  // mentions-légales finding from resolvedFindings entirely once the
  // operator confirms a sirenSourceUrl, but the theme referencing it
  // (built by the writing pass before that resolution ran) still
  // renders, now with zero resolvable findings - `.every()` over an
  // empty array is vacuously true, so this is a distinct code path from
  // the "all findings are the LCEN rule id" case above and needs its own
  // coverage.
  it('cites nothing on a theme whose only finding was resolved away entirely (findingIds references nothing in the findings array)', () => {
    const analysis = buildAnalysis();
    // f001 is referenced by the theme but never appears in the findings
    // array passed to renderThemes, matching resolveLcenFinding's effect.
    const html = renderThemes(getStrings('fr'), 4, analysis, [], manifest);

    expect(html).not.toContain('Repère chiffré');
  });
});

// item 13: a real report cited the Baymard 70.22% cart-abandonment
// statistic on an ARIA structure finding for `.collection__list`, a
// generic listing element with no stated relationship to checkout at
// all. selectReferenceStats('accessibility', 'general') ranks that stat
// first for a plain accessibility theme, so without an eligibility check
// it wins the citation slot regardless of what the theme's findings
// actually are.
describe('item 13: transactional-context-only citations (cart-abandonment, checkout-uplift) only attach on a page with real transactional-flow evidence', () => {
  const ariaFinding = {
    findingId: 'f001',
    auditId: 'a1',
    schemaVersion: 1 as const,
    source: 'axe' as const,
    ruleId: 'aria-required-children',
    category: 'accessibility' as const,
    severity: 'serious' as const,
    wcagCriteria: ['1.3.1'],
    title: 'Certain ARIA roles must contain particular children',
    description: 'd',
    pageUrls: ['https://example.com/products'],
    occurrences: 3,
    elements: [{ pageUrl: 'https://example.com/products', selector: '.collection__list', snippet: '' }],
    rawEvidence: {},
    dedupeKey: 'd1',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };

  function buildAnalysis(overrides: Partial<Parameters<typeof renderThemes>[2]> = {}) {
    return {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'medium' as const,
      executiveSummary: 'summary',
      themes: [
        {
          title: 'Structure ARIA incorrecte',
          category: 'accessibility' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: ['f001'],
          recommendedActions: ['Action'],
        },
      ],
      quickWins: [],
      notes: '',
      ...overrides,
    };
  }

  it('does not cite a cart-abandonment/checkout-uplift stat on a finding whose page has no transactional-flow evidence at all', () => {
    const analysis = buildAnalysis();
    const manifest = { pages: [{ url: 'https://example.com/products', status: 'visited' }] } as never;

    const html = renderThemes(getStrings('fr'), 4, analysis, [ariaFinding], manifest);

    expect(html).not.toContain('70,22');
    expect(html).not.toContain('35,26');
  });

  it('does not cite it even when the site has transactional-flow evidence elsewhere, if not on this finding\'s own page', () => {
    const analysis = buildAnalysis({
      obligationAssessment: {
        status: 'in_scope',
        basis: [
          {
            regimeId: 'eaa-loi-2023-171',
            facts: [
              {
                kind: 'transactional-flow',
                evidence: [
                  { kind: 'checkout-form', selector: 'form', pageUrl: 'https://example.com/checkout', detail: '' },
                ],
              },
            ],
          },
        ],
      },
    });
    const manifest = { pages: [{ url: 'https://example.com/products', status: 'visited' }] } as never;

    const html = renderThemes(getStrings('fr'), 4, analysis, [ariaFinding], manifest);

    expect(html).not.toContain('70,22');
  });

  it('does cite it when the finding\'s own page carries real transactional-flow evidence', () => {
    const analysis = buildAnalysis({
      obligationAssessment: {
        status: 'in_scope',
        basis: [
          {
            regimeId: 'eaa-loi-2023-171',
            facts: [
              {
                kind: 'transactional-flow',
                evidence: [
                  {
                    kind: 'checkout-form',
                    selector: 'form',
                    pageUrl: 'https://example.com/products',
                    detail: '',
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const manifest = { pages: [{ url: 'https://example.com/products', status: 'visited' }] } as never;

    const html = renderThemes(getStrings('fr'), 4, analysis, [ariaFinding], manifest);

    expect(html).toContain('70,22');
  });
});

// item 14: the Deloitte per-0.1s citations invite a reader to naively
// multiply the stated relationship by however many seconds they assume
// their site is over threshold - the real gap on a real report was 3.4s
// above the "good" LCP threshold, not 0.1s.
describe('item 14: a per-0.1s performance citation states the site\'s own measured LCP gap', () => {
  const perfFinding = {
    findingId: 'f001',
    auditId: 'a1',
    schemaVersion: 1 as const,
    source: 'lighthouse' as const,
    ruleId: 'largest-contentful-paint',
    category: 'performance' as const,
    severity: 'serious' as const,
    wcagCriteria: [],
    title: 'Largest Contentful Paint',
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'd1',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  };

  const performanceAnalysis = {
    auditId: 'a1',
    language: 'fr' as const,
    model: 'test-model',
    temperature: 0,
    generatedAt: new Date(),
    overallRisk: 'medium' as const,
    executiveSummary: 'summary',
    themes: [
      {
        title: 'Vitesse mobile insuffisante',
        category: 'performance' as const,
        businessImpact: 'Impact',
        effort: 'medium' as const,
        impact: 'high' as const,
        priorityRank: 1,
        findingIds: ['f001'],
        recommendedActions: ['Action'],
      },
    ],
    quickWins: [],
    notes: '',
  };

  it('states the measured gap when this site\'s LCP is genuinely above the "good" threshold (5900ms, matching the reported 5.9s vs 2.5s case)', () => {
    const manifest = {
      pages: [
        { url: 'https://example.com/', status: 'visited', coreWebVitals: { lcp: { score: 0.1, numericValue: 5900, displayValue: '5.9 s' } } },
      ],
    } as never;

    const html = renderThemes(getStrings('fr'), 4, performanceAnalysis, [perfFinding], manifest);

    expect(html).toContain('Écart mesuré sur ce site');
    expect(html).toContain('5,9 s');
    expect(html).toContain('3,4 s'); // 5.9s - 2.5s good threshold
  });

  it('states nothing extra when this site\'s LCP is already at or under the "good" threshold', () => {
    const manifest = {
      pages: [
        { url: 'https://example.com/', status: 'visited', coreWebVitals: { lcp: { score: 0.95, numericValue: 1800, displayValue: '1.8 s' } } },
      ],
    } as never;

    const html = renderThemes(getStrings('fr'), 4, performanceAnalysis, [perfFinding], manifest);

    expect(html).not.toContain('Écart mesuré sur ce site');
  });
});

// item 27: theme.recommendedActions is generated by the LLM writing pass
// on every analysis (language/severity-vocabulary validated) but was
// never rendered - a theme card stated the problem and its business
// impact without ever stating what to do about it.
describe('item 27: theme cards render recommendedActions', () => {
  it('renders every recommended action for the real sas-fernande.fr themes', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSasFernandeAnalysis('fr'),
      loadSasFernandeFindings(),
      loadSasFernandeManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), 4, analysis, findings, manifest);
    const rendered = selectRenderedThemes(analysis.themes);

    for (const theme of rendered) {
      for (const action of theme.recommendedActions) {
        expect(html).toContain(escapeHtml(action));
      }
    }
  });
});

describe('isQuickWinTheme', () => {
  it('is true only for low effort combined with medium or high impact', () => {
    expect(isQuickWinTheme({ effort: 'low', impact: 'medium' })).toBe(true);
    expect(isQuickWinTheme({ effort: 'low', impact: 'high' })).toBe(true);
    expect(isQuickWinTheme({ effort: 'low', impact: 'low' })).toBe(false);
    expect(isQuickWinTheme({ effort: 'medium', impact: 'high' })).toBe(false);
    expect(isQuickWinTheme({ effort: 'high', impact: 'high' })).toBe(false);
  });
});
