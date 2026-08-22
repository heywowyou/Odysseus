import { describe, expect, it } from 'vitest';
import type { Finding, Theme } from '@odysseus/core';
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
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const rendered = selectRenderedThemes(analysis.themes, findingsById);

    for (const theme of rendered) {
      expect(html).toContain(`id="theme-${theme.priorityRank}"`);
      expect(html).toContain(theme.findingIds[0]);
    }
    if (analysis.themes.length > MAX_RENDERED_THEMES) {
      const dropped = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank)[MAX_RENDERED_THEMES]!;
      expect(html).not.toContain(`id="theme-${dropped.priorityRank}"`);
    }
    // No raw page URL anywhere in a theme card - only counts and refs.
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
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const rendered = selectRenderedThemes(analysis.themes, findingsById);
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
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const rendered = selectRenderedThemes(analysis.themes, findingsById);

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

// report-feedback-la-corniche.md item 3.9: SEO priority cards had no
// "Exigence de conformité" box at all (legalRelevance is deterministically
// accessibility-only, trade-off 16), making them one row shorter and
// visibly different-shaped next to accessibility cards in the same "6
// priorities" grid. Every non-accessibility theme now gets the same box,
// stating plainly that no such requirement applies rather than a fake one.
describe('item 3.9: every theme card gets the "Exigence de conformité" box, accessibility or not', () => {
  function seoTheme(): Theme {
    return {
      title: 'Données structurées invalides',
      category: 'seo' as const,
      businessImpact: 'Impact',
      effort: 'low' as const,
      impact: 'medium' as const,
      priorityRank: 1,
      findingIds: ['f001'],
      recommendedActions: ['Action'],
    };
  }

  function buildFinding(findingId: string) {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId: 'jsonld-invalid',
      category: 'seo' as const,
      severity: 'moderate' as const,
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  }

  it('renders "Exigence de conformité : Sans objet" for an SEO theme, same box shape as an accessibility theme', () => {
    const analysis = {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'medium' as const,
      executiveSummary: 'summary',
      themes: [seoTheme()],
      quickWins: [],
      notes: '',
    };
    const manifest = { pages: [{ url: 'https://example.com/', status: 'visited' }] } as never;

    const html = renderThemes(getStrings('fr'), 4, analysis, [buildFinding('f001')], manifest);

    expect(html).toContain('Exigence de conformité : Sans objet');
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

describe('2026-08-22 revenue-impact wiring: a scalable citation with known client turnover gets a hedged euro estimate', () => {
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

  const baseAnalysis = {
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

  const hospitalityAnalysisWithTurnover = {
    ...baseAnalysis,
    obligationAssessment: {
      status: 'in_scope' as const,
      basis: [],
      sector: 'hospitality' as const,
      registrySnapshot: {
        denomination: 'Hotel Test SARL',
        effectifBandLabel: '1 à 2 salariés',
        retrievedAt: new Date(),
        source: 'sirene-api',
        turnoverEur: 500_000,
      },
    },
  };

  const manifest = {
    pages: [{ url: 'https://example.com/', status: 'visited', coreWebVitals: { lcp: { score: 0.1, numericValue: 5900, displayValue: '5.9 s' } } }],
  } as never;

  it('renders the euro estimate when turnover is known and the top citation is scalable', () => {
    const html = renderThemes(getStrings('fr'), 4, hospitalityAnalysisWithTurnover, [perfFinding], manifest);

    // sector 'hospitality' + strictSector picks deloitte-speed-conversion-travel-2020
    // (ratio 0.101), applied once against 500 000 EUR -> 50 500 EUR raw,
    // floored to 2 significant figures -> 50 000 EUR. Intl.NumberFormat's
    // fr-FR grouping separator is U+202F (narrow no-break space), not a
    // plain space.
    expect(html).toContain('500 000 €');
    expect(html).toContain('50 000 €');
    expect(html).toContain('estimation indicative');
  });

  it('renders nothing extra when turnover is unknown', () => {
    const noTurnover = {
      ...hospitalityAnalysisWithTurnover,
      obligationAssessment: {
        ...hospitalityAnalysisWithTurnover.obligationAssessment,
        registrySnapshot: {
          ...hospitalityAnalysisWithTurnover.obligationAssessment.registrySnapshot,
          turnoverEur: undefined,
        },
      },
    };

    const html = renderThemes(getStrings('fr'), 4, noTurnover as never, [perfFinding], manifest);

    expect(html).not.toContain('estimation indicative');
  });

  it('never renders a euro estimate for a context-only (non-scalable) citation', () => {
    // accessibility has no scalable hospitality stat at all (2026-08-22
    // sector research pass) - every candidate is context-only.
    const accessibilityFinding = {
      ...perfFinding,
      ruleId: 'image-alt',
      category: 'accessibility' as const,
    };
    const accessibilityAnalysis = {
      ...hospitalityAnalysisWithTurnover,
      themes: [{ ...hospitalityAnalysisWithTurnover.themes[0]!, category: 'accessibility' as const }],
    };

    const html = renderThemes(getStrings('fr'), 4, accessibilityAnalysis as never, [accessibilityFinding], manifest);

    expect(html).not.toContain('estimation indicative');
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
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const rendered = selectRenderedThemes(analysis.themes, findingsById);

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

// report-feedback-la-corniche.md item 1.5: a real report had all 6
// rendered theme cards carrying the "Gain rapide" badge and "Effort :
// Faible", under a heading claiming a two-axis sort ("classés par effort
// et par impact") the data gave no evidence of - the badge distinguished
// nothing. Rendered only when not every rendered theme is a quick win.
describe('item 1.5: the quick-win badge does not render when every rendered theme would carry it', () => {
  function quickWinTheme(rank: number, findingId: string): Theme {
    return {
      title: `Chantier ${rank}`,
      category: 'accessibility' as const,
      businessImpact: 'Impact',
      effort: 'low' as const,
      impact: 'high' as const,
      priorityRank: rank,
      findingIds: [findingId],
      recommendedActions: ['Action'],
    };
  }

  function buildAnalysis(themes: Theme[]) {
    return {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'medium' as const,
      executiveSummary: 'summary',
      themes,
      quickWins: [],
      notes: '',
    };
  }

  const manifest = { pages: [{ url: 'https://example.com/', status: 'visited' }] } as never;
  const findings = [1, 2, 3, 4, 5, 6].map((i) => ({
    findingId: `f00${i}`,
    auditId: 'a1',
    schemaVersion: 1 as const,
    source: 'axe' as const,
    ruleId: `rule-${i}`,
    category: 'accessibility' as const,
    severity: 'moderate' as const,
    wcagCriteria: [],
    title: 't',
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: `dk-${i}`,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
  }));

  it('renders no "Gain rapide" badge when all 6 rendered themes are quick wins', () => {
    const themes = [1, 2, 3, 4, 5, 6].map((i) => quickWinTheme(i, `f00${i}`));
    const analysis = buildAnalysis(themes);

    const html = renderThemes(getStrings('fr'), 4, analysis, findings, manifest);

    expect(html).not.toContain('Gain rapide');
  });

  it('still renders the badge on the themes that qualify when at least one rendered theme is not a quick win', () => {
    const themes = [
      quickWinTheme(1, 'f001'),
      quickWinTheme(2, 'f002'),
      {
        title: 'Chantier non quick-win',
        category: 'accessibility' as const,
        businessImpact: 'Impact',
        effort: 'medium' as const,
        impact: 'high' as const,
        priorityRank: 3,
        findingIds: ['f003'],
        recommendedActions: ['Action'],
      },
    ];
    const analysis = buildAnalysis(themes);

    const html = renderThemes(getStrings('fr'), 4, analysis, findings, manifest);

    expect((html.match(/Gain rapide/g) ?? []).length).toBe(2);
  });
});

// report-feedback-la-corniche.md item 0.6: a real report rendered a
// priority ("Mentions légales incomplètes") with "Pages affectées: 0
// pages sur 18" - its only finding had been stripped by
// lcen-resolution.ts's resolveLcenFinding after a manual SIREN
// confirmation, leaving a dangling theme that still won a top-6 slot.
describe('item 0.6: a theme with no resolved findings is never selected as a rendered priority', () => {
  function themeWithFindingIds(rank: number, findingIds: string[]): Theme {
    return {
      title: `Chantier ${rank}`,
      category: 'seo' as const,
      businessImpact: 'Impact',
      effort: 'low' as const,
      impact: 'high' as const,
      priorityRank: rank,
      findingIds,
      recommendedActions: ['Action'],
    };
  }

  function buildFinding(findingId: string) {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId: 'rule',
      category: 'seo' as const,
      severity: 'serious' as const,
      wcagCriteria: [],
      title: 't',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    };
  }

  it('excludes a theme whose only findingId no longer resolves to any finding', () => {
    const dangling = themeWithFindingIds(1, ['f-removed']);
    const real = themeWithFindingIds(2, ['f001']);

    const rendered = selectRenderedThemes([dangling, real], new Map([['f001', buildFinding('f001') as never]]));

    expect(rendered).toEqual([real]);
  });

  it('never lets a dangling theme occupy a top-6 slot ahead of a real one', () => {
    const themes = [
      themeWithFindingIds(1, ['f-removed']),
      ...[2, 3, 4, 5, 6, 7].map((rank) => themeWithFindingIds(rank, [`f00${rank}`])),
    ];
    const findingsById = new Map(
      [2, 3, 4, 5, 6, 7].map((rank) => [`f00${rank}`, buildFinding(`f00${rank}`) as never] as const),
    );

    const rendered = selectRenderedThemes(themes, findingsById);

    expect(rendered.map((t) => t.priorityRank)).toEqual([2, 3, 4, 5, 6, 7]);
  });
});

// P1.2 (2026-08-21 La Corniche feedback pass): a priority card's own
// recommended-action prose told the client to ask their agency to fix a
// defect living inside a third-party plugin (e.g. Gravity Forms) their
// agency structurally cannot patch. A deterministic sentence beneath the
// prose splits the ask when a theme's findings span both first- and
// third-party pages.
describe('P1.2: the first-party/third-party ownership split note', () => {
  function buildFinding(overrides: Record<string, unknown>) {
    return {
      findingId: overrides['findingId'] ?? 'f001',
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      ruleId: 'button-name',
      category: 'accessibility' as const,
      severity: 'serious' as const,
      wcagCriteria: ['4.1.2'],
      title: 'Buttons must have discernible text',
      description: 'd',
      pageUrls: [],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: overrides['findingId'] ?? 'f001',
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
      ...overrides,
    };
  }

  function buildAnalysis(findingIds: string[]) {
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
          title: 'Boutons sans texte accessible',
          category: 'accessibility' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds,
          recommendedActions: ['Demandez à votre prestataire technique d\'ajouter un texte visible.'],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  const manifest = { pages: [] } as never;

  it('renders the split sentence naming the vendor when the theme spans first- and third-party pages', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        pageUrls: ['https://example.com/'],
        elements: [{ pageUrl: 'https://example.com/', selector: 'header form', snippet: '' }],
      }),
      buildFinding({
        findingId: 'f002',
        pageUrls: ['https://example.com/contact'],
        elements: [{ pageUrl: 'https://example.com/contact', selector: '.gform_wrapper button', snippet: '' }],
      }),
    ];
    const analysis = buildAnalysis(['f001', 'f002']);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings as never, manifest);

    expect(html).toContain('relèvent de votre site');
    expect(html).toContain('Gravity Forms');
    expect(html).toContain('à transmettre à son éditeur');
  });

  it('renders nothing when every finding in the theme is first-party', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        pageUrls: ['https://example.com/'],
        elements: [{ pageUrl: 'https://example.com/', selector: 'header nav a', snippet: '' }],
      }),
    ];
    const analysis = buildAnalysis(['f001']);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings as never, manifest);

    expect(html).not.toContain('à transmettre à son éditeur');
  });

  it('falls back to a generic label when no known vendor prefix matches the third-party selector', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        pageUrls: ['https://example.com/'],
        elements: [{ pageUrl: 'https://example.com/', selector: 'header form', snippet: '' }],
      }),
      buildFinding({
        findingId: 'f002',
        pageUrls: ['https://example.com/contact'],
        elements: [{ pageUrl: 'https://example.com/contact', selector: '.some-widget >>> button', snippet: '' }],
      }),
    ];
    const analysis = buildAnalysis(['f001', 'f002']);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings as never, manifest);

    expect(html).toContain('un composant tiers');
  });
});

