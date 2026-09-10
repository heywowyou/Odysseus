import { describe, expect, it } from 'vitest';
import {
  computeBenchmarkPercentiles,
  computeSiteBenchmarkPercentile,
  MINIMUM_BENCHMARK_COHORT_SIZE,
  type BenchmarkCohortSite,
} from './percentile.js';
import type { Finding, Severity } from '../types/findings.js';

function buildFinding(severity: Severity, overrides: Partial<Finding> = {}): Finding {
  return {
    findingId: `f-${Math.random()}`,
    auditId: 'a1',
    schemaVersion: 1,
    source: 'axe',
    ruleId: 'color-contrast',
    category: 'accessibility',
    severity,
    wcagCriteria: [],
    title: 't',
    description: 'd',
    pageUrls: ['https://example.com/'],
    occurrences: 1,
    elements: [],
    rawEvidence: {},
    dedupeKey: 'd1',
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    ...overrides,
  };
}

function buildSite(
  siteId: string,
  severities: Severity[],
  scanDate = '2026-09-15',
): BenchmarkCohortSite {
  return { siteId, findings: severities.map((severity) => buildFinding(severity)), scanDate };
}

/** Fills the cohort out to the minimum floor with identical clean sites so
 *  tests can focus on the handful of sites whose ranking is under test. */
function padToFloor(sites: BenchmarkCohortSite[]): BenchmarkCohortSite[] {
  const padded = [...sites];
  let index = 0;
  while (padded.length < MINIMUM_BENCHMARK_COHORT_SIZE) {
    padded.push(buildSite(`pad-${index}`, ['minor']));
    index += 1;
  }
  return padded;
}

describe('computeBenchmarkPercentiles', () => {
  it('reports too-small below the cohort floor, scoring nothing', () => {
    const cohort = [buildSite('a', []), buildSite('b', ['critical'])];
    const outcome = computeBenchmarkPercentiles(cohort);
    expect(outcome).toEqual({
      kind: 'too-small',
      cohortSize: 2,
      minimumCohortSize: MINIMUM_BENCHMARK_COHORT_SIZE,
    });
  });

  it('scores every site at exactly the floor size', () => {
    const cohort = padToFloor([]);
    const outcome = computeBenchmarkPercentiles(cohort);
    expect(outcome.kind).toBe('scored');
    if (outcome.kind !== 'scored') throw new Error('unreachable');
    expect(outcome.results).toHaveLength(MINIMUM_BENCHMARK_COHORT_SIZE);
  });

  it('gives the best site in the cohort a percentile of 0', () => {
    const cohort = padToFloor([
      buildSite('best', []),
      buildSite('worst', ['critical', 'critical']),
    ]);
    const outcome = computeBenchmarkPercentiles(cohort);
    if (outcome.kind !== 'scored') throw new Error('expected scored');
    const best = outcome.results.find((r) => r.siteId === 'best');
    expect(best?.score).toBe(0);
    expect(best?.percentile).toBe(0);
  });

  it('computes percentile as the share of the cohort with a strictly lower score', () => {
    // 18 clean pad sites (score 0) plus one site scoring 4 (one critical)
    // and one scoring higher still. Against 20 total, the score-4 site has
    // exactly the 18 clean sites strictly below it: 18/20 = 90.
    const cohort = padToFloor([
      buildSite('mid', ['critical']),
      buildSite('worst', ['critical', 'critical']),
    ]);
    const outcome = computeBenchmarkPercentiles(cohort);
    if (outcome.kind !== 'scored') throw new Error('expected scored');
    const mid = outcome.results.find((r) => r.siteId === 'mid');
    expect(mid?.score).toBe(4);
    expect(mid?.percentile).toBe(90);
  });

  it('breaks a tied score on critical count without splitting further ties', () => {
    // Two sites both score 4: one via a single critical finding, one via
    // four minor findings. The critical-count tiebreak makes the
    // all-minor site strictly better despite the equal score.
    const bySeverityCount = buildSite('by-minors', ['minor', 'minor', 'minor', 'minor']);
    const byCritical = buildSite('by-critical', ['critical']);
    const cohort = padToFloor([bySeverityCount, byCritical]);
    const outcome = computeBenchmarkPercentiles(cohort);
    if (outcome.kind !== 'scored') throw new Error('expected scored');
    const minors = outcome.results.find((r) => r.siteId === 'by-minors');
    const critical = outcome.results.find((r) => r.siteId === 'by-critical');
    expect(minors?.score).toBe(critical?.score);
    expect(minors!.percentile).toBeLessThan(critical!.percentile);
  });

  it('gives two genuinely identical sites the same percentile, no forced split', () => {
    const cohort = padToFloor([buildSite('twin-a', ['serious']), buildSite('twin-b', ['serious'])]);
    const outcome = computeBenchmarkPercentiles(cohort);
    if (outcome.kind !== 'scored') throw new Error('expected scored');
    const a = outcome.results.find((r) => r.siteId === 'twin-a');
    const b = outcome.results.find((r) => r.siteId === 'twin-b');
    expect(a?.percentile).toBe(b?.percentile);
  });

  it('reports the earliest and latest scan date across the cohort', () => {
    const cohort = padToFloor([
      buildSite('early', ['minor'], '2026-09-14'),
      buildSite('late', ['minor'], '2026-09-20'),
    ]);
    const outcome = computeBenchmarkPercentiles(cohort);
    if (outcome.kind !== 'scored') throw new Error('expected scored');
    const [first] = outcome.results;
    expect(first?.scanDateRange).toEqual({
      earliest: '2026-09-14',
      latest: '2026-09-20',
    });
  });
});

describe('computeSiteBenchmarkPercentile', () => {
  it('returns the too-small outcome unchanged below the floor', () => {
    const cohort = [buildSite('a', []), buildSite('b', ['critical'])];
    expect(computeSiteBenchmarkPercentile(cohort, 'a')).toEqual({
      kind: 'too-small',
      cohortSize: 2,
      minimumCohortSize: MINIMUM_BENCHMARK_COHORT_SIZE,
    });
  });

  it("returns only the named site's own scored outcome", () => {
    const cohort = padToFloor([buildSite('best', []), buildSite('worst', ['critical'])]);
    const outcome = computeSiteBenchmarkPercentile(cohort, 'best');
    expect(outcome).toMatchObject({ kind: 'scored', siteId: 'best', score: 0, percentile: 0 });
  });

  it('throws when the site is not a cohort member', () => {
    const cohort = padToFloor([]);
    expect(() => computeSiteBenchmarkPercentile(cohort, 'not-in-cohort')).toThrow(
      /not in the cohort/,
    );
  });
});
