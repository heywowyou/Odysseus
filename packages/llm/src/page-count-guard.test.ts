import { describe, expect, it } from 'vitest';
import { findPageCountViolations } from './page-count-guard.js';
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

describe('findPageCountViolations', () => {
  // All four verbatim from the real Domaine Lagnonu analysis (2026-08-24),
  // each contradicting the deterministic count on the same card.
  it.each([
    ['Assurez-vous que les liens répétés sur 18 pages reçoivent un libellé unique.', '18 pages'],
    [
      'Remplacez les iframes sans titre par des alternatives sur les 18 pages concernées.',
      '18 pages',
    ],
    ['Ajoutez des boutons Précédent/Suivant sur les 12 pages concernées.', '12 pages'],
  ])('rejects an invented page count: %s', (action, matched) => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: [action],
        },
      ],
    });

    const violations = findPageCountViolations(output, 'fr');
    expect(violations).toHaveLength(1);
    expect(violations[0]!.matched).toBe(matched);
  });

  it('accepts the same advice without a count', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: ['Augmentez le contraste des textes sur les pages concernées.'],
        },
      ],
    });

    expect(findPageCountViolations(output, 'fr')).toHaveLength(0);
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

    expect(findPageCountViolations(output, 'fr')).toHaveLength(0);
  });

  it('flags a page count in the executive summary', () => {
    expect(
      findPageCountViolations(
        buildOutput({ executiveSummary: 'Le problème touche 43 pages du site.' }),
        'fr',
      ),
    ).toHaveLength(1);
  });

  it('flags the English form', () => {
    expect(
      findPageCountViolations(
        buildOutput({ executiveSummary: 'This affects 18 pages of the site.' }),
        'en',
      ),
    ).toHaveLength(1);
  });

  it('flags a singular page count', () => {
    expect(
      findPageCountViolations(
        buildOutput({ executiveSummary: 'Corrigez la 1 page concernée.' }),
        'fr',
      ),
    ).toHaveLength(1);
  });
});
