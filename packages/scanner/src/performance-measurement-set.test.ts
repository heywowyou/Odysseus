import { describe, expect, it } from 'vitest';
import {
  assessStability,
  buildOriginFieldDataRecord,
  buildPerformanceMeasurementSet,
  describePerformanceEvidence,
  fieldDataStateFromCruxResult,
  measurementForUrl,
  PROVISIONAL_STABILITY_TOLERANCES,
  repeatTriggersFromAssessment,
  runsOwedForPage,
  shouldRetryFieldDataAcquisition,
  unmeasuredFamilyMembers,
  type LabMetricSample,
  type LighthouseRunInput,
  type PerformanceMeasurementSetInput,
} from './performance-measurement-set.js';

const OBSERVED_AT = new Date('2026-09-18T09:00:00.000Z');

function measuredRun(runId: string, metrics: LabMetricSample): LighthouseRunInput {
  return {
    runId,
    observedAt: OBSERVED_AT,
    environmentFingerprintRef: 'sha256:env-baseline',
    outcome: { kind: 'measured', metrics },
  };
}

function failedRun(runId: string, reason: string): LighthouseRunInput {
  return {
    runId,
    observedAt: OBSERVED_AT,
    environmentFingerprintRef: 'sha256:env-baseline',
    outcome: { kind: 'failed', reason },
  };
}

function setOf(overrides: Partial<PerformanceMeasurementSetInput> = {}) {
  return buildPerformanceMeasurementSet({
    url: 'https://hotel-exemple.fr/',
    profile: 'desktop',
    pageClass: 'homepage',
    selectionReasons: ['homepage-url-present'],
    runs: [
      measuredRun('run-1', { lcp: 3000, performanceScore: 0.5 }),
      measuredRun('run-2', { lcp: 3100, performanceScore: 0.49 }),
      measuredRun('run-3', { lcp: 3050, performanceScore: 0.51 }),
    ],
    tolerances: PROVISIONAL_STABILITY_TOLERANCES,
    // Most tests here are about the classification rules rather than about the
    // uncalibrated-tolerance cap, so the helper claims calibration and the two
    // tests that exercise the cap opt back out.
    toleranceProvenance: 'calibrated',
    ...overrides,
  });
}

function acceptedValue(set: ReturnType<typeof setOf>, metric: string): number | undefined {
  return set.accepted.metrics.find((entry) => entry.metric === metric)?.value;
}

describe('keeping the whole run set', () => {
  it('records every run, including the ones that produced no numbers', () => {
    const set = setOf({
      runs: [
        measuredRun('run-1', { lcp: 3000 }),
        failedRun('run-2', 'lighthouse worker timed out'),
        measuredRun('run-3', { lcp: 3200 }),
      ],
    });

    // A set that dropped its failure would look like a clean two-run
    // measurement, and nothing would record that the page cost three attempts.
    expect(set.runs).toHaveLength(3);
    expect(set.runs.map((run) => run.runId)).toEqual(['run-1', 'run-2', 'run-3']);
    expect(set.runs[1]?.outcome).toEqual({
      kind: 'failed',
      reason: 'lighthouse worker timed out',
    });
  });

  it('names the runs behind each accepted value so the choice can be recomputed', () => {
    const set = setOf();
    const lcp = set.accepted.metrics.find((entry) => entry.metric === 'lcp');

    expect(lcp?.runIds).toEqual(['run-1', 'run-2', 'run-3']);
    expect(lcp?.spread).toMatchObject({ runCount: 3, min: 3000, max: 3100, range: 100 });
  });

  it('keeps the environment each run was taken under, since a spread may be ours', () => {
    const set = setOf({
      runs: [
        measuredRun('run-1', { lcp: 3000 }),
        {
          runId: 'run-2',
          observedAt: OBSERVED_AT,
          environmentFingerprintRef: 'sha256:env-under-load',
          outcome: { kind: 'measured', metrics: { lcp: 9000 } },
        },
        measuredRun('run-3', { lcp: 3100 }),
      ],
    });

    expect(set.runs.map((run) => run.environmentFingerprintRef)).toEqual([
      'sha256:env-baseline',
      'sha256:env-under-load',
      'sha256:env-baseline',
    ]);
  });
});

