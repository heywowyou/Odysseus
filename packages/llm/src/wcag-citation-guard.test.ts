import { describe, expect, it } from 'vitest';
import { findWcagCitationViolations } from './wcag-citation-guard.js';
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

describe('findWcagCitationViolations', () => {
  // Verbatim from the first live run's analyses (sas-fernande.fr,
  // 2026-08-02T18-28-34Z-fr.json and 2026-08-02T18-30-16Z-en.json), the
  // fault this guard exists for.
  it.each([
    ['Critère WCAG 2.1 4.1.2 (Nom, rôle et valeur), également repris dans la norme EN 301 549.'],
    ['Relates to WCAG 2.1 Success Criterion 1.4.3 (Contrast, Minimum).'],
  ])('rejects a 2.1 version citation: %s', (businessImpact) => {
    const output = buildOutput({
      themes: [{ themeKey: 't1', title: 'Titre', businessImpact, recommendedActions: ['Agir.'] }],
    });

    const violations = findWcagCitationViolations(output);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.matched.toLowerCase()).toContain('2.1');
  });

  it('rejects a bare version reference without the WCAG name', () => {
    const output = buildOutput({
      executiveSummary: 'Les critères cités suivent la version 2.1 de la norme.',
    });

    expect(findWcagCitationViolations(output)).toHaveLength(1);
  });

  it('rejects a 2.0 citation', () => {
    const output = buildOutput({
      executiveSummary: 'The audit references WCAG 2.0 criteria.',
    });

    expect(findWcagCitationViolations(output)).toHaveLength(1);
  });

  // Verbatim legal strings from current code-built legalRelevance output:
  // three-part criterion numbers must never trip the version pattern.
  it('accepts criterion numbers that contain 2.1 as a substring', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: [
            'Visez le niveau AA du critère 1.4.3, comme les critères 2.1.1 et 2.1.3 le complètent.',
          ],
        },
      ],
      executiveSummary: 'Les critères 1.2.1 et 2.1.1 sont concernés.',
    });

    expect(findWcagCitationViolations(output)).toHaveLength(0);
  });

  it('accepts the correct 2.2 citation', () => {
    const output = buildOutput({
      executiveSummary: 'Visez un ratio de contraste minimum de 4,5:1, conforme au WCAG 2.2.',
    });

    expect(findWcagCitationViolations(output)).toHaveLength(0);
  });

  it('accepts an English contrast ratio that starts with 2.1', () => {
    const output = buildOutput({
      executiveSummary: 'A contrast of 2.1:1 falls short of the 4.5:1 minimum.',
    });

    expect(findWcagCitationViolations(output)).toHaveLength(0);
  });

  it('accepts prose with no version citation at all', () => {
    expect(findWcagCitationViolations(buildOutput())).toHaveLength(0);
  });
});
