import { describe, expect, it } from 'vitest';
import { buildStressFixture } from '../../stress-fixture.js';
import { buildRenderedPriorities } from '../rendered-priorities.js';
import type { Finding, StoredTheme } from '@odysseus/core';
import { selectReferenceStats, SEVERITY_ORDER } from '@odysseus/core';
import {
  isQuickWinTheme,
  MAX_RENDERED_THEMES,
  renderThemes,
  selectRenderedThemes,
} from './themes.js';
import { getStrings } from '../strings/i18n.js';
import { escapeHtml, escapeProse } from '../html-utils.js';
import {
  loadSmallSiteAnalysis,
  loadSmallSiteFindings,
  loadSmallSiteManifest,
} from '../../test-fixtures.js';

describe('renderThemes against the real small-site.test analysis', () => {
  it('renders only the top 6 themes by rank (doc §3 sections 04/05 cap), with a compact findingId reference and exactly one representative page URL per card (F38, as amended by plan 018 step 6)', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), 4, analysis, findings, manifest);
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const rendered = selectRenderedThemes(analysis.themes, findingsById);

    for (const theme of rendered) {
      expect(html).toContain(`id="theme-${theme.priorityRank}"`);
      expect(html).toContain(theme.findingIds[0]);
    }
    if (analysis.themes.length > MAX_RENDERED_THEMES) {
      const dropped = [...analysis.themes].sort((a, b) => a.priorityRank - b.priorityRank)[
        MAX_RENDERED_THEMES
      ]!;
      expect(html).not.toContain(`id="theme-${dropped.priorityRank}"`);
    }
    // F38 used to ban every raw page URL from a theme card. Plan 018 step 6
    // supersedes that: block 3 of each card ("What we observed") names one
    // representative page selected by the priority's own evidence. Issue
    // #40 changed that selection: the page is the representative finding's
    // own lexicographically first pageUrl, so the quoted finding and the
    // example page cannot disagree. The surviving invariant is unchanged:
    // no page URL other than each rendered priority's representative one
    // may appear anywhere in the section.
    const representativeUrls = new Set(
      rendered
        .map((theme) => {
          const themeFindings = theme.findingIds
            .map((id) => findingsById.get(id))
            .filter((f): f is Finding => f !== undefined)
            .sort(
              (a, b) =>
                SEVERITY_ORDER[b.severity] - SEVERITY_ORDER[a.severity] ||
                (a.findingId < b.findingId ? -1 : a.findingId > b.findingId ? 1 : 0),
            );
          return [...new Set(themeFindings[0]?.pageUrls ?? [])].sort()[0];
        })
        .filter((url): url is string => url !== undefined),
    );
    for (const finding of findings) {
      for (const url of finding.pageUrls) {
        if (representativeUrls.has(url)) continue;
        expect(html).not.toContain(url);
        expect(html).not.toContain(escapeHtml(url));
      }
    }
    for (const url of representativeUrls) {
      expect(html).toContain(url);
    }
  });

  it('marks a theme as a quick win only when effort is low and impact is not low', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
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
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
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

// report-feedback-large-rule-families.md item 3.9: SEO priority cards had no
// "Exigence de conformité" box at all (legalRelevance is deterministically
// accessibility-only, trade-off 16), making them one row shorter and
// visibly different-shaped next to accessibility cards in the same "6
// priorities" grid. Every non-accessibility theme now gets the same box,
// stating plainly that no such requirement applies rather than a fake one.
describe('item 3.9: every theme card gets the "Exigence de conformité" box, accessibility or not', () => {
  function seoTheme(): StoredTheme {
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

  it('renders the "Exigence de conformité" item as "Sans objet" for an SEO theme, same box shape as an accessibility theme', () => {
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

    expect(html).toContain('<dt>Exigence de conformité</dt><dd><p>Sans objet');
  });
});

describe('B1: reference-stat citation eligibility and cross-document dedupe', () => {
  it('attaches a citation to a performance theme, not just accessibility/seo', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    // Issue #298: a loading-speed finding, since a speed-to-conversion
    // statistic is scoped to loading-speed rules - findings[0] is a
    // layout-stability metric, which that statistic cannot speak to.
    const findingId = findings.find((f) => f.ruleId === 'largest-contentful-paint')!.findingId;
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
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    const findingId = findings.find((f) => f.ruleId === 'largest-contentful-paint')!.findingId;
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

    const html = renderThemes(
      getStrings('fr'),
      4,
      twoPerformanceThemes,
      findings,
      manifest,
      citedStatIds,
    );

    // Only the first (highest-priority) theme in a category gets a
    // citation per the existing one-per-category rule, so this also
    // covers the "at most once" case without needing a second call.
    expect((html.match(/Repère chiffré/g) ?? []).length).toBe(1);
    expect(citedStatIds.size).toBe(1);
  });

  it('a Set already containing the only matching statistic id suppresses the citation entirely (cross-section dedupe)', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);
    // Issue #298: a loading-speed finding, since a speed-to-conversion
    // statistic is scoped to loading-speed rules - findings[0] is a
    // layout-stability metric, which that statistic cannot speak to.
    const findingId = findings.find((f) => f.ruleId === 'largest-contentful-paint')!.findingId;
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
    const citedStatIds = new Set(
      selectReferenceStats('performance', sector).map((stat) => stat.id),
    );

    const html = renderThemes(
      getStrings('fr'),
      4,
      performanceOnly,
      findings,
      manifest,
      citedStatIds,
    );

    expect(html).not.toContain('Repère chiffré');
  });
});