describe('choosing the representative value', () => {
  it('does not adopt an unusually fast run that would flatter the site', () => {
    // The exact failure section 12 forbids: three runs where one is far
    // better than the others, and the temptation is to report the good one.
    const set = setOf({
      runs: [
        measuredRun('run-1', { lcp: 4200 }),
        measuredRun('run-2', { lcp: 900 }),
        measuredRun('run-3', { lcp: 4400 }),
      ],
    });

    expect(acceptedValue(set, 'lcp')).toBe(4200);
    expect(acceptedValue(set, 'lcp')).not.toBe(900);
  });

  it('does not adopt the best score either, where better means higher', () => {
    const set = setOf({
      runs: [
        measuredRun('run-1', { performanceScore: 0.34 }),
        measuredRun('run-2', { performanceScore: 0.92 }),
        measuredRun('run-3', { performanceScore: 0.31 }),
      ],
    });

    expect(acceptedValue(set, 'performanceScore')).toBe(0.34);
  });

  it('breaks an even-sized set towards the worse of the two middle values', () => {
    // Reporting the mean would quote a number no run measured; reporting the
    // faster middle would let a two-run repeat improve the page for free.
    const set = setOf({
      pageClass: 'selected',
      repeatTriggers: ['threshold-near'],
      runs: [measuredRun('run-1', { lcp: 2000 }), measuredRun('run-2', { lcp: 4000 })],
    });

    expect(acceptedValue(set, 'lcp')).toBe(4000);
  });

  it('ignores failed runs when computing the median rather than scoring them as zero', () => {
    const set = setOf({
      runs: [
        measuredRun('run-1', { lcp: 3000 }),
        failedRun('run-2', 'browser crashed'),
        measuredRun('run-3', { lcp: 3400 }),
        measuredRun('run-4', { lcp: 3200 }),
      ],
    });

    expect(acceptedValue(set, 'lcp')).toBe(3200);
  });
});

describe('how many runs a page is owed', () => {
  it('gives the homepage three isolated runs by default', () => {
    const allowance = runsOwedForPage({ pageClass: 'homepage', measuredRunCount: 0 });

    expect(allowance.runsOwed).toBe(3);
    expect(allowance.runsOutstanding).toBe(3);
    expect(allowance.reasons).toEqual(['baseline-three-run-homepage']);
  });

  it('gives transactional pages and operator seeds the same three runs', () => {
    expect(runsOwedForPage({ pageClass: 'transactional', measuredRunCount: 0 }).runsOwed).toBe(3);
    expect(runsOwedForPage({ pageClass: 'operator-seed', measuredRunCount: 0 }).runsOwed).toBe(3);
  });

  it('gives an ordinary selected page one run when nothing asks for a repeat', () => {
    const allowance = runsOwedForPage({ pageClass: 'selected', measuredRunCount: 1 });

    expect(allowance.runsOwed).toBe(1);
    expect(allowance.runsOutstanding).toBe(0);
    expect(allowance.reasons).toEqual(['baseline-primary-run']);
  });

  it('owes a selected page a repeat once a result is severe or threshold-near', () => {
    const allowance = runsOwedForPage({
      pageClass: 'selected',
      measuredRunCount: 1,
      repeatTriggers: ['severe', 'threshold-near'],
    });

    expect(allowance.runsOwed).toBe(2);
    expect(allowance.runsOutstanding).toBe(1);
    expect(allowance.reasons).toEqual([
      'baseline-primary-run',
      'repeat-severe',
      'repeat-threshold-near',
    ]);
  });

  it('records a trigger on a three-run page without inflating its run count', () => {
    // Section 13 answers a homepage whose three runs disagree with an
    // unstable result, not with a fourth run to break the tie.
    const allowance = runsOwedForPage({
      pageClass: 'homepage',
      measuredRunCount: 3,
      repeatTriggers: ['contradictory'],
    });

    expect(allowance.runsOwed).toBe(3);
    expect(allowance.reasons).toContain('repeat-contradictory');
  });

  it('re-owes a run that failed, so a crash never shrinks the evidence', () => {
    const set = setOf({
      runs: [
        measuredRun('run-1', { lcp: 3000 }),
        failedRun('run-2', 'browser crashed'),
        measuredRun('run-3', { lcp: 3100 }),
      ],
    });

    expect(set.allowance.measuredRunCount).toBe(2);
    expect(set.allowance.runsOutstanding).toBe(1);
  });
});

