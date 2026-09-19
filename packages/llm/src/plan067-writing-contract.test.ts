import { describe, expect, it } from 'vitest';
import { findBusinessClaimViolations } from './business-claim-guard.js';
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
    tenWords.themes[0]!.title = 'Contrastes textes boutons liens menus formulaires titres images claviers';
    expect(tenWords.themes[0]!.title.trim().split(/\s+/)).toHaveLength(10);
    expect(findThemeTitleViolations(tenWords, 'fr')).toEqual([]);

    const elevenWords = output();
    elevenWords.themes[0]!.title =
      'Contrastes textes boutons liens menus formulaires titres images claviers focus navigation';
    expect(findThemeTitleViolations(elevenWords, 'fr')).toMatchObject([
      { reason: 'too-long' },
    ]);

    const overEighty = output();
    overEighty.themes[0]!.title = 'A'.repeat(81);
    expect(findThemeTitleViolations(overEighty, 'fr')).toMatchObject([
      { reason: 'too-long' },
    ]);

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
      expect.arrayContaining([
        expect.objectContaining({ code: 'business-claim-removed' }),
      ]),
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
});
