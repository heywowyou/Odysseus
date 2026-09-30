import { describe, expect, it } from 'vitest';
import { findBusinessClaimViolations } from './business-claim-guard.js';
import { findPerformanceEvidenceViolations } from './performance-evidence-guard.js';
import { sanitizeWritingOutput } from './sanitize-writing-output.js';
import { findThemeTitleViolations } from './theme-title-guard.js';
import {
  emptyWritingPerformanceEvidence,
  writingPassOutputSchema,
  type WritingInput,
  type WritingPassOutput,
} from './writing-schema.js';

const baseInput: WritingInput = {
  language: 'fr',
  siteContext: {
    businessType: 'hotel',
    primaryGoal: 'unknown',
    languagesServed: ['fr'],
    targetMarkets: ['fr'],
  },
  themes: [
    {
      themeKey: 't1',
      category: 'accessibility',
      findings: [
        {
          findingId: 'f1',
          source: 'axe',
          ruleId: 'color-contrast',
          category: 'accessibility',
          severity: 'serious',
          wcagCriteria: ['1.4.3'],
          title: 'Contraste insuffisant',
          description: 'Le texte ne respecte pas le contraste minimum.',
          pageUrls: ['https://example.com/'],
          occurrences: 1,
        },
      ],
      trustedRemediations: [
        { ruleId: 'color-contrast', guidance: 'Augmenter le contraste des éléments concernés.' },
      ],
    },
  ],
  siteStats: {
    pagesScanned: 1,
    totalFindings: 1,
    critical: 0,
    serious: 1,
    moderate: 0,
    minor: 0,
  },
  performanceEvidence: emptyWritingPerformanceEvidence(),
  summaryEvidence: {
    siteStats: {
      pagesScanned: 1,
      totalFindings: 1,
      critical: 0,
      serious: 1,
      moderate: 0,
      minor: 0,
    },
    rankedThemes: [{ themeKey: 't1', category: 'accessibility', priorityRank: 1 }],

    categoriesPresent: ['accessibility'],
    performance: emptyWritingPerformanceEvidence(),

    obligationStatus: 'unknown',
    limitations: ['real-user-performance-unavailable'],
  },
  transactionalFlowStatus: 'unknown',
};

function output(overrides: Partial<WritingPassOutput> = {}): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Contrastes et lisibilité',
        businessImpact:
          'Le contraste insuffisant rend certains textes difficiles à lire pour les visiteurs concernés.',
        recommendedActions: ['Augmentez le contraste des éléments concernés.'],
      },
    ],
    executiveSummary: 'Les constats concernent principalement la lisibilité des contenus mesurés.',
    notes: 'La portée reste limitée aux éléments mesurés.',
    ...overrides,
  };
}