describe('confidence in a set', () => {
  const stableRuns = [
    measuredRun('run-1', { lcp: 3000 }),
    measuredRun('run-2', { lcp: 3050 }),
    measuredRun('run-3', { lcp: 3100 }),
  ];

  it('calls closely agreeing runs stable and lets a report quote them', () => {
    const set = setOf({ runs: stableRuns });

    expect(set.confidence.confidence).toBe('stable');
    expect(set.confidence.reasons).toContain('all-metrics-within-tolerance');
    expect(set.accepted.clientFacingUse).toBe('quotable');
  });

  it('never calls a single run stable, whatever that run says', () => {
    // Binding decision 11: one run has no observable spread, so stability is
    // not something it can demonstrate.
    const set = setOf({
      pageClass: 'selected',
      runs: [measuredRun('run-1', { lcp: 3000 })],
    });

    expect(set.confidence.confidence).toBe('insufficient');
    expect(set.confidence.reasons).toContain('single-measured-run');
    expect(set.accepted.clientFacingUse).toBe('not-quotable');
  });

  it('calls a wide spread noisy and requires a disclosure alongside it', () => {
    const set = setOf({
      runs: [
        measuredRun('run-1', { lcp: 3000 }),
        measuredRun('run-2', { lcp: 4200 }),
        measuredRun('run-3', { lcp: 3400 }),
      ],
    });

    expect(set.confidence.confidence).toBe('noisy');
    expect(set.confidence.unstableMetrics).toEqual(['lcp']);
    expect(set.accepted.clientFacingUse).toBe('quotable-with-disclosure');
  });

  it('flags runs that disagree far past tolerance as materially contradictory', () => {
    const set = setOf({
      runs: [
        measuredRun('run-1', { lcp: 1200 }),
        measuredRun('run-2', { lcp: 9000 }),
        measuredRun('run-3', { lcp: 2000 }),
      ],
    });

    expect(set.confidence.contradictoryMetrics).toEqual(['lcp']);
    expect(repeatTriggersFromAssessment(set.confidence)).toEqual([
      'environment-unstable',
      'contradictory',
    ]);
  });

  it('refuses to trust a set taken while the host calibration degraded', () => {
    const set = setOf({ runs: stableRuns, calibration: { drift: 'degraded' } });

    expect(set.confidence.confidence).toBe('insufficient');
    expect(set.confidence.reasons).toContain('host-calibration-degraded');
  });

  it('treats an absent calibration as unknown rather than as a defect', () => {
    // Phase C ships the measurement sets before the calibration harness. An
    // unknown drift must not make every set in that window unquotable.
    expect(setOf({ runs: stableRuns }).calibration.drift).toBe('unknown');
    expect(setOf({ runs: stableRuns }).confidence.confidence).toBe('stable');
  });

  it('refuses to call a set stable when the tolerances it passed were guesses', () => {
    // Every metric sits well inside PROVISIONAL_STABILITY_TOLERANCES, so the
    // only thing standing between this set and a quotable "stable" is that
    // nobody has measured what this host's real spread is yet.
    const set = setOf({ runs: stableRuns, toleranceProvenance: 'provisional' });

    expect(set.confidence.confidence).toBe('noisy');
    expect(set.confidence.reasons).toContain('tolerances-uncalibrated');
    expect(set.confidence.unstableMetrics).toEqual([]);
    expect(set.accepted.clientFacingUse).toBe('quotable-with-disclosure');
  });

  it('assumes tolerances are uncalibrated unless a caller says otherwise', () => {
    // Fail-closed: claiming calibration has to be a deliberate act, so that a
    // new call site cannot inherit a verified-looking verdict by omission.
    const assessment = assessStability({
      runs: setOf({ runs: stableRuns }).runs,
      allowance: runsOwedForPage({ pageClass: 'homepage', measuredRunCount: 3 }),
      calibration: { drift: 'unknown' },
      tolerances: PROVISIONAL_STABILITY_TOLERANCES,
    });

    expect(assessment.reasons).toContain('tolerances-uncalibrated');
    expect(assessment.confidence).toBe('noisy');
  });

  it('downgrades a set still owing runs even when what it has agrees', () => {
    const set = setOf({
      runs: [measuredRun('run-1', { lcp: 3000 }), measuredRun('run-2', { lcp: 3010 })],
    });

    expect(set.allowance.runsOutstanding).toBe(1);
    expect(set.confidence.confidence).toBe('insufficient');
    expect(set.confidence.reasons).toContain('runs-outstanding');
  });

  it('ignores a spread too small to perceive rather than calling the page noisy', () => {
    const set = setOf({
      runs: [
        measuredRun('run-1', { cls: 0.001 }),
        measuredRun('run-2', { cls: 0.004 }),
        measuredRun('run-3', { cls: 0.002 }),
      ],
    });

    // A 300% proportional swing between two perfect layout-shift scores is an
    // artefact of dividing by a near-zero number, not an unstable page.
    expect(set.confidence.confidence).toBe('stable');
  });

  it('applies the tolerance it is given rather than a built-in one', () => {
    const runs = [
      measuredRun('run-1', { lcp: 3000 }),
      measuredRun('run-2', { lcp: 3400 }),
      measuredRun('run-3', { lcp: 3200 }),
    ];
    const allowance = runsOwedForPage({ pageClass: 'homepage', measuredRunCount: 3 });
    const strictAssessment = assessStability({
      runs: setOf({ runs }).runs,
      allowance,
      calibration: { drift: 'unknown' },
      tolerances: {
        ...PROVISIONAL_STABILITY_TOLERANCES,
        lcp: { maxRelativeRange: 0.01, negligibleAbsoluteRange: 0 },
      },
      toleranceProvenance: 'calibrated',
    });

    expect(setOf({ runs }).confidence.confidence).toBe('stable');
    expect(strictAssessment.confidence).toBe('noisy');
  });
});

