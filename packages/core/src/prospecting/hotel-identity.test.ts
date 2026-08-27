import { describe, expect, it } from 'vitest';
import {
  normalizeEstablishmentName,
  resolveHotelIdentity,
  type HotelIdentityCandidateIndexEntry,
  type HotelIdentityObservation,
} from './hotel-identity.js';

const VALID_SIRET = '73282932000074';
const OTHER_SIRET = '55208131766522';
const VALID_SIREN = '732829320';

function observation(patch: Partial<HotelIdentityObservation> = {}): HotelIdentityObservation {
  return {
    name: 'Hôtel de la Poste',
    postcode: '38000',
    ...patch,
  };
}

/** Drops a key rather than setting it to undefined. Under
 *  exactOptionalPropertyTypes an absent field and a field holding undefined are
 *  different types, and absent is what a real source row produces. */
function without<T extends object>(value: T, key: keyof T): T {
  const copy = { ...value };
  delete copy[key];
  return copy;
}

function candidate(
  patch: Partial<HotelIdentityCandidateIndexEntry> = {},
): HotelIdentityCandidateIndexEntry {
  return {
    candidateId: 'c1',
    normalizedName: normalizeEstablishmentName('Hôtel de la Poste'),
    postcode: '38000',
    ...patch,
  };
}

describe('normalizeEstablishmentName', () => {
  it('folds case, accents, and punctuation into one comparable form', () => {
    expect(normalizeEstablishmentName('HÔTEL  "LA MAISON"')).toBe(
      normalizeEstablishmentName('hotel la maison'),
    );
  });

  it('does not strip words, so two hotels in one town stay distinct', () => {
    expect(normalizeEstablishmentName('Hôtel de la Poste')).not.toBe(
      normalizeEstablishmentName('Hôtel de la Gare'),
    );
  });

  it('returns an empty string for a nameless input rather than throwing', () => {
    expect(normalizeEstablishmentName('   ')).toBe('');
  });
});

describe('resolveHotelIdentity, exact automatic merges', () => {
  it('resolves on an exact valid SIRET', () => {
    const result = resolveHotelIdentity({
      observation: observation({ siret: VALID_SIRET }),
      candidates: [candidate({ siret: VALID_SIRET, normalizedName: 'something else entirely' })],
    });
    expect(result.status).toBe('resolved');
    expect(result.candidateId).toBe('c1');
    expect(result.matchedOn).toEqual({ kind: 'siret', value: VALID_SIRET });
  });

  it('resolves on a SIREN only when a second establishment fact agrees', () => {
    const result = resolveHotelIdentity({
      observation: observation({ siren: VALID_SIREN }),
      candidates: [candidate({ siren: VALID_SIREN, postcode: '38000' })],
    });
    expect(result.status).toBe('resolved');
    expect(result.matchedOn).toEqual({
      kind: 'siren-with-fact',
      value: VALID_SIREN,
      corroboratingFact: 'postcode',
    });
  });

  it('refuses a SIREN match with no corroborating fact', () => {
    // A company can own twelve hotels. SIREN alone names the company, never
    // the establishment, so merging on it would collapse a whole group.
    const result = resolveHotelIdentity({
      observation: observation({ siren: VALID_SIREN, postcode: '75001', name: 'Hôtel du Nord' }),
      candidates: [candidate({ siren: VALID_SIREN, postcode: '38000' })],
    });
    expect(result.status).toBe('needs-review');
  });

  it('resolves on exact own-domain agreement', () => {
    const result = resolveHotelIdentity({
      observation: observation({ ownRegistrableDomain: '1924hotel.com' }),
      candidates: [
        candidate({ ownRegistrableDomain: '1924hotel.com', normalizedName: 'unrelated name' }),
      ],
    });
    expect(result.status).toBe('resolved');
    expect(result.matchedOn).toEqual({ kind: 'own-domain', value: '1924hotel.com' });
  });

  it('prefers SIRET over own domain when both point at the same candidate', () => {
    const result = resolveHotelIdentity({
      observation: observation({ siret: VALID_SIRET, ownRegistrableDomain: '1924hotel.com' }),
      candidates: [candidate({ siret: VALID_SIRET, ownRegistrableDomain: '1924hotel.com' })],
    });
    expect(result.matchedOn?.kind).toBe('siret');
  });
});

