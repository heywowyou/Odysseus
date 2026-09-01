import { describe, expect, it } from 'vitest';
import { resolveEffectiveTurnover } from './turnover.js';

describe('resolveEffectiveTurnover', () => {
  const detected = {
    amountEur: 800_000,
    year: 2025,
    source: 'sirene-api' as const,
  };

  it('uses the detected official value by default', () => {
    expect(
      resolveEffectiveTurnover({
        detected,
        replacement: {
          kind: 'exact',
          amountEur: 600_000,
          year: 2025,
          source: 'client-stated',
        },
        useReplacement: false,
      }),
    ).toEqual({
      status: 'available',
      amountEur: 800_000,
      calculationAmountEur: 800_000,
      year: 2025,
      source: 'sirene-api',
      provenance: 'detected',
      inputKind: 'exact',
    });
  });

  it('uses an exact replacement only after the explicit choice', () => {
    expect(
      resolveEffectiveTurnover({
        detected,
        replacement: {
          kind: 'exact',
          amountEur: 600_000,
          year: 2024,
          source: 'client-stated',
        },
        useReplacement: true,
      }),
    ).toMatchObject({
      status: 'available',
      amountEur: 600_000,
      calculationAmountEur: 600_000,
      provenance: 'replacement',
      inputKind: 'exact',
    });
  });

  it('uses the lower bound of a replacement range for calculation', () => {
    expect(
      resolveEffectiveTurnover({
        replacement: {
          kind: 'range',
          lowerEur: 450_000,
          upperEur: 700_000,
          year: 2024,
          source: 'official-annual-accounts',
        },
        useReplacement: true,
      }),
    ).toEqual({
      status: 'available',
      amountEur: 450_000,
      calculationAmountEur: 450_000,
      rangeUpperEur: 700_000,
      year: 2024,
      source: 'official-annual-accounts',
      provenance: 'replacement',
      inputKind: 'range',
    });
  });

  it('returns a typed omission when no effective value exists', () => {
    expect(
      resolveEffectiveTurnover({
        replacement: {
          kind: 'exact',
          amountEur: 600_000,
          year: 2024,
          source: 'client-stated',
        },
        useReplacement: false,
      }),
    ).toEqual({ status: 'omitted', reason: 'missing-turnover' });
    expect(resolveEffectiveTurnover({ useReplacement: true })).toEqual({
      status: 'omitted',
      reason: 'missing-replacement',
    });
  });
});
