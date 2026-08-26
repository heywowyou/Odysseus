import { describe, expect, it } from 'vitest';
import {
  getSectorBenchmark,
  performanceBenchmarkSchema,
  REFERENCE_PERFORMANCE_BENCHMARKS,
} from './benchmarks.js';

describe('REFERENCE_PERFORMANCE_BENCHMARKS', () => {
  it('validates every row against the schema (source, sourceDate, scope required)', () => {
    for (const entry of REFERENCE_PERFORMANCE_BENCHMARKS) {
      expect(() => performanceBenchmarkSchema.parse(entry)).not.toThrow();
    }
  });

  it('rejects an entry missing source, sourceDate, or scope', () => {
    const base = {
      sector: 'general' as const,
      metric: 'placeholder',
      statistic: { value: 1, unit: 'percent' },
      applicability: { revenueBand: 'any', notes: '' },
    };
    expect(() =>
      performanceBenchmarkSchema.parse({
        ...base,
        sourceDate: '2024',
        scope: 'cross-sector-proxy',
      }),
    ).toThrow();
    expect(() =>
      performanceBenchmarkSchema.parse({ ...base, source: 'x', scope: 'cross-sector-proxy' }),
    ).toThrow();
    expect(() =>
      performanceBenchmarkSchema.parse({ ...base, source: 'x', sourceDate: '2024' }),
    ).toThrow();
  });

  it('marks only healthcare, hospitality, and professional-booking rows as sector-specific', () => {
    for (const entry of REFERENCE_PERFORMANCE_BENCHMARKS) {
      if (entry.scope === 'sector-specific') {
        expect(['healthcare', 'hospitality', 'professional-booking']).toContain(entry.sector);
      }
    }
  });

  it('never tags a general/cross-sector row as sector-specific', () => {
    for (const entry of REFERENCE_PERFORMANCE_BENCHMARKS) {
      if (entry.sector === 'general') {
        expect(entry.scope).toBe('cross-sector-proxy');
      }
    }
  });

  it('has no duplicate (sector, metric) pairs', () => {
    const keys = REFERENCE_PERFORMANCE_BENCHMARKS.map((entry) => `${entry.sector}|${entry.metric}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('getSectorBenchmark', () => {
  it('returns the matching entry for a real sector/metric pair', () => {
    const result = getSectorBenchmark(
      'hospitality',
      'booking-abandonment-after-poor-digital-experience',
    );
    expect(result?.statistic).toEqual({ value: 52, unit: 'percent' });
    expect(result?.scope).toBe('sector-specific');
  });

  it('returns null for a sector/metric pair with no data, never substituting another sector', () => {
    expect(getSectorBenchmark('healthcare', 'cart-abandonment-rate')).toBeNull();
    expect(
      getSectorBenchmark(
        'professional-booking',
        'appointment-no-show-rate-reduction-online-vs-phone-booking',
      ),
    ).toBeNull();
  });

  it('returns null for an unknown metric on a sector that does have other data', () => {
    expect(getSectorBenchmark('hospitality', 'nonexistent-metric')).toBeNull();
  });
});