describe('lab and field evidence stay distinct', () => {
  it('labels every accepted Lighthouse value as lab, never as field data', () => {
    const view = describePerformanceEvidence(setOf());

    expect(view.lab.source).toBe('lighthouse-lab');
    expect(view.lab.metrics.every((entry) => entry.source === 'lighthouse-lab')).toBe(true);
    expect(view.field).toEqual({ source: 'none', reason: 'not-acquired' });
  });

  it('does not let a lab value surface under the field branch when CrUX has no data', () => {
    const record = buildOriginFieldDataRecord({
      scope: 'https://hotel-exemple.fr',
      granularity: 'origin',
      state: { kind: 'no-public-data' },
      observedAt: OBSERVED_AT,
    });

    const view = describePerformanceEvidence(setOf(), record);

    expect(view.field).toEqual({ source: 'none', reason: 'no-public-data' });
    expect(JSON.stringify(view.field)).not.toContain('3050');
  });

  it('reports real user data at the granularity CrUX actually answered at', () => {
    const record = buildOriginFieldDataRecord({
      scope: 'https://hotel-exemple.fr',
      granularity: 'origin',
      state: { kind: 'available', metrics: [{ metric: 'lcp', p75: 2800 }] },
      observedAt: OBSERVED_AT,
    });

    const view = describePerformanceEvidence(setOf(), record);

    expect(view.field).toEqual({
      source: 'crux-field',
      granularity: 'origin',
      scope: 'https://hotel-exemple.fr',
      metrics: [{ metric: 'lcp', p75: 2800 }],
    });
  });
});

