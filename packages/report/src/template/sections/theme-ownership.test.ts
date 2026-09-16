import { describe, expect, it } from 'vitest';
import { getStrings } from '../strings/i18n.js';
import { renderOwnershipSentence } from './themes.js';

function counts(firstParty: number, thirdParty: number, verifyIntent: number) {
  return {
    'first-party-action': firstParty,
    'third-party-escalation': thirdParty,
    'verify-intent': verifyIntent,
  };
}

describe('priority card correction ownership sentence', () => {
  it('names only the non-empty groups, joined as a French list', () => {
    expect(renderOwnershipSentence(getStrings('fr'), 'fr', counts(3, 0, 2))).toBe(
      'Répartition des corrections : 3 à traiter directement et 2 à vérifier selon le contexte.',
    );
    expect(renderOwnershipSentence(getStrings('fr'), 'fr', counts(3, 1, 2))).toBe(
      'Répartition des corrections : 3 à traiter directement, 1 à transmettre à un tiers et 2 à vérifier selon le contexte.',
    );
  });

  it('states a single group as a plain sentence instead of a one-item breakdown', () => {
    expect(renderOwnershipSentence(getStrings('fr'), 'fr', counts(4, 0, 0))).toBe(
      'Les 4 corrections de ce chantier sont à traiter directement.',
    );
    expect(renderOwnershipSentence(getStrings('fr'), 'fr', counts(0, 1, 0))).toBe(
      'La correction de ce chantier est à transmettre à un tiers.',
    );
  });

  it('renders the same rules in English', () => {
    expect(renderOwnershipSentence(getStrings('en'), 'en', counts(2, 1, 0))).toBe(
      'Correction ownership: 2 to address directly and 1 to pass to a third party.',
    );
    expect(renderOwnershipSentence(getStrings('en'), 'en', counts(0, 0, 3))).toBe(
      'All 3 corrections in this workstream need verification in context.',
    );
  });

  it('renders nothing when no correction is classified', () => {
    expect(renderOwnershipSentence(getStrings('fr'), 'fr', counts(0, 0, 0))).toBeUndefined();
  });
});