// report-feedback-large-rule-families.md item 1.1: a real report cited the Pew
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

    const html = renderThemes(
      getStrings('fr'),
      4,
      analysis,
      [legalFinding, jsonldFinding],
      manifest,
    );

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
    elements: [
      { pageUrl: 'https://example.com/products', selector: '.collection__list', snippet: '' },
    ],
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
    const manifest = {
      pages: [{ url: 'https://example.com/products', status: 'visited' }],
    } as never;

    const html = renderThemes(getStrings('fr'), 4, analysis, [ariaFinding], manifest);

    expect(html).not.toContain('70,22');
    expect(html).not.toContain('35,26');
  });

  it("does not cite it even when the site has transactional-flow evidence elsewhere, if not on this finding's own page", () => {
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
                    pageUrl: 'https://example.com/checkout',
                    detail: '',
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const manifest = {
      pages: [{ url: 'https://example.com/products', status: 'visited' }],
    } as never;

    const html = renderThemes(getStrings('fr'), 4, analysis, [ariaFinding], manifest);

    expect(html).not.toContain('70,22');
  });

  it("does cite it when the finding's own page carries real transactional-flow evidence", () => {
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
    const manifest = {
      pages: [{ url: 'https://example.com/products', status: 'visited' }],
    } as never;

    const html = renderThemes(getStrings('fr'), 4, analysis, [ariaFinding], manifest);

    expect(html).toContain('70,22');
  });
});

// item 14: the Deloitte per-0.1s citations invite a reader to naively
// multiply the stated relationship by however many seconds they assume
// their site is over threshold - the real gap on a real report was 3.4s
// above the "good" LCP threshold, not 0.1s.
describe("item 14: a per-0.1s performance citation states the site's own measured LCP gap", () => {
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
        {
          url: 'https://example.com/',
          status: 'visited',
          coreWebVitals: { lcp: { score: 0.1, numericValue: 5900, displayValue: '5.9 s' } },
        },
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
        {
          url: 'https://example.com/',
          status: 'visited',
          coreWebVitals: { lcp: { score: 0.95, numericValue: 1800, displayValue: '1.8 s' } },
        },
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
    pages: [
      {
        url: 'https://example.com/',
        status: 'visited',
        coreWebVitals: { lcp: { score: 0.1, numericValue: 5900, displayValue: '5.9 s' } },
      },
    ],
  } as never;

  it('renders the euro estimate when turnover is known and the top citation is scalable', () => {
    const html = renderThemes(
      getStrings('fr'),
      4,
      hospitalityAnalysisWithTurnover,
      [perfFinding],
      manifest,
    );

    // sector 'hospitality' + strictSector picks deloitte-speed-conversion-travel-2020
    // (ratio 0.101), applied once against 500 000 EUR -> 50 500 EUR raw,
    // floored to 2 significant figures -> 50 000 EUR. Intl.NumberFormat's
    // fr-FR grouping separator is U+202F (narrow no-break space), not a
    // plain space.
    expect(html).toContain('500 000 €');
    expect(html).toContain('50 000 €');
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
      themes: [
        { ...hospitalityAnalysisWithTurnover.themes[0]!, category: 'accessibility' as const },
      ],
    };

    const html = renderThemes(
      getStrings('fr'),
      4,
      accessibilityAnalysis as never,
      [accessibilityFinding],
      manifest,
    );

    expect(html).not.toContain('estimation indicative');
  });
});

