import { describe, expect, it } from 'vitest';
import {
  gradingRepeatTriggers,
  labMetricsFromLighthouse,
  representativeRunId,
} from './performance-acquisition.js';
import {
  buildPerformanceMeasurementSet,
  PROVISIONAL_STABILITY_TOLERANCES,
  type LabMetricSample,
} from './performance-measurement-set.js';

function report(score: number | null, lcpMs: number) {
  return {
    categories: { performance: { score } },
    audits: {
      'largest-contentful-paint': { score: 0.5, numericValue: lcpMs, displayValue: '' },
      'cumulative-layout-shift': { score: 1, numericValue: 0.02, displayValue: '' },
    },
  };
}

function setOf(scores: readonly number[]) {
  return buildPerformanceMeasurementSet({
    url: 'https://hotel-exemple.fr/',
    profile: 'mobile',
    pageClass: 'homepage',
    selectionReasons: [],
    runs: scores.map((performanceScore, index) => ({
      runId: `lab-run-${index + 1}`,
      observedAt: new Date(0),
      environmentFingerprintRef: 'audit-environment',
      outcome: { kind: 'measured', metrics: { performanceScore } },
    })),
    tolerances: PROVISIONAL_STABILITY_TOLERANCES,
  });
}

describe('labMetricsFromLighthouse', () => {
  it('reads the score and the vitals the report carries, and nothing else', () => {
    expect(labMetricsFromLighthouse(report(0.72, 3100))).toEqual({
      performanceScore: 0.72,
      lcp: 3100,
      cls: 0.02,
    });
  });

  it('leaves out a score Lighthouse could not compute', () => {
    expect(labMetricsFromLighthouse(report(null, 3100))).not.toHaveProperty('performanceScore');
    expect(labMetricsFromLighthouse(undefined)).toEqual({});
  });
});

describe('gradingRepeatTriggers', () => {
  it.each<[string, LabMetricSample, string[]]>([
    ['a comfortable good result', { performanceScore: 0.97, lcp: 1500, cls: 0.01 }, []],
    ['a poor vital', { performanceScore: 0.8, lcp: 6000 }, ['severe']],
    ['a poor score', { performanceScore: 0.3 }, ['severe']],
    [
      'an LCP a whisker over the good line',
      { performanceScore: 0.8, lcp: 2600 },
      ['threshold-near'],
    ],
    ['a score on the good boundary', { performanceScore: 0.88 }, ['threshold-near']],
    [
      'a poor score near the poor boundary',
      { performanceScore: 0.47 },
      ['severe', 'threshold-near'],
    ],
  ])('%s', (_label, sample, expected) => {
    expect(gradingRepeatTriggers(sample)).toEqual(expected);
  });
});

describe('representativeRunId', () => {
  it('keeps the median run, not the best one', () => {
    expect(representativeRunId(setOf([0.9, 0.6, 0.75]))).toBe('lab-run-3');
  });

  it('breaks an even tie towards the worse run', () => {
    expect(representativeRunId(setOf([0.8, 0.6]))).toBe('lab-run-2');
  });

  it('has no representative without a measured run', () => {
    const failed = buildPerformanceMeasurementSet({
      url: 'https://hotel-exemple.fr/',
      profile: 'mobile',
      pageClass: 'selected',
      selectionReasons: [],
      runs: [
        {
          runId: 'lab-run-1',
          observedAt: new Date(0),
          environmentFingerprintRef: 'audit-environment',
          outcome: { kind: 'failed', reason: 'timeout' },
        },
      ],
      tolerances: PROVISIONAL_STABILITY_TOLERANCES,
    });
    expect(representativeRunId(failed)).toBeUndefined();
  });
});
