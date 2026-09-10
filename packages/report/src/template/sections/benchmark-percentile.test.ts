import { describe, expect, it } from 'vitest';
import type { AuditManifest } from '@odysseus/core';
import { hasBenchmarkPercentile, renderBenchmarkPercentile } from './benchmark-percentile.js';
import { getStrings } from '../strings/i18n.js';

function buildManifest(benchmarkPercentile: AuditManifest['benchmarkPercentile']): AuditManifest {
  return {
    siteUrl: 'https://example.com/',
    pages: [],
    benchmarkPercentile,
  } as unknown as AuditManifest;
}

describe('hasBenchmarkPercentile', () => {
  it('is false when the manifest carries no benchmark comparison', () => {
    expect(hasBenchmarkPercentile(buildManifest(undefined))).toBe(false);
  });

  it('is true once a comparison exists, scored or too-small', () => {
    expect(
      hasBenchmarkPercentile(
        buildManifest({ kind: 'too-small', cohortSize: 5, minimumCohortSize: 20 }),
      ),
    ).toBe(true);
  });
});

describe('renderBenchmarkPercentile', () => {
  it('renders nothing when the manifest carries no benchmark comparison', () => {
    const html = renderBenchmarkPercentile(getStrings('en'), 15, 'en', buildManifest(undefined));
    expect(html).toBe('');
  });

  it('renders the too-small note without a percentile figure', () => {
    const html = renderBenchmarkPercentile(
      getStrings('en'),
      15,
      'en',
      buildManifest({ kind: 'too-small', cohortSize: 5, minimumCohortSize: 20 }),
    );
    expect(html).toContain('not yet include enough scored sites');
    expect(html).not.toContain('%');
  });

  it('renders the scored percentile, cohort size, and scan date range', () => {
    const html = renderBenchmarkPercentile(
      getStrings('en'),
      15,
      'en',
      buildManifest({
        kind: 'scored',
        siteId: 'client-site',
        score: 4,
        percentile: 62.5,
        cohortSize: 40,
        scanDateRange: { earliest: '2026-09-15', latest: '2026-09-16' },
      }),
    );
    expect(html).toContain('63% of the 40 sites');
    expect(html).toContain('2026-09-15');
    expect(html).toContain('2026-09-16');
    expect(html).not.toContain('client-site');
  });

  it('renders the French translation with a space before the percent sign', () => {
    const html = renderBenchmarkPercentile(
      getStrings('fr'),
      15,
      'fr',
      buildManifest({
        kind: 'scored',
        siteId: 'client-site',
        score: 0,
        percentile: 0,
        cohortSize: 20,
        scanDateRange: { earliest: '2026-09-15', latest: '2026-09-15' },
      }),
    );
    expect(html).toContain('0 % des 20 sites');
  });
});