// item 27: theme.recommendedActions is generated by the LLM writing pass
// on every analysis (language/severity-vocabulary validated) but was
// never rendered - a theme card stated the problem and its business
// impact without ever stating what to do about it.
describe('item 27: theme cards render recommendedActions', () => {
  it('renders every recommended action for the real small-site.test themes', async () => {
    const [analysis, findings, manifest] = await Promise.all([
      loadSmallSiteAnalysis('fr'),
      loadSmallSiteFindings(),
      loadSmallSiteManifest(),
    ]);

    const html = renderThemes(getStrings('fr'), 4, analysis, findings, manifest);
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));
    const rendered = selectRenderedThemes(analysis.themes, findingsById);

    for (const theme of rendered) {
      for (const action of theme.recommendedActions) {
        expect(html).toContain(escapeProse(action, 'fr'));
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

// report-feedback-large-rule-families.md item 1.5: a real report had all 6
// rendered theme cards carrying the "Gain rapide" badge and "Effort :
// Faible", under a heading claiming a two-axis sort ("classés par effort
// et par impact") the data gave no evidence of - the badge distinguished
// nothing. Rendered only when not every rendered theme is a quick win.
describe('item 1.5: the quick-win badge does not render when every rendered theme would carry it', () => {
  function quickWinTheme(rank: number, findingId: string): StoredTheme {
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

  function buildAnalysis(themes: StoredTheme[]) {
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

    expect((html.match(/Action rapide/g) ?? []).length).toBe(2);
  });
});

// report-feedback-large-rule-families.md item 0.6: a real report rendered a
// priority ("Mentions légales incomplètes") with "Pages affectées: 0
// pages sur 18" - its only finding had been stripped by
// lcen-resolution.ts's resolveLcenFinding after a manual SIREN
// confirmation, leaving a dangling theme that still won a top-6 slot.
describe('item 0.6: a theme with no resolved findings is never selected as a rendered priority', () => {
  function themeWithFindingIds(rank: number, findingIds: string[]): StoredTheme {
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

    const rendered = selectRenderedThemes(
      [dangling, real],
      new Map([['f001', buildFinding('f001') as never]]),
    );

    expect(rendered).toEqual([real]);
  });

  it('never lets a dangling theme occupy a top-6 slot ahead of a real one', () => {
    const themes = [
      themeWithFindingIds(1, ['f-removed']),
      ...[2, 3, 4, 5, 6, 7].map((rank) => themeWithFindingIds(rank, [`f00${rank}`])),
    ];
    const findingsById = new Map(
      [2, 3, 4, 5, 6, 7].map(
        (rank) => [`f00${rank}`, buildFinding(`f00${rank}`) as never] as const,
      ),
    );

    const rendered = selectRenderedThemes(themes, findingsById);

    expect(rendered.map((t) => t.priorityRank)).toEqual([2, 3, 4, 5, 6, 7]);
  });
});

// P1.2 (2026-08-21 Large Rule Families feedback pass): a priority card's own
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
          recommendedActions: [
            "Demandez à votre prestataire technique d'ajouter un texte visible.",
          ],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  // Issue #296: both halves of the split count the analyzed scope, so these
  // cases need a manifest that actually visited the pages they cite - an
  // empty one describes a card whose own "Pages concernées" reads zero.
  function manifestFor(...urls: string[]) {
    return { pages: urls.map((url) => ({ url, status: 'visited' })) } as never;
  }

  const manifest = manifestFor(
    'https://example.com/',
    'https://example.com/contact',
    'https://example.com/reserver',
  );

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
        elements: [
          {
            pageUrl: 'https://example.com/contact',
            selector: '.gform_wrapper button',
            snippet: '',
          },
        ],
      }),
    ];
    const analysis = buildAnalysis(['f001', 'f002']);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings as never, manifest);

    expect(html).toContain('relevant de votre site');
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
        elements: [
          {
            pageUrl: 'https://example.com/contact',
            selector: '.some-widget >>> button',
            snippet: '',
          },
        ],
      }),
    ];
    const analysis = buildAnalysis(['f001', 'f002']);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings as never, manifest);

    expect(html).toContain('ce composant tiers');
  });

  /** Issue #296: a Haaitza card read "Pages concernées : 41 pages sur 140"
   *  above a split claiming 95 pages on the first-party side alone, because
   *  the split counted every cited URL while the card's own total counted
   *  only visited ones. */
  it('counts both halves over the analyzed scope, so neither can exceed the card total', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        pageUrls: ['https://example.com/', 'https://example.com/archive-2019'],
        elements: [{ pageUrl: 'https://example.com/', selector: 'header form', snippet: '' }],
      }),
      buildFinding({
        findingId: 'f002',
        pageUrls: ['https://example.com/contact', 'https://example.com/archive-2020'],
        elements: [
          {
            pageUrl: 'https://example.com/contact',
            selector: '.gform_wrapper button',
            snippet: '',
          },
        ],
      }),
    ];
    const analysis = buildAnalysis(['f001', 'f002']);

    const html = renderThemes(
      getStrings('fr'),
      4,
      analysis as never,
      findings as never,
      manifestFor('https://example.com/', 'https://example.com/contact'),
    );

    // Two visited pages in the card total, one on each side of the split -
    // the unvisited archive pages count for neither.
    expect(html).toContain('2 pages sur 2');
    expect(html).toContain('1 page relevant de votre site');
    expect(html).toContain('et 1 page relevant de Gravity Forms');
  });

  it('counts the card total over the content-checked pages, not every visited one', () => {
    // A real French report's cards read "522 pages sur 522" while its
    // metadata sheet and statistics tile both said "520 pages analysées":
    // the denominator counted visited pages, the perimeter figure counted
    // content-checked ones.
    const coverage = (outcome: 'completed' | 'failed') => ({
      plannerVersion: 'v1',
      role: 'content',
      confidence: 'high',
      reasonCodes: [],
      passes: {
        rendered: { outcome },
        axe: { outcome },
        extended: { outcome },
        lighthouse: { outcome: 'completed' },
      },
    });
    const manifestWithCoverage = {
      pages: [
        { url: 'https://example.com/', status: 'visited', analysisCoverage: coverage('completed') },
        {
          url: 'https://example.com/contact',
          status: 'visited',
          analysisCoverage: coverage('failed'),
        },
      ],
    } as never;
    const findings = [
      buildFinding({
        findingId: 'f001',
        pageUrls: ['https://example.com/', 'https://example.com/contact'],
        elements: [{ pageUrl: 'https://example.com/', selector: 'header form', snippet: '' }],
      }),
    ];

    const html = renderThemes(
      getStrings('fr'),
      4,
      buildAnalysis(['f001']) as never,
      findings as never,
      manifestWithCoverage,
    );

    expect(html).toContain('1 page sur 1');
    expect(html).not.toContain('sur 2');
  });

  it('fix #2 (2026-08-25 report review): names ZenChef when every finding in the theme is inside its iframe', () => {
    const findings = [
      buildFinding({
        findingId: 'f001',
        pageUrls: ['https://example.com/'],
        elements: [
          {
            pageUrl: 'https://example.com/',
            selector: '.ZC_sdk__zc-iframe_k5FE3 >>> button[data-testid="x"]',
            snippet: '',
          },
        ],
      }),
      buildFinding({
        findingId: 'f002',
        pageUrls: ['https://example.com/reserver'],
        elements: [
          {
            pageUrl: 'https://example.com/reserver',
            selector: 'body.page > iframe.ZC_sdk__zc-iframe_k5FE3',
            snippet: '',
          },
        ],
      }),
    ];
    const analysis = buildAnalysis(['f001', 'f002']);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings as never, manifest);

    expect(html).toContain('ZenChef');
    expect(html).toContain('relève entièrement de');
    // Mutually exclusive with the split note: this theme is entirely
    // third-party, so the split sentence must not also render.
    expect(html).not.toContain('à transmettre à son éditeur');
  });
});

