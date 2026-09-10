import { describe, expect, it } from 'vitest';
import { qualifyBenchmarkCandidate } from './qualify-benchmark-candidate.js';
import type { BenchmarkQualificationInput } from './qualify-benchmark-candidate.js';
import type { SireneIndexEntry } from '../types/prospecting.js';

const sireneMatch: SireneIndexEntry = {
  siren: '732829320',
  denomination: 'Example SAS',
  naf: '47.91A',
  effectifBand: { code: '12', label: '20 à 49 salariés' },
  etatAdministratif: 'A',
};

function input(overrides: Partial<BenchmarkQualificationInput> = {}): BenchmarkQualificationInput {
  return {
    sireneMatch,
    siren: '732829320',
    domainSuppressed: false,
    ...overrides,
  };
}

describe('qualifyBenchmarkCandidate', () => {
  it('qualifies when every condition holds', () => {
    const result = qualifyBenchmarkCandidate(input());
    expect(result).toEqual({ qualified: true, reasons: [] });
  });

  it('fails on no SIREN extracted', () => {
    const result = qualifyBenchmarkCandidate(input({ siren: null }));
    expect(result.qualified).toBe(false);
    expect(result.reasons).toEqual(['no-siren-extracted']);
  });

  it('fails on the SIREN not being in the qualifying Sirene set', () => {
    const result = qualifyBenchmarkCandidate(input({ sireneMatch: null }));
    expect(result.qualified).toBe(false);
    expect(result.reasons).toEqual(['siren-not-in-qualifying-sirene-set']);
  });

  it('fails on a suppressed domain', () => {
    const result = qualifyBenchmarkCandidate(input({ domainSuppressed: true }));
    expect(result.qualified).toBe(false);
    expect(result.reasons).toEqual(['domain-suppressed']);
  });

  it('accumulates every failing condition rather than short-circuiting', () => {
    const result = qualifyBenchmarkCandidate(
      input({ siren: null, sireneMatch: null, domainSuppressed: true }),
    );
    expect(result.qualified).toBe(false);
    expect(result.reasons).toEqual([
      'no-siren-extracted',
      'siren-not-in-qualifying-sirene-set',
      'domain-suppressed',
    ]);
  });
});