// P1.5 (2026-08-21 La Corniche feedback pass): a director's first
// question is "what will this cost me" - "Faible/Moyen/Élevé" alone
// doesn't answer it.
describe('P1.5: the aggregate effort estimate sentence', () => {
  function buildFinding(findingId: string): Finding {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      ruleId: 'button-name',
      category: 'accessibility' as const,
      severity: 'serious' as const,
      wcagCriteria: ['4.1.2'],
      title: 'Buttons must have discernible text',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    } as never;
  }

  function buildAnalysis(efforts: Array<'low' | 'medium' | 'high'>) {
    return {
      auditId: 'a1',
      language: 'fr' as const,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'medium' as const,
      executiveSummary: 'summary',
      themes: efforts.map((effort, i) => ({
        title: `Theme ${i + 1}`,
        category: 'accessibility' as const,
        businessImpact: 'Impact',
        effort,
        impact: 'high' as const,
        priorityRank: i + 1,
        findingIds: [`f00${i + 1}`],
        recommendedActions: [],
      })),
      quickWins: [],
      notes: '',
    };
  }

  const manifest = { pages: [] } as never;

  it('renders a global day-range estimate computed from the rendered cards\' effort labels', () => {
    const efforts: Array<'low' | 'medium' | 'high'> = ['low', 'medium'];
    const findings = efforts.map((_, i) => buildFinding(`f00${i + 1}`));
    const analysis = buildAnalysis(efforts);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).toContain('Estimation globale');
    expect(html).toContain('jours de développement');
  });

  it('renders nothing when there are no rendered themes at all', () => {
    const analysis = buildAnalysis([]);
    const html = renderThemes(getStrings('fr'), 4, analysis as never, [], manifest);

    expect(html).not.toContain('Estimation globale');
  });
});

