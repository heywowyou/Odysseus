import { describe, expect, it } from 'vitest';
import {
  findProviderPhraseViolations,
  findProviderPhraseViolationsInFields,
  findProviderPlacementViolations,
  providerPlacementRetryHint,
  providerPhraseRetryHint,
  selectProviderPhrase,
  selectProviderPhraseIndex,
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

function withActions(actions: string[], extra: Partial<WritingPassOutput> = {}): WritingPassOutput {
  return output({
    themes: [
      {
        themeKey: 't1',
        title: 'Un thème',
        businessImpact: 'Un impact. Un deuxième. Un troisième.',
        recommendedActions: actions,
      },
    ],
    ...extra,
  } as Partial<WritingPassOutput>);
}

describe('provider phrase assignment', () => {
  it('resolves to the first approved phrase when no seed is given', () => {
    expect(selectProviderPhrase('fr')).toBe(TECHNICAL_PROVIDER_PHRASES.fr[0]);
    expect(selectProviderPhrase('en')).toBe(TECHNICAL_PROVIDER_PHRASES.en[0]);
  });

  it('is stable for the same seed', () => {
    const seed = 'cb8bad97-1cfb-4897-92bb-bef9d7266780';
    expect(selectProviderPhrase('fr', seed)).toBe(selectProviderPhrase('fr', seed));
  });

  // The FR and EN reports of one audit are the paid deliverable (trade-off
  // 44). Naming the provider differently between them would be the same
  // "two parties" defect the guard exists to prevent, one document apart.
  it('picks the same index in both languages for one audit', () => {
    for (const seed of ['audit-a', 'audit-b', 'audit-c', 'audit-d', 'audit-e']) {
      const fr = TECHNICAL_PROVIDER_PHRASES.fr.indexOf(selectProviderPhrase('fr', seed));
      const en = TECHNICAL_PROVIDER_PHRASES.en.indexOf(selectProviderPhrase('en', seed));
      expect(fr).toBe(en);
    }
  });

  it('always returns an approved phrase', () => {
    for (let i = 0; i < 200; i++) {
      expect(TECHNICAL_PROVIDER_PHRASES.fr).toContain(selectProviderPhrase('fr', `seed-${i}`));
    }
  });

  // Cross-report variety was lever A's whole purpose; a hash that collapsed
  // every audit onto one phrase would silently restore the defect plan 027
  // set out to remove.
  it('spreads different audits across every approved phrase', () => {
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) seen.add(selectProviderPhraseIndex(`audit-${i}`, 3));
    expect(seen.size).toBe(3);
  });

  it('keeps the index inside the phrase list', () => {
    for (let i = 0; i < 500; i++) {
      const index = selectProviderPhraseIndex(`x${i}`, 3);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(3);
    }
  });
});

describe('provider phrase guard', () => {
  it('accepts a response that uses the assigned phrase throughout', () => {
    const violations = findProviderPhraseViolations(
      withActions([
        'Demandez à votre prestataire technique de corriger ce point.',
        'Faites confirmer par votre prestataire technique que la correction est en ligne.',
      ]),
      'fr',
      'votre prestataire technique',
    );
    expect(violations).toEqual([]);
  });

  it('rejects an approved phrase that is not the assigned one', () => {
    const violations = findProviderPhraseViolations(
      withActions([
        'Demandez à votre prestataire technique de corriger ce point.',
        'Demandez à votre prestataire web de corriger cet autre point.',
      ]),
      'fr',
      'votre prestataire technique',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.matched).toContain('votre prestataire web');
    expect(violations[0]?.matched).toContain('votre prestataire technique');
  });

  // The defect that made the old first-wins anchor unsafe: `notes` is
  // scanned second, so one stray mention there used to condemn every
  // internally consistent action. The verdict must follow the assigned
  // phrase, not scan order.
  it('blames the stray field, not the consistent majority', () => {
    const violations = findProviderPhraseViolations(
      withActions(
        [
          'Demandez à votre prestataire web de corriger ce point.',
          'Faites vérifier par votre prestataire web que la correction tient.',
        ],
        { notes: 'Un point à confier à votre prestataire technique.' },
      ),
      'fr',
      'votre prestataire web',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.field).toBe('notes');
  });

  it('accepts a response that never names the provider', () => {
    expect(
      findProviderPhraseViolations(
        withActions(['Corrigez le contraste du bouton.']),
        'fr',
        'votre prestataire technique',
      ),
    ).toEqual([]);
  });

  it('matches the assigned phrase written with a typographic apostrophe', () => {
    const assigned = "l'équipe technique en charge de votre site";
    const violations = findProviderPhraseViolationsInFields(
      [{ field: 'notes', text: 'Confiez ce point à l’équipe technique en charge de votre site.' }],
      'fr',
      assigned,
    );
    expect(violations).toEqual([]);
  });

  it('applies the same rule in English', () => {
    const violations = findProviderPhraseViolations(
      withActions([
        'Have your website provider correct this.',
        'Have your technical provider confirm the fix.',
      ]),
      'en',
      'your website provider',
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]?.matched).toContain('your technical provider');
  });

  it('reports every field that uses a non-assigned phrase', () => {
    const violations = findProviderPhraseViolationsInFields(
      [
        { field: 'a', text: 'confiez ce point à votre prestataire web' },
        { field: 'b', text: 'confiez ce point à votre prestataire web' },
      ],
      'fr',
      'votre prestataire technique',
    );
    expect(violations.map((v) => v.field)).toEqual(['a', 'b']);
  });
});

