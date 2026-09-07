import { describe, expect, it } from 'vitest';
import { findPositionalReferenceViolations } from './positional-reference-guard.js';
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

describe('findPositionalReferenceViolations', () => {
  it.each([
    ['Corrigez en priorité le thème ci-dessus avant les suivants.'],
    ['Comme indiqué ci-dessous, ce thème regroupe plusieurs constats.'],
  ])('rejects a French positional reference: %s', (text) => {
    expect(findPositionalReferenceViolations(buildOutput({ notes: text }), 'fr')).toHaveLength(1);
  });

  it.each([
    ['As noted above, this theme groups several related findings.'],
    ['The priority above should be addressed before this one.'],
    ['See below for the recommended next steps.'],
  ])('rejects an English positional reference: %s', (text) => {
    expect(findPositionalReferenceViolations(buildOutput({ notes: text }), 'en')).toHaveLength(1);
  });

  it('does not flag a legitimate numeric threshold use of "below"', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: [
            'The measured contrast ratio sits below the minimum required threshold.',
          ],
        },
      ],
    });

    expect(findPositionalReferenceViolations(output, 'en')).toHaveLength(0);
  });

  it('does not flag a legitimate numeric threshold use of "en dessous"', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Le ratio mesuré reste en dessous du seuil requis.',
          recommendedActions: ['Corriger le contraste pour atteindre le seuil requis.'],
        },
      ],
    });

    expect(findPositionalReferenceViolations(output, 'fr')).toHaveLength(0);
  });

  it('flags a positional reference in a theme title', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Corriger le thème ci-dessus en priorité',
          businessImpact: 'Impact.',
          recommendedActions: ['Action.'],
        },
      ],
    });

    expect(findPositionalReferenceViolations(output, 'fr')).toHaveLength(1);
  });
});
