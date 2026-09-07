import { describe, expect, it } from 'vitest';
import {
  findProviderPhraseViolations,
  findProviderPhraseViolationsInFields,
  PROVIDER_PHRASE_RETRY_HINT,
  TECHNICAL_PROVIDER_PHRASES,
} from './provider-phrase-guard.js';
import type { WritingPassOutput } from './writing-schema.js';

function output(overrides: Partial<WritingPassOutput> = {}): WritingPassOutput {
  return {
    executiveSummary: 'Une synthèse neutre.',
    notes: '',
    themes: [
      {
        themeKey: 't1',
        title: 'Un thème',
        businessImpact: 'Un impact. Un deuxième. Un troisième.',
        recommendedActions: ['Une action.', 'Une autre action.'],
      },
    ],
    ...overrides,
  } as WritingPassOutput;
}

describe('provider phrase consistency', () => {
  it('accepts a response that uses one approved phrase throughout', () => {
    const violations = findProviderPhraseViolations(
      output({
        themes: [
          {
            themeKey: 't1',
            title: 'Un thème',
            businessImpact: 'Un impact. Un deuxième. Un troisième.',
            recommendedActions: [
              'Demandez à votre prestataire technique de corriger ce point.',
              'Faites confirmer par votre prestataire technique que la correction est en ligne.',
            ],
          },
        ],
      } as Partial<WritingPassOutput>),
      'fr',
    );
    expect(violations).toEqual([]);
  });

  // The measured defect: at both 0.7 and 1.0 every regenerated French
  // analysis named the provider two ways inside one report.
  it('rejects a response that mixes two approved phrases', () => {
    const violations = findProviderPhraseViolations(
      output({
        themes: [
          {
            themeKey: 't1',
            title: 'Un thème',
            businessImpact: 'Un impact. Un deuxième. Un troisième.',
            recommendedActions: [
              'Demandez à votre prestataire technique de corriger ce point.',
              'Demandez à votre prestataire web de corriger cet autre point.',
            ],
          },
        ],
      } as Partial<WritingPassOutput>),
      'fr',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.matched).toContain('votre prestataire web');
    expect(violations[0]!.matched).toContain('votre prestataire technique');
  });

  it('names the field the collision happened in', () => {
    const violations = findProviderPhraseViolations(
      output({
        themes: [
          {
            themeKey: 't1',
            title: 'Un thème',
            businessImpact: 'Un impact. Un deuxième. Un troisième.',
            recommendedActions: [
              'Demandez à votre prestataire technique de corriger ce point.',
              'Demandez à votre prestataire web de corriger cet autre point.',
            ],
          },
        ],
      } as Partial<WritingPassOutput>),
      'fr',
    );
    expect(violations[0]!.field).toBe('themes[0](t1).recommendedActions[1]');
  });

  it('catches a mix that spans two different themes', () => {
    const violations = findProviderPhraseViolationsInFields(
      [
        { field: 'themes[0].recommendedActions[0]', text: 'Voyez avec votre prestataire web.' },
        {
          field: 'themes[1].recommendedActions[0]',
          text: 'Voyez avec votre prestataire technique.',
        },
      ],
      'fr',
    );
    expect(violations).toHaveLength(1);
  });

  it('catches a mix that spans a businessImpact and a recommendedAction', () => {
    const violations = findProviderPhraseViolationsInFields(
      [
        { field: 'themes[0].businessImpact', text: 'Votre prestataire web gère ce point.' },
        {
          field: 'themes[0].recommendedActions[0]',
          text: 'Demandez à votre prestataire technique de le corriger.',
        },
      ],
      'fr',
    );
    expect(violations).toHaveLength(1);
  });

  // The model emits a typographic apostrophe as readily as a straight one,
  // and typography normalization runs only after the guards.
  it('matches the apostrophe-bearing phrase in both its straight and typographic forms', () => {
    const straight = findProviderPhraseViolationsInFields(
      [
        { field: 'a', text: "Demandez à l'équipe technique en charge de votre site." },
        { field: 'b', text: 'Demandez à votre prestataire web.' },
      ],
      'fr',
    );
    const typographic = findProviderPhraseViolationsInFields(
      [
        { field: 'a', text: 'Demandez à l’équipe technique en charge de votre site.' },
        { field: 'b', text: 'Demandez à votre prestataire web.' },
      ],
      'fr',
    );
    expect(straight).toHaveLength(1);
    expect(typographic).toHaveLength(1);
  });

  it('matches a phrase capitalized at the start of a sentence', () => {
    const violations = findProviderPhraseViolationsInFields(
      [
        { field: 'a', text: 'Votre prestataire technique doit corriger ce point.' },
        { field: 'b', text: 'Votre prestataire web doit corriger cet autre point.' },
      ],
      'fr',
    );
    expect(violations).toHaveLength(1);
  });

  // Deliberate non-behaviour: silence about the provider is the prompt's
  // business, not this guard's. Asserted so a future edit that starts
  // rejecting it is a visible decision rather than a drive-by widening.
  it('accepts a response that never names the provider at all', () => {
    expect(findProviderPhraseViolations(output(), 'fr')).toEqual([]);
  });

  it('applies the same rule to English', () => {
    const violations = findProviderPhraseViolationsInFields(
      [
        { field: 'a', text: 'Ask your technical provider to fix this.' },
        { field: 'b', text: 'Ask your website provider to fix that.' },
      ],
      'en',
    );
    expect(violations).toHaveLength(1);
  });

  it('does not treat one language’s phrases as the other’s', () => {
    const violations = findProviderPhraseViolationsInFields(
      [
        { field: 'a', text: 'Ask your technical provider to fix this.' },
        { field: 'b', text: 'Demandez à votre prestataire web de corriger cela.' },
      ],
      'en',
    );
    expect(violations).toEqual([]);
  });

  it('reports one violation per offending field, not one per response', () => {
    const violations = findProviderPhraseViolationsInFields(
      [
        { field: 'a', text: 'Ask your technical provider to fix this.' },
        { field: 'b', text: 'Ask your website provider to fix that.' },
        { field: 'c', text: 'Ask your website provider to fix the other thing.' },
      ],
      'en',
    );
    expect(violations).toHaveLength(2);
    expect(violations.map((v) => v.field)).toEqual(['b', 'c']);
  });
});

describe('the approved phrase table', () => {
  it('offers more than one phrasing per language, which is the whole point', () => {
    expect(TECHNICAL_PROVIDER_PHRASES.fr.length).toBeGreaterThan(1);
    expect(TECHNICAL_PROVIDER_PHRASES.en.length).toBeGreaterThan(1);
  });

  // If one phrase contained another, the substring match would report a
  // spurious mix every time the longer one was used.
  it('has no phrase that contains another, in either language', () => {
    for (const language of ['fr', 'en'] as const) {
      const phrases = TECHNICAL_PROVIDER_PHRASES[language];
      for (const a of phrases) {
        for (const b of phrases) {
          if (a === b) continue;
          expect(a.includes(b)).toBe(false);
        }
      }
    }
  });
});

describe('the retry hint', () => {
  // The guard's first live run fixed the mixing and produced twenty-nine
  // identically-opening actions instead, because "be consistent" was the
  // last instruction the model read. The hint exists to stop that, so it
  // has to keep saying both halves.
  it('tells the model to keep varying sentence openings, not just the phrase', () => {
    expect(PROVIDER_PHRASE_RETRY_HINT).toMatch(/vary/i);
    expect(PROVIDER_PHRASE_RETRY_HINT).toMatch(/recommendedActions/);
  });
});