describe('fix #3 (2026-08-25 report review): the LCEN priority card cross-references the legal-exposure section', () => {
  function buildFinding(overrides: Record<string, unknown>) {
    return {
      findingId: overrides['findingId'] ?? 'f001',
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId: overrides['ruleId'] ?? 'some-other-rule',
      category: 'privacy' as const,
      severity: 'serious' as const,
      wcagCriteria: [],
      title: 'title',
      description: 'd',
      pageUrls: ['https://example.com/'],
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
          title: 'Mentions légales manquantes',
          category: 'privacy' as const,
          businessImpact: 'Impact',
          effort: 'low' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds,
          recommendedActions: [],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  const manifest = { pages: [] } as never;

  it('renders a pointer sentence naming the legal-exposure section when the theme includes the LCEN finding', () => {
    const findings = [buildFinding({ findingId: 'f001', ruleId: 'lcen-mentions-legales-missing' })];
    const analysis = buildAnalysis(['f001']);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings as never, manifest);

    expect(html).toContain('obligation légale d’identification');
    expect(html).toContain('Cadre réglementaire');
  });

  it('renders nothing when the theme has no LCEN finding', () => {
    const findings = [buildFinding({ findingId: 'f001', ruleId: 'some-other-rule' })];
    const analysis = buildAnalysis(['f001']);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings as never, manifest);

    expect(html).not.toContain('obligation légale d’identification');
  });
});

// P1.5 (2026-08-21 Large Rule Families feedback pass): a director's first
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
        title: `StoredTheme ${i + 1}`,
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

  it('does not render an aggregate development-day estimate', () => {
    const efforts: Array<'low' | 'medium' | 'high'> = ['low', 'medium'];
    const findings = efforts.map((_, i) => buildFinding(`f00${i + 1}`));
    const analysis = buildAnalysis(efforts);

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).not.toContain('Estimation globale');
    expect(html).not.toContain('jours de développement');
  });

  it('renders nothing when there are no rendered themes at all', () => {
    const analysis = buildAnalysis([]);
    const html = renderThemes(getStrings('fr'), 4, analysis as never, [], manifest);

    expect(html).not.toContain('Estimation globale');
  });
});

// P2.2 (2026-08-21 Large Rule Families feedback pass): "Sans objet" read as
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

// 2026-08-22, Large Rule Families report review: Why it matters and
// Conformité rendered as plain grey text with no colour signal, so the
// stated urgency ("Élevé", "Non conforme") carried no visual weight.
// Effort deliberately stays uncoloured (high effort means expensive, not
// urgent - colouring it red would say the opposite of the truth).
describe('2026-08-22: Impact commercial and Conformité are colour-coded, Effort is not', () => {
  function buildFinding(
    findingId: string,
    category: 'accessibility' | 'seo' = 'accessibility',
  ): Finding {
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
          title: 'StoredTheme one',
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

  it('colours the "Impact : Élevé" fact with the critical/red tone, not plain text', () => {
    const findings = [buildFinding('f001')];
    const analysis = buildAnalysis('high', 'accessibility');
    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    // #d97b82 is SEVERITY.critical.color / LEVEL_COLOR.high.color.
    expect(html).toContain(
      '<span class="theme-fact-label">Impact</span><span class="theme-fact-value" style="color:#d97b82">Élevé</span>',
    );
  });

  it('never colours the "Complexité : Élevée" fact the same way, since high complexity is expensive, not urgent', () => {
    const findings = [buildFinding('f001')];
    const analysis = buildAnalysis('high', 'accessibility');
    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    // Plan 018 step 6 renamed the card footer's effort item "Complexity"
    // (and confines the word to this one detailed card). Issue #305:
    // "complexité" is feminine, so the rating agrees ("Élevée"), distinct
    // from the masculine impact ramp.
    expect(html).toContain(
      '<span class="theme-fact-label">Complexité</span><span class="theme-fact-value">Élevée</span>',
    );
  });

  it('colours the "Conformité : Non conforme" fact red for an accessibility theme with legal relevance', () => {
    const findings = [buildFinding('f001', 'accessibility')];
    const analysis = buildAnalysis('medium', 'accessibility');
    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).toContain(
      '<span class="theme-fact-label">Conformité</span><span class="theme-fact-value" style="color:#d97b82">Non conforme</span>',
    );
  });

  // Issue #47: the footer strip no longer prints "Conformité : Sans
  // objet" for a non-accessibility theme - it duplicated the "Exigence de
  // conformité : Sans objet" box three lines above, the same statement
  // twice on one card. The strip states conformity only when there is a
  // conformance status to state; the box (with the P2.2 gloss on the
  // first card that needs it) carries the Sans objet statement.
  it('states no "Conformité : Sans objet" fact for a non-accessibility theme; the Exigence item carries it', () => {
    const findings = [buildFinding('f001', 'seo')];
    const analysis = buildAnalysis('medium', 'seo');
    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).not.toContain('<span class="theme-fact-label">Conformité</span>');
    expect(html).toContain('<dt>Exigence de conformité</dt><dd><p>Sans objet');
    expect(html).not.toContain('Sans objet</span>');
  });
});

