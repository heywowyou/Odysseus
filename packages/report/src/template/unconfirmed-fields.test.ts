import { describe, expect, it } from 'vitest';
import type { AuditManualFields } from '@odysseus/core';
import { findUnconfirmedIdentityFields } from './unconfirmed-fields.js';

/**
 * D8 (2026-08-25, Lagnonu review). A real report's cover read "Lagnonu -
 * Coti-Chiavari" for a business called Domaine Lagnonu; an earlier one read
 * "Mariages et evenements prives", a page topic rather than a company. Both
 * were `provenance: 'detected'` prefills the operator had not confirmed.
 */
function fields(partial: Partial<AuditManualFields>): AuditManualFields {
  return { updatedAt: new Date('2026-08-25T00:00:00Z'), ...partial } as AuditManualFields;
}

describe('D8: a detected client name never reaches a cover unconfirmed', () => {
  it('flags a detected trading name', () => {
    const found = findUnconfirmedIdentityFields(
      fields({ nomCommercial: { value: 'Lagnonu - Coti-Chiavari', provenance: 'detected' } }),
    );

    expect(found).toEqual([{ field: 'nomCommercial', value: 'Lagnonu - Coti-Chiavari' }]);
  });

  it('accepts the same name once the operator has confirmed it', () => {
    const found = findUnconfirmedIdentityFields(
      fields({ nomCommercial: { value: 'Domaine Lagnonu', provenance: 'operator' } }),
    );

    expect(found).toEqual([]);
  });

  it('flags a detected legal name too, since the cover prints it', () => {
    const found = findUnconfirmedIdentityFields(
      fields({ raisonSociale: { value: 'SAS EXAMPLE', provenance: 'detected' } }),
    );

    expect(found.map((f) => f.field)).toEqual(['raisonSociale']);
  });

  /** An absent field is not a guess: the cover falls back to fixed copy. */
  it('does not block when no name was detected at all', () => {
    expect(findUnconfirmedIdentityFields(fields({}))).toEqual([]);
    expect(findUnconfirmedIdentityFields(undefined)).toEqual([]);
  });

  /** Blocking on every detected field would train the operator to bypass
   *  this. Only what the client reads as their own identity blocks. */
  it('ignores detected fields the client does not read as their identity', () => {
    const found = findUnconfirmedIdentityFields(
      fields({
        siren: { value: '123456789', provenance: 'detected' },
        sector: { value: 'hospitality', provenance: 'detected' },
      }),
    );

    expect(found).toEqual([]);
  });
});
