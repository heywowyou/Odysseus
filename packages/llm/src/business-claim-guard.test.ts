import { describe, expect, it } from 'vitest';
import { findBusinessClaimViolations } from './business-claim-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

function buildOutput(overrides: Partial<WritingPassOutput> = {}): WritingPassOutput {
  return {
    themes: [
      {
        themeKey: 't1',
        title: 'Formulaire de devis inaccessible',
        businessImpact: 'Certains visiteurs ne peuvent pas terminer l’envoi du formulaire.'
        recommendedActions: ['Simplifier le formulaire de devis.'],
        ...(overrides.themes?.[0] ?? {}),
      },
    ],
    executiveSummary: 'Votre site présente des obstacles pour certains visiteurs.',
    notes: '',
    ...overrides,
  };
}

describe('findBusinessClaimViolations', () => {
  it('rejects a profitability superlative asserted in a theme title', () => {
    // The title renders as a heading beside the canonical severity
    // vocabulary with no prose next to it to carry the claim, so a
    // superlative in a label is as unchecked as one in a sentence.
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'La page la plus rentable du site',
          businessImpact: 'Certains visiteurs ne peuvent pas terminer l’envoi du formulaire.'
          recommendedActions: ['Simplifier le formulaire de devis.'],
        },
      ],
    });

    const violations = findBusinessClaimViolations(output, 'fr');

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      field: 'themes[0](t1).title',
      matched: 'plus rentable',
    });
  });
  // Verbatim from the first live run (sas-fernande.fr, 2026-08-02), the
  // fault this guard exists for.
  it('rejects the unhedged profitability superlative', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact:
            'Le visiteur abandonne. C’est une perte directe de demandes commerciales sur la page la plus rentable du site.',
          recommendedActions: ['Agir.'],
        },
      ],
    });

    const violations = findBusinessClaimViolations(output, 'fr');
    expect(violations).toHaveLength(1);
    expect(violations[0]!.field).toBe('themes[0](t1).businessImpact');
    expect(violations[0]!.matched.toLowerCase()).toContain('rentable');
  });

  it('rejects the English profitability superlative', () => {
    const output = buildOutput({
      executiveSummary: 'This breaks the quote flow on the most profitable page of the site.',
    });

    expect(findBusinessClaimViolations(output, 'en')).toHaveLength(1);
  });

  it('rejects a revenue attribution superlative', () => {
    const output = buildOutput({
      executiveSummary: 'Cette page génère le plus de demandes commerciales du site.',
    });

    expect(findBusinessClaimViolations(output, 'fr')).toHaveLength(1);
  });

  it('rejects the same unsupported claim when the sentence is hedged', () => {
    const output = buildOutput({
      executiveSummary:
        'La page de devis semble être la page la plus rentable du site, à confirmer avec vos statistiques.',
    });

    expect(findBusinessClaimViolations(output, 'fr')).toHaveLength(1);
  });

  it('rejects a hedge appearing after the claim in the same sentence', () => {
    const output = buildOutput({
      executiveSummary: 'La page la plus rentable du site, vraisemblablement, est celle du devis.',
    });

    expect(findBusinessClaimViolations(output, 'fr')).toHaveLength(1);
  });

  // Both verbatim from real stored analyses: traffic superlatives used as
  // generic advice phrasing, with no specific page asserted.
  it('accepts generic traffic advice in French', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: ['Prioriser les pages les plus visitées.'],
        },
      ],
    });

    expect(findBusinessClaimViolations(output, 'fr')).toHaveLength(0);
  });

  it('accepts generic traffic advice in English', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'Impact.',
          recommendedActions: ['Fix the high-traffic pages like activities, events.'],
        },
      ],
    });

    expect(findBusinessClaimViolations(output, 'en')).toHaveLength(0);
  });

  it('accepts non-superlative uses of the same vocabulary', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Titre',
          businessImpact: 'La correction se rentabilise immédiatement.',
          recommendedActions: ['Agir.'],
        },
      ],
    });

    expect(findBusinessClaimViolations(output, 'fr')).toHaveLength(0);
  });

  it('rejects an unsupported claim that a page is commercially important even when framed as appearance', () => {
    const output = buildOutput({
      executiveSummary:
        'La page de devis apparaît commerciale importante : c’est là que les demandes arrivent.',
    });

    expect(findBusinessClaimViolations(output, 'fr')).toHaveLength(1);
  });

  it('rejects unsupported abandonment without needing a revenue or booking noun', () => {
    const output = buildOutput({
      themes: [
        {
          themeKey: 't1',
          title: 'Formulaire de devis',
          businessImpact: 'Certains visiteurs pourraient abandonner avant la validation.',
          recommendedActions: ['Corriger le retour d’erreur du formulaire.'],
        },
      ],
    });

    expect(findBusinessClaimViolations(output, 'fr')).toHaveLength(1);
  });

  it('does not flag an unhedged claim in a different sentence from the hedge', () => {
    const output = buildOutput({
      executiveSummary:
        'La page semble importante. C’est une perte directe sur la page la plus rentable du site.',
    });

    expect(findBusinessClaimViolations(output, 'fr')).toHaveLength(1);
  });
});
