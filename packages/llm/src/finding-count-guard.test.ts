import { describe, expect, it } from 'vitest';
import { findFindingCountViolations } from './finding-count-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

function buildOutput(overrides: Partial<WritingPassOutput> = {}): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Contraste insuffisant',
        businessImpact: 'Vos visiteurs les plus âgés risquent de ne pas lire votre contenu.',
        recommendedActions: ['Augmenter le contraste des textes.'],
        ...(overrides.themes?.[0] ?? {}),
      },
    ],
    executiveSummary: 'Votre site présente des obstacles pour certains visiteurs.',
    notes: '',
    ...overrides,
  };
}

describe('findFindingCountViolations', () => {
  it.each([
    ['Votre site cumule 89 constats répartis sur plusieurs thèmes.', '89 constats'],
    ['Le rapport recense 63 critiques et davantage de constats mineurs.', '63 critiques'],
  ])('rejects an invented finding count: %s', (text, matched) => {
    const violations = findFindingCountViolations(buildOutput({ notes: text }), 'fr');
    expect(violations).toHaveLength(1);
    expect(violations[0]!.matched).toBe(matched);
  });

  it('flags the English form', () => {
    expect(
      findFindingCountViolations(
        buildOutput({ executiveSummary: 'This site carries 18 findings across three themes.' }),
        'en',
      ),
    ).toHaveLength(1);
  });

  it('accepts the same advice without a count', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: ['Ces constats concernent principalement le formulaire.'],
        },
      ],
    });

    expect(findFindingCountViolations(output, 'fr')).toHaveLength(0);
  });

  it('does not flag other legitimate numbers in advice', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: [
            'Visez un ratio de contraste minimum de 4,5:1, conforme au critère WCAG 2.2 niveau AA.',
          ],
        },
      ],
    });

    expect(findFindingCountViolations(output, 'fr')).toHaveLength(0);
  });

  it('flags a finding count in recommendedActions, not just executiveSummary', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: ['Ce thème regroupe 12 constats modérés à corriger en priorité.'],
        },
      ],
    });

    expect(findFindingCountViolations(output, 'fr')).toHaveLength(1);
  });
});