describe('resolveHotelIdentity, evidence that must never merge', () => {
  it('rejects a malformed SIRET rather than matching on its digits', () => {
    const result = resolveHotelIdentity({
      observation: observation({ siret: '73282932000075' }),
      candidates: [candidate({ siret: '73282932000075' })],
    });
    expect(result.status).toBe('needs-review');
    expect(result.matchedOn).toBeUndefined();
  });

  it('rejects a malformed SIREN', () => {
    const result = resolveHotelIdentity({
      observation: observation({ siren: '732829321' }),
      candidates: [candidate({ siren: '732829321' })],
    });
    expect(result.status).not.toBe('resolved');
  });

  it('is ambiguous when two candidates match the same exact key', () => {
    const result = resolveHotelIdentity({
      observation: observation({ ownRegistrableDomain: 'shared.fr' }),
      candidates: [
        candidate({ candidateId: 'c1', ownRegistrableDomain: 'shared.fr' }),
        candidate({ candidateId: 'c2', ownRegistrableDomain: 'shared.fr' }),
      ],
    });
    expect(result.status).toBe('ambiguous');
    expect(result.candidateIds).toEqual(['c1', 'c2']);
    expect(result.conflicts.map((c) => c.kind)).toContain('multiple-exact-matches');
  });

  it('is ambiguous when SIRET and own domain point at different candidates', () => {
    // Conflicting exact keys are a data problem to look at, not a tie to break.
    const result = resolveHotelIdentity({
      observation: observation({ siret: VALID_SIRET, ownRegistrableDomain: 'other.fr' }),
      candidates: [
        candidate({ candidateId: 'c1', siret: VALID_SIRET }),
        candidate({ candidateId: 'c2', ownRegistrableDomain: 'other.fr' }),
      ],
    });
    expect(result.status).toBe('ambiguous');
    expect(result.candidateIds.sort()).toEqual(['c1', 'c2']);
    expect(result.conflicts.map((c) => c.kind)).toContain('multiple-exact-matches');
  });

  it('records a disagreement when one candidate carries a different SIRET', () => {
    const result = resolveHotelIdentity({
      observation: observation({ siret: VALID_SIRET, ownRegistrableDomain: 'shared.fr' }),
      candidates: [candidate({ siret: OTHER_SIRET, ownRegistrableDomain: 'shared.fr' })],
    });
    expect(result.conflicts.map((c) => c.kind)).toContain('siret-disagreement');
    expect(result.status).toBe('ambiguous');
  });
});

describe('resolveHotelIdentity, name and postcode', () => {
  it('creates a review link but never selects on name plus postcode', () => {
    const result = resolveHotelIdentity({
      observation: observation(),
      candidates: [candidate({ candidateId: 'c9' })],
    });
    expect(result.status).toBe('needs-review');
    expect(result.candidateId).toBeUndefined();
    expect(result.candidateIds).toEqual(['c9']);
  });

  it('does not link two hotels sharing a name in different postcodes', () => {
    const result = resolveHotelIdentity({
      observation: observation({ postcode: '75001' }),
      candidates: [candidate({ postcode: '38000' })],
    });
    expect(result.status).toBe('unmatched');
    expect(result.candidateIds).toEqual([]);
  });

  it('does not link on a name alone when the observation has no postcode', () => {
    const result = resolveHotelIdentity({
      observation: without(observation(), 'postcode'),
      candidates: [candidate()],
    });
    expect(result.status).toBe('unmatched');
  });
});

describe('resolveHotelIdentity, empty and ordering', () => {
  it('is unmatched against an empty index, which is every first observation', () => {
    expect(resolveHotelIdentity({ observation: observation(), candidates: [] }).status).toBe(
      'unmatched',
    );
  });

  it('returns candidate ids in a stable order regardless of input order', () => {
    const forwards = resolveHotelIdentity({
      observation: observation({ ownRegistrableDomain: 'shared.fr' }),
      candidates: [
        candidate({ candidateId: 'c2', ownRegistrableDomain: 'shared.fr' }),
        candidate({ candidateId: 'c1', ownRegistrableDomain: 'shared.fr' }),
      ],
    });
    const backwards = resolveHotelIdentity({
      observation: observation({ ownRegistrableDomain: 'shared.fr' }),
      candidates: [
        candidate({ candidateId: 'c1', ownRegistrableDomain: 'shared.fr' }),
        candidate({ candidateId: 'c2', ownRegistrableDomain: 'shared.fr' }),
      ],
    });
    expect(forwards.candidateIds).toEqual(backwards.candidateIds);
    expect(forwards.candidateIds).toEqual(['c1', 'c2']);
  });
});