describe('no public data is not a provider failure', () => {
  const noData = buildOriginFieldDataRecord({
    scope: 'https://hotel-exemple.fr',
    granularity: 'origin',
    state: { kind: 'no-public-data' },
    observedAt: OBSERVED_AT,
  });

  const providerFailure = buildOriginFieldDataRecord({
    scope: 'https://hotel-exemple.fr',
    granularity: 'origin',
    state: {
      kind: 'provider-failure',
      attempts: [{ attemptedAt: OBSERVED_AT.toISOString(), error: 'ECONNRESET' }],
    },
    observedAt: OBSERVED_AT,
  });

  it('gives the two outcomes different states and different digests', () => {
    // Collapsing them would publish our own outage as a claim about the
    // client's real-user traffic.
    expect(noData.state.kind).not.toBe(providerFailure.state.kind);
    expect(noData.digest).not.toBe(providerFailure.digest);
  });

  it('retries a provider failure and never retries an absence of public data', () => {
    expect(shouldRetryFieldDataAcquisition(providerFailure)).toEqual({
      retry: true,
      reason: 'provider-failure-retryable',
    });
    expect(shouldRetryFieldDataAcquisition(noData)).toEqual({
      retry: false,
      reason: 'no-public-data-is-final',
    });
  });

  it('leaves an exhausted provider failure as a failure rather than as no data', () => {
    const exhausted = buildOriginFieldDataRecord({
      scope: 'https://hotel-exemple.fr',
      granularity: 'origin',
      state: {
        kind: 'provider-failure',
        attempts: [
          { attemptedAt: OBSERVED_AT.toISOString(), error: 'ECONNRESET' },
          { attemptedAt: OBSERVED_AT.toISOString(), error: 'ECONNRESET' },
          { attemptedAt: OBSERVED_AT.toISOString(), error: '429 rate limited' },
        ],
      },
      observedAt: OBSERVED_AT,
    });

    expect(shouldRetryFieldDataAcquisition(exhausted)).toEqual({
      retry: false,
      reason: 'provider-failure-attempts-exhausted',
    });
    expect(exhausted.state.kind).toBe('provider-failure');
  });

  it('separates the two outcomes the legacy manifest result merged', () => {
    expect(fieldDataStateFromCruxResult({ available: false }, OBSERVED_AT)).toEqual({
      kind: 'no-public-data',
    });
    expect(
      fieldDataStateFromCruxResult({ available: false, fetchError: 'ECONNRESET' }, OBSERVED_AT),
    ).toMatchObject({ kind: 'provider-failure' });
    expect(
      fieldDataStateFromCruxResult({ available: true, lcp: { p75: 2800 } }, OBSERVED_AT),
    ).toEqual({ kind: 'available', metrics: [{ metric: 'lcp', p75: 2800 }] });
  });
});

describe('a measurement measures only its own page', () => {
  const representative = setOf({
    url: 'https://hotel-exemple.fr/chambres/suite-junior',
    pageClass: 'selected',
    selectionReasons: ['template-family-representative'],
    runs: [measuredRun('run-1', { lcp: 5200 })],
  });

  const siblings = [
    'https://hotel-exemple.fr/chambres/chambre-double',
    'https://hotel-exemple.fr/chambres/chambre-familiale',
  ];

  it('yields no measurement for a sampled family member the run never touched', () => {
    // Binding decision 7. The sibling pages share a template, which supports
    // remediation advice and nothing else: their load times were never
    // observed and must not inherit the representative's.
    for (const sibling of siblings) {
      expect(measurementForUrl([representative], sibling, 'desktop')).toBeUndefined();
    }
  });

  it('lists the unmeasured siblings as coverage gaps rather than as values', () => {
    const gaps = unmeasuredFamilyMembers({
      familyMemberUrls: [representative.url, ...siblings],
      sets: [representative],
      profile: 'desktop',
    });

    expect(gaps).toEqual([
      { url: siblings[0], reason: 'no-performance-measurement-of-its-own' },
      { url: siblings[1], reason: 'no-performance-measurement-of-its-own' },
    ]);
    expect(JSON.stringify(gaps)).not.toContain('5200');
  });

  it('does not hand a desktop measurement to the same URL on mobile', () => {
    expect(measurementForUrl([representative], representative.url, 'mobile')).toBeUndefined();
    expect(measurementForUrl([representative], representative.url, 'desktop')).toBe(representative);
  });
});

describe('the digest', () => {
  it('is stable across two builds of the same evidence', () => {
    expect(setOf().digest).toBe(setOf().digest);
  });

  it('changes when a run is dropped, so a pruned set cannot pass as the original', () => {
    const full = setOf();
    const pruned = setOf({
      runs: [measuredRun('run-1', { lcp: 3000 }), measuredRun('run-2', { lcp: 3100 })],
    });

    expect(pruned.digest).not.toBe(full.digest);
  });

  it('changes when a run that produced identical numbers is renumbered', () => {
    const original = setOf();
    const relabelled = setOf({
      runs: [
        measuredRun('run-9', { lcp: 3000, performanceScore: 0.5 }),
        measuredRun('run-2', { lcp: 3100, performanceScore: 0.49 }),
        measuredRun('run-3', { lcp: 3050, performanceScore: 0.51 }),
      ],
    });

    expect(relabelled.digest).not.toBe(original.digest);
  });
});
