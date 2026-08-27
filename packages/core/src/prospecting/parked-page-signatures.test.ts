import { describe, it, expect } from 'vitest';
import {
  PARKED_PAGE_SIGNATURES,
  foldForSignatureMatch,
  matchParkedPageSignature,
} from './parked-page-signatures.js';

describe('matchParkedPageSignature', () => {
  it('matches a French registrar holding page', () => {
    expect(matchParkedPageSignature('Ce nom de domaine est enregistré chez OVH')).toBe(
      'OVH holding page',
    );
  });

  it('matches regardless of accents and case', () => {
    expect(matchParkedPageSignature('DOMAINE RESERVE')).not.toBeNull();
    expect(matchParkedPageSignature('Domaine réservé')).not.toBeNull();
  });

  it('returns the attribution so a false positive is diagnosable from stored data', () => {
    expect(matchParkedPageSignature('Welcome to nginx!')).toBe('unconfigured web server default');
  });

  it('does not match a real hotel homepage', () => {
    const homepage =
      'Hôtel des Voyageurs, 24 chambres au coeur de Lyon. Réservez en direct au meilleur tarif. ' +
      'Parking privé gratuit, petit déjeuner servi en salle, salle de séminaire.';
    expect(matchParkedPageSignature(homepage)).toBeNull();
  });

  it('does not match on the bare word parking, which is a hotel amenity', () => {
    // The single-word rule in the module doc comment, enforced.
    expect(matchParkedPageSignature('Parking sécurisé à 50 mètres')).toBeNull();
  });

  it('does not match a page merely describing a construction project', () => {
    expect(
      matchParkedPageSignature('Notre nouvelle aile ouvrira en 2027, les travaux avancent bien.'),
    ).toBeNull();
  });

  it('returns null for empty text', () => {
    expect(matchParkedPageSignature('')).toBeNull();
  });
});

describe('the signature table itself', () => {
  it('stores every phrase already folded, so matching compares like with like', () => {
    for (const signature of PARKED_PAGE_SIGNATURES) {
      expect(signature.phrase).toBe(foldForSignatureMatch(signature.phrase));
    }
  });

  it('contains no single-word phrase', () => {
    for (const signature of PARKED_PAGE_SIGNATURES) {
      expect(signature.phrase.trim().split(/\s+/).length).toBeGreaterThan(1);
    }
  });

  it('attributes every entry', () => {
    for (const signature of PARKED_PAGE_SIGNATURES) {
      expect(signature.attribution.length).toBeGreaterThan(0);
    }
  });
});