describe('Plan 067 writing contract', () => {
  it('accepts a one-sentence impact and one recommended action', () => {
    expect(() => writingPassOutputSchema.parse(output())).not.toThrow();
  });

  it('rejects sentence-style theme titles while accepting noun phrases', () => {
    expect(findThemeTitleViolations(output(), 'fr')).toEqual([]);
    const sentenceTitle = output();
    sentenceTitle.themes[0]!.title = 'Corriger les contrastes pour améliorer la lisibilité';
    expect(findThemeTitleViolations(sentenceTitle, 'fr')).toMatchObject([
      { field: 'themes[0](t1).title', reason: 'sentence-style' },
    ]);
  });

  it('enforces the exact 80-character / 10-word title ceiling and French obligation scaffolds', () => {
    const tenWords = output();
    tenWords.themes[0]!.title =
      'Contrastes textes boutons liens menus formulaires titres images claviers focus';
    expect(tenWords.themes[0]!.title.trim().split(/\s+/)).toHaveLength(10);
    expect(findThemeTitleViolations(tenWords, 'fr')).toEqual([]);

    const elevenWords = output();
    elevenWords.themes[0]!.title =
      'Contrastes textes boutons liens menus formulaires titres images claviers focus navigation usages';
    expect(findThemeTitleViolations(elevenWords, 'fr')).toMatchObject([{ reason: 'too-long' }]);

    const overEighty = output();
    overEighty.themes[0]!.title = 'A'.repeat(81);
    expect(findThemeTitleViolations(overEighty, 'fr')).toMatchObject([{ reason: 'too-long' }]);

    for (const title of [
      'Les contrastes doivent être corrigés',
      'La navigation devrait être améliorée',
      'Il faut corriger les libellés',
    ]) {
      const scaffold = output();
      scaffold.themes[0]!.title = title;
      expect(findThemeTitleViolations(scaffold, 'fr')).toMatchObject([
        { reason: 'sentence-style' },
      ]);
    }
  });

  it('rejects unsupported commercial claims even when hedged', () => {
    const hedged = output();
    hedged.themes[0]!.businessImpact =
      'Ce défaut pourrait réduire les réservations même si aucune donnée de conversion ne le mesure.';
    expect(findBusinessClaimViolations(hedged, 'fr')).toHaveLength(1);
  });

  it('removes only the unsafe sentence/action and preserves unrelated valid content', () => {
    const unsafe = output();
    unsafe.themes[0]!.businessImpact =
      'Le contraste insuffisant rend certains textes difficiles à lire. Ce défaut pourrait réduire les réservations.';
    unsafe.themes[0]!.recommendedActions = [
      'Cette correction pourrait améliorer la conversion.',
      'Augmentez le contraste des éléments concernés.',
    ];
    const originalTitle = unsafe.themes[0]!.title;
    const originalSummary = unsafe.executiveSummary;
    const originalNotes = unsafe.notes;

    const sanitized = sanitizeWritingOutput(baseInput, unsafe);

    expect(sanitized.output.themes[0]!.title).toBe(originalTitle);
    expect(sanitized.output.themes[0]!.businessImpact).toBe(
      'Le contraste insuffisant rend certains textes difficiles à lire.',
    );
    expect(sanitized.output.themes[0]!.recommendedActions).toEqual([
      'Augmentez le contraste des éléments concernés.',
    ]);
    expect(sanitized.output.executiveSummary).toBe(originalSummary);
    expect(sanitized.output.notes).toBe(originalNotes);
    expect(sanitized.warnings).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: 'business-claim-removed' })]),
    );
  });

  it('uses a neutral fallback impact for a fully stripped non-accessibility theme (issue #505)', () => {
    const stripped = (category: 'seo' | 'accessibility', language: 'fr' | 'en') => {
      const input: WritingInput = {
        ...baseInput,
        language,
        themes: [{ ...baseInput.themes[0]!, category }],
      };
      const unsafe = output();
      unsafe.themes[0]!.businessImpact =
        language === 'fr'
          ? 'Ce défaut pourrait réduire les réservations.'
          : 'This defect could reduce bookings.';
      return sanitizeWritingOutput(input, unsafe).output.themes[0]!.businessImpact;
    };

    expect(stripped('seo', 'fr')).toBe(
      'Les constats de ce thème et les pages concernées sont détaillés dans ce rapport.',
    );
    expect(stripped('seo', 'en')).toBe(
      'This theme’s findings and the pages concerned are detailed in this report.',
    );
    expect(stripped('accessibility', 'fr')).toBe(
      'Les constats de ce thème limitent directement l’utilisation des éléments concernés pour les visiteurs affectés.',
    );
  });

  it('removes only a bad executive-summary count sentence and preserves every theme unchanged', () => {
    const unsafe = output();
    unsafe.executiveSummary =
      'Les constats concernent principalement la lisibilité. Le rapport couvre 12 pages analysées.';
    const originalThemes = structuredClone(unsafe.themes);

    const sanitized = sanitizeWritingOutput(baseInput, unsafe);

    expect(sanitized.output.executiveSummary).toBe(
      'Les constats concernent principalement la lisibilité.',
    );
    expect(sanitized.output.themes).toEqual(originalThemes);
    expect(sanitized.warnings).toContainEqual({
      code: 'deterministic-count-removed',
      field: 'executiveSummary',
    });
  });

  it('removes deterministic count and legal contradictions from individual actions', () => {
    const unsafe = output();
    unsafe.themes[0]!.recommendedActions = [
      'Corrigez ce défaut sur les 18 pages concernées.',
      'Cette correction évite une amende.',
      'Augmentez le contraste des éléments concernés.',
    ];

    const sanitized = sanitizeWritingOutput(baseInput, unsafe);

    expect(sanitized.output.themes[0]!.recommendedActions).toEqual([
      'Augmentez le contraste des éléments concernés.',
    ]);
    expect(sanitized.warnings).toEqual(
      expect.arrayContaining([
        {
          code: 'deterministic-count-removed',
          field: 'themes[0](t1).recommendedActions[0]',
        },
        {
          code: 'legal-claim-removed',
          field: 'themes[0](t1).recommendedActions[1]',
        },
      ]),
    );
  });

  it('never silently erases an entire required summary field', () => {
    const unsafe = output({ executiveSummary: 'Le rapport couvre 12 pages.' });

    const sanitized = sanitizeWritingOutput(baseInput, unsafe);

    expect(sanitized.output.executiveSummary).toBeTruthy();
    expect(sanitized.output.executiveSummary).not.toContain('12 pages');
    expect(sanitized.warnings).toContainEqual({
      code: 'deterministic-count-removed',
      field: 'executiveSummary',
    });
  });

  it('removes a suppressed performance recommendation locally without changing valid neighboring prose', () => {
    const performanceInput: WritingInput = {
      ...baseInput,
      themes: [{ ...baseInput.themes[0]!, category: 'performance' }],
      performanceEvidence: {
        fieldDataAvailable: true,
        observations: [
          { metric: 'lcp', source: 'field', value: 2400, rating: 'good' },
          { metric: 'cls', source: 'field', value: 0.18, rating: 'mid' },
          { metric: 'lcp', source: 'lab', value: 20_000, rating: 'poor' },
        ],
        discordances: [
          {
            field: { metric: 'lcp', source: 'field', value: 2400, rating: 'good' },
            lab: { metric: 'lcp', source: 'lab', value: 20_000, rating: 'poor' },
            labNonRepresentativeForRecommendations: true,
          },
        ],
        primaryConcern: { metric: 'cls', source: 'field', value: 0.18, rating: 'mid' },
        suppressedLabRecommendations: ['lcp'],
      },
    };
    const unsafe = output();
    unsafe.themes[0]!.recommendedActions = [
      'Concentrez les corrections sur le LCP mesuré en laboratoire.',
      'Stabilisez les éléments qui se déplacent pendant le chargement.',
    ];

    const sanitized = sanitizeWritingOutput(performanceInput, unsafe);

    expect(sanitized.output.themes[0]!.recommendedActions).toEqual([
      'Stabilisez les éléments qui se déplacent pendant le chargement.',
    ]);
    expect(sanitized.warnings).toContainEqual({
      code: 'performance-contradiction-removed',
      field: 'themes[0](t1).recommendedActions[0]',
    });
  });
  it('removes a plain-language recommendation to fix a suppressed lab signal, and keeps the same wording in an impact sentence', () => {
    const tbtSuppressed: WritingInput = {
      ...baseInput,
      themes: [{ ...baseInput.themes[0]!, category: 'performance' }],
      performanceEvidence: {
        fieldDataAvailable: true,
        observations: [
          { metric: 'inp', source: 'field', value: 195, rating: 'good' },
          { metric: 'tbt', source: 'lab', value: 878, rating: 'poor' },
        ],
        discordances: [
          {
            field: { metric: 'inp', source: 'field', value: 195, rating: 'good' },
            lab: { metric: 'tbt', source: 'lab', value: 878, rating: 'poor' },
            labNonRepresentativeForRecommendations: true,
          },
        ],
        primaryConcern: null,
        suppressedLabRecommendations: ['tbt'],
      },
    };
    const impact =
      "D'après les mesures de laboratoire, les tâches JavaScript longues se prolongent.";
    const unsafe = output();
    unsafe.themes[0]!.businessImpact = impact;
    unsafe.themes[0]!.recommendedActions = [
      'Les tâches JavaScript longues doivent être découpées.',
      'Stabilisez les éléments qui se déplacent pendant le chargement.',
    ];

    const sanitized = sanitizeWritingOutput(tbtSuppressed, unsafe);

    expect(sanitized.output.themes[0]!.recommendedActions).toEqual([
      'Stabilisez les éléments qui se déplacent pendant le chargement.',
    ]);
    expect(sanitized.output.themes[0]!.businessImpact).toBe(impact);
    expect(findPerformanceEvidenceViolations(tbtSuppressed, sanitized.output)).toEqual([]);
    expect(
      findPerformanceEvidenceViolations(tbtSuppressed, unsafe).map((violation) => violation.field),
    ).toEqual(['themes[0](t1).recommendedActions[0]']);
  });

  // Plan 075 J2: Hotel Europe's writer saw only the CLS median (0.016, good)
  // beside a critical CLS finding on 19 pages, 5 of them poor.
  describe('a metric with a critical finding is never rated good', () => {
    const severeCls: WritingInput = {
      ...baseInput,
      themes: [{ ...baseInput.themes[0]!, category: 'performance' }],
      performanceEvidence: {
        ...emptyWritingPerformanceEvidence(),
        severeFindingMetrics: ['cls'],
      },
    };

    it('drops the stored verdicts and keeps a qualified median and unrelated prose', () => {
      const unsafe = output({
        executiveSummary:
          "Les priorités portent sur l'accessibilité. La mesure du décalage cumulatif est bonne. Les pages restent lisibles.",
      });
      unsafe.themes[0]!.businessImpact =
        "La mesure de laboratoire du décalage cumulatif est bonne. Elle n'étaye donc pas une instabilité notable de l'affichage. La valeur médiane du CLS reste bonne, mais cinq pages dépassent le seuil.";

      const sanitized = sanitizeWritingOutput(severeCls, unsafe);

      expect(sanitized.output.executiveSummary).toBe(
        "Les priorités portent sur l'accessibilité. Les pages restent lisibles.",
      );
      expect(sanitized.output.themes[0]!.businessImpact).toBe(
        'La valeur médiane du CLS reste bonne, mais cinq pages dépassent le seuil.',
      );
      expect(sanitized.warnings).toContainEqual({
        code: 'performance-contradiction-removed',
        field: 'executiveSummary',
      });
    });

    it('drops the Baignoire sentence in French and its English equivalent', () => {
      const french = output({ executiveSummary: 'La stabilité visuelle est bonne sur le site.' });
      expect(sanitizeWritingOutput(severeCls, french).output.executiveSummary).not.toContain(
        'stabilité visuelle',
      );

      const english = output({ executiveSummary: 'Visual stability is good across the site.' });
      expect(
        sanitizeWritingOutput({ ...severeCls, language: 'en' }, english).output.executiveSummary,
      ).not.toContain('Visual stability');
    });

    it('leaves the same sentence alone when no severe finding carries the metric', () => {
      const text = 'La mesure du décalage cumulatif est bonne.';
      expect(
        sanitizeWritingOutput(baseInput, output({ executiveSummary: text })).output
          .executiveSummary,
      ).toBe(text);
    });
  });

  // Plan 075 M5: CrUX field data covers the audited origin, yet two stored
  // analyses tied it to the homepage.
  describe('field data is never tied to one page', () => {
    it('drops the two stored sentences and keeps the rest of the prose', () => {
      const unsafe = output({
        executiveSummary:
          "Les priorités portent sur la vitesse. Les données de terrain montrent que l'affichage du plus grand élément visible de la page d'accueil dépasse le seuil attendu.",
      });
      unsafe.themes[0]!.businessImpact =
        "D'après les données recueillies auprès de visiteurs réels, le délai d'affichage du plus grand élément visible de la page d'accueil dépasse le seuil attendu. Les visiteurs attendent avant de voir le contenu.";

      const sanitized = sanitizeWritingOutput(baseInput, unsafe);

      expect(sanitized.output.executiveSummary).toBe('Les priorités portent sur la vitesse.');
      expect(sanitized.output.themes[0]!.businessImpact).toBe(
        'Les visiteurs attendent avant de voir le contenu.',
      );
      expect(sanitized.warnings).toContainEqual({
        code: 'performance-contradiction-removed',
        field: 'executiveSummary',
      });
    });

    it('drops the English equivalent', () => {
      const english = output({
        executiveSummary:
          'Field data shows the largest element on the homepage takes too long to appear.',
      });
      expect(
        sanitizeWritingOutput({ ...baseInput, language: 'en' }, english).output.executiveSummary,
      ).not.toContain('Field data');
    });

    it('keeps field data stated for the site and a homepage sentence without field data', () => {
      const text =
        "Les données de terrain montrent un affichage lent sur l'ensemble du site. La page d'accueil charge un carrousel lourd.";
      expect(
        sanitizeWritingOutput(baseInput, output({ executiveSummary: text })).output
          .executiveSummary,
      ).toBe(text);
    });
  });
});
