import { describe, expect, it } from 'vitest';
import {
  findInternalReferenceViolationsInFields,
  hasInternalThemeKeyReference,
} from './internal-reference-guard.js';
import { sanitizeWritingOutput } from './sanitize-writing-output.js';
import {
  emptyWritingPerformanceEvidence,
  type WritingInput,
  type WritingPassOutput,
} from './writing-schema.js';

describe('internal theme-key reference check', () => {
  it.each([
    // The stored French report this check was measured on.
    'Le thème t3 s’appuie sur la règle de contraste.',
    'Le thème t8 est dominé par le temps de blocage.',
    'See t12 for the details.',
    'Les thèmes (t1, t2) se recoupent.',
  ])('flags %s', (text) => {
    expect(hasInternalThemeKeyReference(text)).toBe(true);
  });

  it.each([
    'Les appartements T2 proposent une kitchenette.',
    'Le ratio minimum de 4,5:1 doit être respecté.',
    'Le site est conforme aux WCAG 2.2.',
    'La page doit rester lisible sur un écran de 320 pixels.',
    'Une balise h1 unique structure la page.',
    'Le fichier t3-hero.jpg est trop lourd.',
    'Voir test1 et at3.',
  ])('does not flag %s', (text) => {
    expect(hasInternalThemeKeyReference(text)).toBe(false);
  });

  it('reports the field path and the matched key', () => {
    expect(
      findInternalReferenceViolationsInFields([
        { field: 'notes', text: 'Le thème t3 est prioritaire.' },
        { field: 'executiveSummary', text: 'Aucune référence interne.' },
      ]),
    ).toEqual([{ field: 'notes', matched: 't3' }]);
  });
});

describe('internal theme-key reference sanitation', () => {
  const input: WritingInput = {
    language: 'fr',
    siteContext: {
      businessType: 'hotel',
      primaryGoal: 'unknown',
      languagesServed: ['fr'],
      targetMarkets: ['fr'],
    },
    themes: [{ themeKey: 't1', category: 'accessibility', findings: [], trustedRemediations: [] }],
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
      limitations: [],
    },
  };

  it('removes only the sentence naming a theme key and records the field path', () => {
    const raw: WritingPassOutput = {
      themes: [
        {
          themeKey: 't1',
          title: 'Contrastes et lisibilité',
          businessImpact: 'Certains textes restent difficiles à lire.',
          recommendedActions: ['Augmentez le contraste des textes concernés.'],
        },
      ],
      executiveSummary: 'Les constats portent surtout sur la lisibilité.',
      notes:
        'Aucun contexte n’a été fourni. Le thème t1 s’appuie sur la règle de contraste. La portée reste limitée aux éléments mesurés.',
    };

    const sanitized = sanitizeWritingOutput(input, raw);

    expect(sanitized.output.notes).toBe(
      'Aucun contexte n’a été fourni. La portée reste limitée aux éléments mesurés.',
    );
    expect(sanitized.output.themes).toEqual(raw.themes);
    expect(sanitized.warnings).toEqual([{ code: 'internal-reference-removed', field: 'notes' }]);
  });
});