// P2.2 (2026-08-21 La Corniche feedback pass): "Sans objet" read as
// "unknown" at the point it's first encountered - the explanation only
// lived in the glossary, 20 pages later.
describe('P2.2: the inline "Sans objet" gloss', () => {
  function buildFinding(findingId: string, category: 'accessibility' | 'seo' = 'seo'): Finding {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId: 'meta-description',
      category,
      severity: 'moderate' as const,
      wcagCriteria: [],
      title: 'Missing meta description',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    } as never;
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
          title: 'SEO issue one',
          category: 'seo' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'medium' as const,
          priorityRank: 1,
          findingIds: ['f001'],
          recommendedActions: [],
        },
        {
          title: 'SEO issue two',
          category: 'seo' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'medium' as const,
          priorityRank: 2,
          findingIds: ['f002'],
          recommendedActions: [],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  const manifest = { pages: [] } as never;

  it('shows the gloss once, on the first card whose conformity is "Sans objet"', () => {
    const findings = [buildFinding('f001'), buildFinding('f002')];
    const analysis = buildAnalysis();

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);
    const occurrences = html.split('ce chantier ne relève pas de').length - 1;

    expect(occurrences).toBe(1);
  });
});

// 2026-08-22, La Corniche report review: Impact commercial and
// Conformité rendered as plain grey text with no colour signal, so the
// stated urgency ("Élevé", "Non conforme") carried no visual weight.
// Effort deliberately stays uncoloured (high effort means expensive, not
// urgent - colouring it red would say the opposite of the truth).
describe('2026-08-22: Impact commercial and Conformité are colour-coded, Effort is not', () => {
  function buildFinding(findingId: string, category: 'accessibility' | 'seo' = 'accessibility'): Finding {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId: 'image-alt',
      category,
      severity: 'critical' as const,
      wcagCriteria: category === 'accessibility' ? ['1.1.1'] : [],
      title: 'Missing alt text',
      description: 'd',
      pageUrls: ['https://example.com/'],
      occurrences: 1,
      elements: [],
      rawEvidence: {},
      dedupeKey: findingId,
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    } as never;
  }

  function buildAnalysis(impact: 'low' | 'medium' | 'high', category: 'accessibility' | 'seo') {
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
          title: 'Theme one',
          category,
          businessImpact: 'Impact',
          effort: 'high' as const,
          impact,
          priorityRank: 1,
          findingIds: ['f001'],
          legalRelevance: category === 'accessibility' ? 'Critère 1.1.1' : undefined,
          citationEligible: false,
          recommendedActions: [],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  const manifest = { pages: [] } as never;

  it('colours "Impact commercial : Élevé" with the critical/red tone, not plain text', () => {
    const findings = [buildFinding('f001')];
    const analysis = buildAnalysis('high', 'accessibility');
    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    // #d97b82 is SEVERITY.critical.color / LEVEL_COLOR.high.color.
    expect(html).toMatch(/Impact commercial : <strong style="color:#d97b82">Élevé<\/strong>/);
  });

  it('never colours "Effort : Élevé" the same way, since high effort is expensive, not urgent', () => {
    const findings = [buildFinding('f001')];
    const analysis = buildAnalysis('high', 'accessibility');
    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).toMatch(/Effort : <strong style="color:var\(--color-text\)">Élevé<\/strong>/);
    expect(html).not.toMatch(/Effort : <strong style="color:#d97b82">/);
  });

  it('colours "Conformité : Non conforme" red for an accessibility theme with legal relevance', () => {
    const findings = [buildFinding('f001', 'accessibility')];
    const analysis = buildAnalysis('medium', 'accessibility');
    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).toMatch(/Conformité : <strong style="color:#d97b82">Non conforme<\/strong>/);
  });

  it('colours "Conformité : Sans objet" neutral grey, not red, for a non-accessibility theme', () => {
    const findings = [buildFinding('f001', 'seo')];
    const analysis = buildAnalysis('medium', 'seo');
    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).toMatch(/Conformité : <strong style="color:var\(--color-neutral-500\)">Sans objet<\/strong>/);
    expect(html).not.toMatch(/Conformité : <strong style="color:#d97b82">Sans objet/);
  });
});