// Issue #47: the metadata strip's fixed five-column grid wrapped values
// away from their labels in both languages - "Pourquoi cela compte" split
// from ": Élevé", "28" stranded at a line end away from "pages sur", and
// "Conformité : Non / conforme" broken so a line began with a bare "Non".
// Each short label/value pair is now one non-breaking unit and the row
// reflows between units.
describe('issue #47: each metadata fact keeps its label and value together, and the facts reflow', () => {
  function buildFinding(findingId: string): Finding {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'axe' as const,
      ruleId: 'image-alt',
      category: 'accessibility',
      severity: 'critical' as const,
      wcagCriteria: ['1.1.1'],
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

  function buildAnalysis(language: 'fr' | 'en') {
    return {
      auditId: 'a1',
      language,
      model: 'test-model',
      temperature: 0,
      generatedAt: new Date(),
      overallRisk: 'medium' as const,
      executiveSummary: 'summary',
      themes: [
        {
          title: 'Chantier un',
          category: 'accessibility' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
          impact: 'high' as const,
          priorityRank: 1,
          findingIds: ['f001'],
          legalRelevance: 'Critère 1.1.1 (Non-contraste), WCAG 2.2 niveau AA',
          recommendedActions: ['Action'],
        },
      ],
      quickWins: [],
      notes: '',
    };
  }

  const manifest = { pages: [{ url: 'https://example.com/', status: 'visited' }] } as never;

  it('renders each fact as one non-breaking unit in the wrapping facts row (fr)', () => {
    const html = renderThemes(
      getStrings('fr'),
      4,
      buildAnalysis('fr') as never,
      [buildFinding('f001')],
      manifest,
    );

    // .theme-facts wraps between facts; .theme-fact is white-space:nowrap
    // (nocturne.css), so a label and its value never split.
    expect(html).toContain('<div class="theme-facts">');
    for (const label of ['Complexité', 'Impact', 'Pages concernées']) {
      expect(html).toContain(
        `<span class="theme-fact"><span class="theme-fact-label">${label}</span>`,
      );
    }
    // The one card here is non-conformant, so its conformity status is a
    // real value and stays among the facts, equally unbreakable.
    expect(html).toContain(
      '<span class="theme-fact"><span class="theme-fact-label">Conformité</span><span class="theme-fact-value" style="color:#d97b82">Non conforme</span></span>',
    );
  });

  it('renders the same non-breaking facts in English', () => {
    const html = renderThemes(
      getStrings('en'),
      4,
      buildAnalysis('en') as never,
      [buildFinding('f001')],
      manifest,
    );

    expect(html).toContain('<div class="theme-facts">');
    for (const label of ['Complexity', 'Impact', 'Pages affected']) {
      expect(html).toContain(
        `<span class="theme-fact"><span class="theme-fact-label">${label}</span>`,
      );
    }
  });
});

describe('B2.2: theme category and reference-stat citations', () => {
  function privacyFinding(findingId: string, ruleId: string): Finding {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'custom' as const,
      ruleId,
      category: 'privacy' as const,
      severity: 'moderate' as const,
      wcagCriteria: [],
      title: ruleId,
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

  const findings = [
    privacyFinding('f1', 'security-header-missing-csp'),
    privacyFinding('f2', 'security-header-missing-hsts'),
  ];

  async function analysisWithCategory(category: StoredTheme['category']) {
    const analysis = await loadSmallSiteAnalysis('fr');
    return {
      ...analysis,
      themes: [
        {
          title: 'En-têtes de sécurité manquants',
          category,
          businessImpact: 'Impact commercial.',
          effort: 'low' as const,
          impact: 'medium' as const,
          priorityRank: 1,
          findingIds: ['f1', 'f2'],
          recommendedActions: ['Demander a votre prestataire de configurer ces en-tetes.'],
        },
      ],
    };
  }

  // The real Domaine Lagnonu analysis (2026-08-24) labelled exactly this
  // theme 'performance' while all its findings were 'privacy', making it
  // eligible for a page-speed conversion statistic - trade-off 16's B1
  // defect arriving through the category rather than the stats table.
  it('renders a mislabelled theme but attaches no citation to it', async () => {
    const html = renderThemes(
      getStrings('fr'),
      4,
      await analysisWithCategory('performance'),
      findings,
      await loadSmallSiteManifest(),
    );

    expect(html).toContain('En-têtes de sécurité manquants');
    expect(html).not.toContain('Deloitte');
  });

  // 'privacy' became a valid StoredTheme category on 2026-08-24 (approved change
  // to the locked llm-output.ts contract), so the model now has a correct
  // answer available for exactly this theme.
  it('accepts privacy as a theme category and renders it', async () => {
    const html = renderThemes(
      getStrings('fr'),
      4,
      await analysisWithCategory('privacy'),
      findings,
      await loadSmallSiteManifest(),
    );

    expect(html).toContain('En-têtes de sécurité manquants');
    // No privacy rows exist in the reference-stat table, so no citation.
    expect(html).not.toContain('Deloitte');
  });
});

describe('B2.1: a category with critical findings always gets a rendered priority', () => {
  function finding(
    findingId: string,
    category: Finding['category'],
    severity: Finding['severity'],
  ): Finding {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'lighthouse' as const,
      ruleId: `rule-${findingId}`,
      category,
      severity,
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

  function theme(
    priorityRank: number,
    category: StoredTheme['category'],
    findingIds: string[],
  ): StoredTheme {
    return {
      title: `StoredTheme ${priorityRank}`,
      category,
      businessImpact: 'Impact.',
      effort: 'low',
      impact: 'medium',
      priorityRank,
      findingIds,
      recommendedActions: ['Action.'],
    };
  }

  // Mirrors the real Domaine Lagnonu shape: six accessibility/seo themes
  // ranked above a performance theme that holds four of the five critical
  // findings, so no performance priority rendered at all.
  it('promotes the performance theme holding critical findings above the render cut', () => {
    const findings = [
      ...Array.from({ length: MAX_RENDERED_THEMES }, (_, i) =>
        finding(`a${i}`, 'accessibility', i === 0 ? 'critical' : 'serious'),
      ),
      finding('p1', 'performance', 'critical'),
    ];
    const themes = [
      ...Array.from({ length: MAX_RENDERED_THEMES }, (_, i) =>
        theme(i + 1, 'accessibility', [`a${i}`]),
      ),
      theme(MAX_RENDERED_THEMES + 6, 'performance', ['p1']),
    ];
    const findingsById = new Map(findings.map((f) => [f.findingId, f]));

    const rendered = selectRenderedThemes(themes, findingsById);

    expect(rendered).toHaveLength(MAX_RENDERED_THEMES);
    expect(rendered.some((t) => t.category === 'performance')).toBe(true);
    // Still ascending, so the numbering a reader sees stays in order.
    expect(rendered.map((t) => t.priorityRank)).toEqual(
      [...rendered.map((t) => t.priorityRank)].sort((a, b) => a - b),
    );
  });

  it('keeps the accessibility critical theme while promoting performance', () => {
    const findings = [
      finding('a0', 'accessibility', 'critical'),
      ...Array.from({ length: MAX_RENDERED_THEMES - 1 }, (_, i) =>
        finding(`a${i + 1}`, 'accessibility', 'serious'),
      ),
      finding('p1', 'performance', 'critical'),
    ];
    const themes = [
      ...Array.from({ length: MAX_RENDERED_THEMES }, (_, i) =>
        theme(i + 1, 'accessibility', [`a${i}`]),
      ),
      theme(MAX_RENDERED_THEMES + 6, 'performance', ['p1']),
    ];

    const rendered = selectRenderedThemes(themes, new Map(findings.map((f) => [f.findingId, f])));

    expect(rendered.some((t) => t.findingIds.includes('a0'))).toBe(true);
    expect(rendered.some((t) => t.findingIds.includes('p1'))).toBe(true);
  });

  it('changes nothing when every theme already fits', () => {
    const findings = [
      finding('a0', 'accessibility', 'critical'),
      finding('p1', 'performance', 'critical'),
    ];
    const themes = [theme(1, 'accessibility', ['a0']), theme(2, 'performance', ['p1'])];

    const rendered = selectRenderedThemes(themes, new Map(findings.map((f) => [f.findingId, f])));

    expect(rendered.map((t) => t.priorityRank)).toEqual([1, 2]);
  });
});

/** D7 (2026-08-25, Lagnonu review). The gap sentence was hardcoded to LCP and
 *  attached wherever the citation landed, so a priority titled "Blocage du
 *  navigateur par des scripts" - total blocking time, median 3 397 ms against
 *  a 200 ms threshold - carried "LCP median a 4 s". Same family as trade-off
 *  16's B1: a deterministic attachment with the wrong anchor. */
describe('D7: the measured gap names the metric the priority is actually about', () => {
  function analysisWith(title: string, findingIds: string[] = ['f001']) {
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
          title,
          category: 'performance' as const,
          businessImpact: 'Impact',
          effort: 'medium' as const,
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

  function findingFor(ruleId: string, findingId = 'f001') {
    return {
      findingId,
      auditId: 'a1',
      schemaVersion: 1 as const,
      source: 'lighthouse' as const,
      ruleId,
      category: 'performance' as const,
      severity: 'serious' as const,
      wcagCriteria: [],
      title: ruleId,
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

  it('quotes blocking time, in milliseconds, for a blocking-time priority', () => {
    const manifest = {
      pages: [
        {
          url: 'https://example.com/',
          status: 'visited',
          coreWebVitals: {
            tbt: { score: 0.1, numericValue: 3397, displayValue: '3397 ms' },
            lcp: { score: 0.4, numericValue: 4000, displayValue: '4 s' },
          },
        },
      ],
    } as never;

    const html = renderThemes(
      getStrings('fr'),
      4,
      analysisWith('Blocage du navigateur par des scripts'),
      [findingFor('total-blocking-time')],
      manifest,
    );

    expect(html).toContain('Écart mesuré sur ce site');
    expect(html).toContain('TBT, temps de blocage');
    // French digit grouping uses a non-breaking space, so normalise before
    // comparing rather than hardcoding whichever space character Intl picks.
    expect(html.replace(/[\u00a0\u202f]/g, ' ')).toContain('3 397 ms');
    // The bug: LCP's own numbers appearing under a blocking-time priority.
    expect(html).not.toContain('LCP, contenu principal');
  });

  it('still quotes LCP for an LCP priority', () => {
    const manifest = {
      pages: [
        {
          url: 'https://example.com/',
          status: 'visited',
          coreWebVitals: { lcp: { score: 0.1, numericValue: 5900, displayValue: '5.9 s' } },
        },
      ],
    } as never;

    const html = renderThemes(
      getStrings('fr'),
      4,
      analysisWith('Vitesse mobile insuffisante'),
      [findingFor('largest-contentful-paint')],
      manifest,
    );

    expect(html).toContain('LCP, contenu principal');
    expect(html).toContain('5,9 s');
  });

  it('says nothing when the priority names no Core Web Vital at all', () => {
    // Quoting an unrelated metric is worse than staying silent.
    const manifest = {
      pages: [
        {
          url: 'https://example.com/',
          status: 'visited',
          coreWebVitals: { lcp: { score: 0.1, numericValue: 5900, displayValue: '5.9 s' } },
        },
      ],
    } as never;

    const html = renderThemes(
      getStrings('fr'),
      4,
      analysisWith('En-têtes de sécurité manquants'),
      [findingFor('render-blocking-resources')],
      manifest,
    );

    expect(html).not.toContain('Écart mesuré sur ce site');
  });

  it('says nothing on a genuine tie between distinct Core Web Vitals, rather than silently favouring LCP (real Lagnonu case)', () => {
    // Real shape: one finding each for TBT, FCP, LCP and Speed Index under
    // a priority titled for blocking scripts (TBT), not LCP. The old
    // preference-order tie-break picked LCP purely because it came first
    // in CWV_METRIC_PREFERENCE, producing an LCP gap sentence under a
    // TBT-titled priority - the exact wrong-anchor defect D7 fixed for the
    // single-dominant-metric case, reappearing in the tied case.
    const manifest = {
      pages: [
        {
          url: 'https://example.com/',
          status: 'visited',
          coreWebVitals: {
            tbt: { score: 0.1, numericValue: 2500, displayValue: '2500 ms' },
            fcp: { score: 0.1, numericValue: 3200, displayValue: '3.2 s' },
            lcp: { score: 0.4, numericValue: 3900, displayValue: '3.9 s' },
            speedIndex: { score: 0.1, numericValue: 9000, displayValue: '9 s' },
          },
        },
      ],
    } as never;

    const html = renderThemes(
      getStrings('fr'),
      4,
      analysisWith('Blocage du navigateur par des scripts JavaScript', [
        'f002',
        'f003',
        'f004',
        'f005',
      ]),
      [
        findingFor('total-blocking-time', 'f002'),
        findingFor('first-contentful-paint', 'f003'),
        findingFor('largest-contentful-paint', 'f004'),
        findingFor('speed-index', 'f005'),
      ],
      manifest,
    );

    expect(html).not.toContain('Écart mesuré sur ce site');
    expect(html).not.toContain('LCP, contenu principal');
  });
});

// Plan 018 step 6: each priority card reads outcome first and carries a
// concrete deterministic observation. The six blocks in order:
//   1. rank, category, quick-win marker, stored technical title;
//   2. "Why it matters" (theme.businessImpact);
//   3. "What we observed" (defect label, representative page, exact counts,
//      from the priority's own evidence, never counts alone);
//   4. "What you can do" (recommended + reviewed remediation + ownership);
//   5. legal and citation context;
//   6. footer metadata: Complexity, commercial impact, affected pages,
//      conformity, finding references.
// The stored technical title is kept as is in this plan; presentation order
// is the only change.
describe('plan 018 step 6: priority card order and the deterministic observation block', () => {
  function buildFinding(overrides: Partial<Finding> & Pick<Finding, 'findingId'>): Finding {
    return {
      auditId: 'a1',
      schemaVersion: 1,
      source: 'axe',
      ruleId: 'color-contrast',
      category: 'accessibility',
      severity: 'serious',
      wcagCriteria: ['1.4.3'],
      title: 't',
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

  function buildTheme(findingIds: string[], overrides: Partial<StoredTheme> = {}): StoredTheme {
    return {
      title: 'Contraste insuffisant sur les pages clés',
      category: 'accessibility',
      businessImpact: 'Des visiteurs ne peuvent pas lire les prix.',
      effort: 'low',
      impact: 'high',
      priorityRank: 1,
      findingIds,
      legalRelevance: 'Critère 1.4.3 (Contraste minimum), WCAG 2.2 niveau AA',
      recommendedActions: ['Augmentez le contraste des textes concernés.'],
      ...overrides,
    };
  }

  function buildAnalysis(themes: StoredTheme[]) {
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

  // Issue #41: the observation's page count is confined to the manifest's
  // visited pages, the same population the "sur {totalPages}" denominator
  // counts, so this fixture marks every URL its findings cite as visited.
  const manifest = {
    pages: [
      { url: 'https://example.com/', status: 'visited' },
      { url: 'https://example.com/zones/visiteur', status: 'visited' },
      { url: 'https://example.com/a-propos', status: 'visited' },
    ],
  } as never;

  it('renders the card blocks in order, decision facts under the title, then outcome first', () => {
    const analysis = buildAnalysis([
      buildTheme(['f002', 'f001']),
      buildTheme(['f003'], {
        title: 'Structure ARIA incorrecte',
        effort: 'medium',
        impact: 'medium',
        priorityRank: 2,
        legalRelevance: undefined,
      }),
    ]);
    const findings = [
      buildFinding({ findingId: 'f001' }),
      buildFinding({ findingId: 'f002', severity: 'critical' }),
      buildFinding({ findingId: 'f003' }),
    ];

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    // The quick-win badge is suppressed when every rendered theme is one
    // (item 1.5), so the second theme is deliberately not a quick win: the
    // badge on card 1 becomes an assertable block-1 marker.
    const markers = [
      'id="theme-1"', // 1. rank
      'Accessibilité', // 1. category tag
      'class="tag qw"', // 1. quick-win marker
      'Contraste insuffisant sur les pages clés', // 1. stored technical title
      'class="theme-fact-label">Complexité', // 1. decision facts
      'Enjeu', // 2
      'Ce que nous avons constaté', // 3
      'Comment le corriger', // 4
      'Exigence de conformité', // 5. context
      'class="theme-context-item"><dt>Constats', // 5. finding references
      'id="theme-2"', // the second card follows the first card's blocks
    ];
    let last = -1;
    for (const marker of markers) {
      const index = html.indexOf(marker);
      expect(index, `marker not found: ${marker}`).toBeGreaterThan(-1);
      expect(index, `marker out of order: ${marker}`).toBeGreaterThan(last);
      last = index;
    }
  });

  it('grounds the observation in the evidence: defect label first, then the representative page and the exact page and occurrence counts', () => {
    const analysis = buildAnalysis([buildTheme(['f001', 'f002'])]);
    const findings = [
      buildFinding({
        findingId: 'f001',
        severity: 'serious',
        occurrences: 2,
        pageUrls: ['https://example.com/zones/visiteur', 'https://example.com/a-propos'],
      }),
      buildFinding({
        findingId: 'f002',
        severity: 'critical',
        occurrences: 3,
        pageUrls: ['https://example.com/a-propos'],
      }),
    ];

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    // Representative finding: the critical f002, so its reviewed French
    // label leads the sentence. Representative page: the lexicographically
    // first entry of the deduplicated page union. Counts: 2 distinct pages,
    // 2 + 3 = 5 occurrences, exact and never approximate. French guillemets
    // carry U+00A0 (never U+202F), per the canonical strings rule.
    expect(html).toContain(
      'Cette priorité comprend notamment le constat «\u00a0Le contraste des couleurs est insuffisant\u00a0», relevé sur la page https://example.com/a-propos. Au total, elle concerne 2 pages et 5 occurrences.',
    );
  });

  it('renders the zero-page variant when no finding in the priority carries a page URL', () => {
    const analysis = buildAnalysis([buildTheme(['f001'])]);
    const findings = [buildFinding({ findingId: 'f001', pageUrls: [], occurrences: 4 })];

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).toContain(
      'Cette priorité comprend notamment le constat «\u00a0Le contraste des couleurs est insuffisant\u00a0». Au total, elle concerne 0 pages et 4 occurrences.',
    );
  });

  it('escapes the observation: a markup-bearing scanner title and a URL ampersand cannot inject', () => {
    const analysis = buildAnalysis([buildTheme(['f001'])]);
    const findings = [
      buildFinding({
        findingId: 'f001',
        ruleId: 'rule-not-in-the-translations',
        title: '<script>alert(1)</script>',
        pageUrls: ['https://example.com/recherche?q=1&tri=prix'],
      }),
    ];

    const html = renderThemes(getStrings('fr'), 4, analysis as never, findings, manifest);

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('q=1&tri=prix');
    expect(html).toContain('q=1&amp;tri=prix');
  });

  it('renders the same blocks in English for an English report', () => {
    const analysis = { ...buildAnalysis([buildTheme(['f001'])]), language: 'en' as const };
    const findings = [buildFinding({ findingId: 'f001' })];

    const html = renderThemes(getStrings('en'), 4, analysis as never, findings, manifest);

    for (const marker of ['Why it matters', 'What we found', 'How to fix it']) {
      expect(html).toContain(marker);
    }
    expect(html).toContain('class="theme-fact-label">Complexity');
    // The English report resolves the label to the scanner's own English
    // title through the same shared helper.
    expect(html).toContain('This workstream includes the finding');
    expect(html).toContain(
      'found on https://example.com/. In total, it affects 1 page and 1 occurrence.',
    );
  });
});

// Issue #325: reviewed-remediation lines opened on raw rule ids
// ("structured-data-invalid:") beside French titles.
describe('reviewed remediation lines lead with the rule label (issue #325)', () => {
  it('opens each line on the display label and keeps the id as a quiet reference', () => {
    const { analysis, findings, manifest } = buildStressFixture();
    const priorities = buildRenderedPriorities(analysis.themes, findings, manifest, 'fr');
    const html = renderThemes(
      getStrings('fr'),
      4,
      analysis,
      findings,
      manifest,
      undefined,
      undefined,
      priorities,
    );
    const lines = [...html.matchAll(/<span class="theme-rule">([^<]*)<\/span>/g)];
    expect(lines.length).toBeGreaterThan(0);
    expect(html).toContain('class="mono theme-rule-id"');
    expect(html).not.toContain('class="mono theme-rule"');
    for (const [, label] of lines) {
      expect(label).not.toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)+$/);
    }
  });
});