describe('provider phrase retry hint', () => {
  it('names the assigned phrase so the retry knows what to use', () => {
    expect(providerPhraseRetryHint('votre prestataire web')).toContain('votre prestataire web');
  });

  // The measured regression the hint exists to prevent: told only to "be
  // consistent", the model made all 29 actions identical.
  it('still forbids making the sentences themselves uniform', () => {
    expect(providerPhraseRetryHint('votre prestataire web')).toMatch(/vary|uniform/i);
  });
});

// Issue #309: "..., et l'équipe technique en charge de votre site peut..."
// closed almost every action of two production reports.
describe('issue #309: provider placement', () => {
  const phrase = "l'équipe technique en charge de votre site";

  it('rejects the provider attached after a comma', () => {
    for (const action of [
      `Chaque page doit déclarer une adresse canonique cohérente, car ${phrase} évite ainsi les doublons.`,
      `Les boutons doivent être agrandis, et ${phrase} peut ajuster leur taille.`,
      `Les titres doivent suivre l'ordre du document, afin que ${phrase} rétablisse la structure.`,
    ]) {
      expect(
        findProviderPlacementViolations(withActions([action]), 'fr', phrase),
        action,
      ).toHaveLength(1);
    }
  });

  it('matches the attached phrase with a typographic apostrophe too', () => {
    const action = `Les boutons doivent être agrandis, et l’équipe technique en charge de votre site peut ajuster leur taille.`;
    expect(findProviderPlacementViolations(withActions([action]), 'fr', phrase)).toHaveLength(1);
  });

  it('rejects naming the provider in more than half of all actions', () => {
    const violations = findProviderPlacementViolations(
      withActions([
        `Faites vérifier par ${phrase} le libellé de chaque bouton.`,
        `Confiez à ${phrase} la correction des titres.`,
        'Les images doivent recevoir un texte de remplacement.',
      ]),
      'fr',
      phrase,
    );
    expect(violations).toHaveLength(1);
    expect(violations[0]!.matched).toContain('2 of 3 actions');
  });

  // Atlantic Hôtel EN, 2026-09-17: a per-theme cap of one exhausted every
  // retry on well-placed second mentions.
  it('accepts two well-placed mentions in one theme when most actions omit the provider', () => {
    expect(
      findProviderPlacementViolations(
        withActions([
          `Faites vérifier par ${phrase} le libellé de chaque bouton.`,
          `Confiez à ${phrase} la correction des titres.`,
          'Les images doivent recevoir un texte de remplacement.',
          'Sans cette correction, le formulaire reste inutilisable au clavier.',
        ]),
        'fr',
        phrase,
      ),
    ).toEqual([]);
  });

  it('accepts one mention per theme as the agent of the main clause', () => {
    expect(
      findProviderPlacementViolations(
        withActions([
          `Faites vérifier par ${phrase} le libellé de chaque bouton.`,
          'Les titres doivent suivre l’ordre du document.',
        ]),
        'fr',
        phrase,
      ),
    ).toEqual([]);
  });

  it('applies the same rule in English', () => {
    const en = 'your technical provider';
    expect(
      findProviderPlacementViolations(
        withActions([`The buttons need a visible label, and ${en} can add one.`]),
        'en',
        en,
      ),
    ).toHaveLength(1);
    expect(providerPlacementRetryHint(en)).toContain(`"${en}"`);
  });
});
