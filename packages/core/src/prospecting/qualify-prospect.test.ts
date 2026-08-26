import { describe, expect, it } from 'vitest';
import { qualifyProspect } from './qualify-prospect.js';
import type {
  ContactAddress,
  ProspectQualificationInput,
  SireneIndexEntry,
} from '../types/prospecting.js';

const sireneMatch: SireneIndexEntry = {
  siren: '732829320',
  denomination: 'Example SAS',
  naf: '47.91A',
  effectifBand: { code: '12', label: '20 à 49 salariés' },
  etatAdministratif: 'A',
};

const contactAddress: ContactAddress = {
  value: 'contact@example.fr',
  localPart: 'contact',
  domain: 'example.fr',
};

function input(overrides: Partial<ProspectQualificationInput> = {}): ProspectQualificationInput {
  return {
    sireneMatch,
    siren: '732829320',
    domainSuppressed: false,
    contactAddress,
    ...overrides,
  };
}

describe('qualifyProspect', () => {
  it('qualifies when every condition holds', () => {
    const result = qualifyProspect(input());
    expect(result).toEqual({ qualified: true, reasons: [] });
  });

  it('fails on no SIREN extracted', () => {
    const result = qualifyProspect(input({ siren: null }));
    expect(result.qualified).toBe(false);
    expect(result.reasons).toContain('no-siren-extracted');
  });

  it('fails on the SIREN not being in the qualifying Sirene set', () => {
    const result = qualifyProspect(input({ sireneMatch: null }));
    expect(result.qualified).toBe(false);
    expect(result.reasons).toContain('siren-not-in-qualifying-sirene-set');
  });

  it('fails on a suppressed domain', () => {
    const result = qualifyProspect(input({ domainSuppressed: true }));
    expect(result.qualified).toBe(false);
    expect(result.reasons).toContain('domain-suppressed');
  });

  it('fails on no qualifying contact address', () => {
    const result = qualifyProspect(input({ contactAddress: null }));
    expect(result.qualified).toBe(false);
    expect(result.reasons).toContain('no-qualifying-contact-address');
  });

  it('accumulates every failing reason rather than short-circuiting', () => {
    const result = qualifyProspect({
      sireneMatch: null,
      siren: null,
      domainSuppressed: true,
      contactAddress: null,
    });
    expect(result.qualified).toBe(false);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'no-siren-extracted',
        'siren-not-in-qualifying-sirene-set',
        'domain-suppressed',
        'no-qualifying-contact-address',
      ]),
    );
    expect(result.reasons).toHaveLength(4);
  });

  it('covers every combination of the four boolean-shaped inputs', () => {
    for (let mask = 0; mask < 16; mask++) {
      const hasSiren = (mask & 1) !== 0;
      const hasSireneMatch = (mask & 2) !== 0;
      const suppressed = (mask & 4) !== 0;
      const hasContact = (mask & 8) !== 0;

      const result = qualifyProspect({
        siren: hasSiren ? '732829320' : null,
        sireneMatch: hasSireneMatch ? sireneMatch : null,
        domainSuppressed: suppressed,
        contactAddress: hasContact ? contactAddress : null,
      });

      const expectedQualified = hasSiren && hasSireneMatch && !suppressed && hasContact;
      expect(result.qualified).toBe(expectedQualified);
    }
  });
});
