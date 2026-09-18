/**
 * The complete Lighthouse measurement record for one URL on one profile, and
 * the rules that decide what may be said about it (plan 059 sections 5.10 and
 * 12, binding decisions 7 and 11).
 *
 * The failure this module exists to prevent is a client-facing performance
 * sentence that rests on a run nobody could defend. Lighthouse on a shared
 * host is noisy: the same page measured three times can span several seconds
 * of LCP for reasons that belong to our machine, not to the audited site.
 * Given three such numbers there is a strong and entirely natural pull towards
 * the one that reads best - the fastest run, the one where the score crossed a
 * grade boundary, the one that agrees with what the report already says. Every
 * one of those is a decision about the audit's conclusion dressed up as a
 * decision about data quality, and once the other two runs are discarded there
 * is no longer any evidence that the choice was made at all.
 *
 * So the set keeps every run. Not the accepted one with the rest summarized
 * away: every run id, every raw value, every failure, in the order they were
 * taken, with the environment fingerprint each was taken under. The accepted
 * value is then derived from that set by a fixed rule - the median, never the
 * best - and carries the spread it was drawn from and the run ids it came
 * from, so a reader can reconstruct the choice without trusting it. Section 12
 * states the median rule and the prohibition on opportunistic best-run
 * selection as two separate requirements; they are two halves of the same
 * guard, because a median computed over a set someone has already pruned is
 * not a median of anything.
 *
 * Even-sized sets get the pessimistic of the two middle values rather than
 * their mean. Two reasons: the representative stays a number some run actually
 * measured, which matters when a report quotes it as "your homepage takes 4.2
 * seconds", and where the rule has to break a tie it breaks it away from
 * flattering the site. This is a judgement call and it is flagged below as
 * provisional.
 *
 * What the module deliberately does not provide is any way to move a
 * measurement off the page it was taken on. Decision 7 forbids sampled-result
 * propagation: a Lighthouse representative measures itself and nothing else,
 * however confidently we grouped it with forty sibling pages from the same
 * template. The only function here that looks at families,
 * `unmeasuredFamilyMembers`, returns the siblings that have no measurement so
 * the coverage ledger can record the gap. It cannot return a value for them,
 * because there is no parameter it could take that would let it invent one.
 *
 * Lab and field evidence are kept in separate records for the same structural
 * reason. Lighthouse produces a simulated load on our hardware; CrUX reports
 * what real Chrome users experienced. Calling the first one field data would
 * be a false claim about where the number came from, so there is no type here
 * in which a Lighthouse value can be labelled anything other than
 * `lighthouse-lab`, and no code path that copies one into a field-data view.
 *
 * Confidence classification takes its tolerances as a parameter. The defaults
 * exported here are provisional placeholders, not derived thresholds - see
 * PROVISIONAL_STABILITY_TOLERANCES - and a classification that used them is
 * capped at `noisy` however well the runs agreed. Agreement measured against an
 * invented threshold is a fact about the threshold, and letting it reach the
 * report as `stable` would reintroduce the indefensible sentence at one remove.
 * Phase F step 41's calibration is what lifts the cap.
 */

import { canonicalDigest, type CruxFieldDataResult } from '@odysseus/core';

export const PERFORMANCE_MEASUREMENT_SET_VERSION = 'performance-measurement-v1';
export const ORIGIN_FIELD_DATA_RECORD_VERSION = 'field-data-record-v1';

/**
 * The metrics this scanner actually reads out of a Lighthouse run: the
 * performance category score plus the five Core Web Vitals recorded in
 * `CoreWebVitals` (@odysseus/core, types/manifest.ts). INP is absent on
 * purpose and must stay absent - navigation-mode Lighthouse never produces an
 * INP audit, and TBT is not a rename of it.
 */
export const MEASURED_METRIC_KEYS = [
  'performanceScore',
  'lcp',
  'cls',
  'tbt',
  'fcp',
  'speedIndex',
] as const;

export type MeasuredMetricKey = (typeof MEASURED_METRIC_KEYS)[number];

/** One run's raw numbers, in Lighthouse's own units: milliseconds for the
 *  timing metrics, unitless for CLS, and 0-1 for the category score. A metric
 *  a run did not report is absent rather than zero; zero is a real LCP claim
 *  and must not be manufactured. */
export type LabMetricSample = Partial<Record<MeasuredMetricKey, number>>;

type MetricDirection = 'lower-is-better' | 'higher-is-better';

/** Which way is worse for the client. Used only to break the even-count tie
 *  pessimistically; the median itself is direction-agnostic. */
const METRIC_DIRECTION: Record<MeasuredMetricKey, MetricDirection> = {
  performanceScore: 'higher-is-better',
  lcp: 'lower-is-better',
  cls: 'lower-is-better',
  tbt: 'lower-is-better',
  fcp: 'lower-is-better',
  speedIndex: 'lower-is-better',
};

/**
 * Desktop and mobile are separate measurement sets for the same URL, never
 * merged: they are different loads of different resources under different
 * throttling, and section 5.5's `ScanSurface` will name the same distinction
 * once it lands. Kept as a local union until then rather than guessing at that
 * contract's spelling.
 */
export type MeasurementProfile = 'desktop' | 'mobile';

/**
 * Why a page is in the measurement plan at all, which determines its default
 * run count. `selected` covers everything the stage-2 planner picked as a
 * template-family or language representative.
 */
export type PerformancePageClass = 'homepage' | 'transactional' | 'operator-seed' | 'selected';

/** Section 12's four grounds for owing a selected page a repeat. Severity and
 *  threshold proximity are grading questions the caller owns - this module
 *  does not know where a grade boundary sits - while instability and
 *  contradiction are observable here and derivable from a finished set with
 *  `repeatTriggersFromAssessment`. */
export type RepeatTrigger = 'severe' | 'threshold-near' | 'environment-unstable' | 'contradictory';

export type RunAllowanceReason =
  | 'baseline-three-run-homepage'
  | 'baseline-three-run-transactional'
  | 'baseline-three-run-operator-seed'
  | 'baseline-primary-run'
  | 'repeat-severe'
  | 'repeat-threshold-near'
  | 'repeat-environment-unstable'
  | 'repeat-contradictory';

export interface RunAllowance {
  runsOwed: number;
  measuredRunCount: number;
  /** Never negative. A page that was measured more often than it was owed -
   *  a retry the recovery phase decided on, say - is not in deficit. */
  runsOutstanding: number;
  reasons: readonly RunAllowanceReason[];
}

export interface RunAllowanceInput {
  pageClass: PerformancePageClass;
  /** Runs that produced numbers. Failed runs are deliberately not counted, so
   *  a crashed Lighthouse re-owes its run rather than silently reducing the
   *  evidence behind the page. */
  measuredRunCount: number;
  repeatTriggers?: readonly RepeatTrigger[];
}

const THREE_RUN_CLASS_REASON: Record<
  Exclude<PerformancePageClass, 'selected'>,
  RunAllowanceReason
> = {
  homepage: 'baseline-three-run-homepage',
  transactional: 'baseline-three-run-transactional',
  'operator-seed': 'baseline-three-run-operator-seed',
};

const REPEAT_TRIGGER_REASON: Record<RepeatTrigger, RunAllowanceReason> = {
  severe: 'repeat-severe',
  'threshold-near': 'repeat-threshold-near',
  'environment-unstable': 'repeat-environment-unstable',
  contradictory: 'repeat-contradictory',
};

/**
 * How many isolated runs a page is owed, and why.
 *
 * Section 12 gives three runs by default to the homepage or start URL, to
 * transactional pages and to operator seeds, and a single primary run to
 * everything else, with a repeat when the result is severe, threshold-near,
 * environment-unstable or unexpectedly contradictory. A trigger raises a
 * one-run page to two; it does not push a three-run page to four, because
 * section 13 answers a homepage whose three runs disagree with
 * `unstable-result`, not with a fourth run to break the tie. The triggers are
 * still listed in `reasons` on those pages so the record says what was
 * observed rather than only what it changed.
 *
 * Every reason is reported, not just the decisive one, because the question
 * this record has to answer later is "why does this page have this much
 * evidence", and a single winning reason cannot answer it.
 */
export function runsOwedForPage(input: RunAllowanceInput): RunAllowance {
  const triggers = input.repeatTriggers ?? [];
  const reasons: RunAllowanceReason[] = [];
  let baseline: number;

  if (input.pageClass === 'selected') {
    baseline = 1;
    reasons.push('baseline-primary-run');
  } else {
    baseline = 3;
    reasons.push(THREE_RUN_CLASS_REASON[input.pageClass]);
  }

  for (const trigger of triggers) {
    const reason = REPEAT_TRIGGER_REASON[trigger];
    if (!reasons.includes(reason)) reasons.push(reason);
  }

  const runsOwed = Math.max(baseline, triggers.length > 0 ? 2 : 1);
  return {
    runsOwed,
    measuredRunCount: input.measuredRunCount,
    runsOutstanding: Math.max(0, runsOwed - input.measuredRunCount),
    reasons,
  };
}

export type RunOutcome =
  { kind: 'measured'; metrics: LabMetricSample } | { kind: 'failed'; reason: string };

export interface LighthouseRunInput {
  runId: string;
  observedAt: Date;
  /** Reference to the `AuditEnvironmentFingerprint` (section 5.17) this run
   *  was taken under. Kept per run, not per set: a long set can straddle a
   *  host-load change, and that is exactly the case where a spread needs
   *  explaining. */
  environmentFingerprintRef: string;
  outcome: RunOutcome;
}

export interface LighthouseRunRecord {
  runId: string;
  observedAt: string;
  environmentFingerprintRef: string;
  outcome: RunOutcome;
}

/** How far the host drifted between the controlled calibration runs taken
 *  before and after this measurement set (section 12). `unknown` is the
 *  honest state before the calibration harness exists and does not by itself
 *  downgrade a set; `degraded` does, because a host that moved materially
 *  under us was measuring itself as much as the site. */
export interface CalibrationReference {
  drift: 'within-tolerance' | 'degraded' | 'unknown';
  beforeRef?: string;
  afterRef?: string;
}

export interface MetricSpread {
  /** Runs that reported this particular metric, which can be fewer than the
   *  set's measured runs when Lighthouse dropped an audit. */
  runCount: number;
  min: number;
  max: number;
  range: number;
  /** `range / |representative|`, or null when the representative is zero and
   *  no proportion is defined. A null relative range never reads as stable. */
  relativeRange: number | null;
}

export interface MetricStabilityTolerance {
  /** The proportional spread a metric may show and still count as stable. */
  maxRelativeRange: number;
  /** Absolute spread below which the proportional test is not applied at all.
   *  Without this, a CLS of 0.001 against 0.004 reads as a 300% swing while
   *  both values are perfect, and a page would be called noisy for moving an
   *  amount no client could perceive. */
  negligibleAbsoluteRange: number;
}

export type StabilityTolerances = Record<MeasuredMetricKey, MetricStabilityTolerance>;

/**
 * Whether the tolerances a classification used were measured or guessed.
 *
 * Without this the module had a hole shaped exactly like the failure plan 059
 * exists to prevent. `PROVISIONAL_STABILITY_TOLERANCES` is a set of invented
 * numbers, and a `stable` verdict reached through them is a statement about
 * those numbers rather than about the site; but it was returned in the same
 * shape as a calibrated one, so a report could quote it as a verified fact.
 *
 * `provisional` is the default everywhere, so claiming calibration takes a
 * deliberate act. Nothing in the repository may pass `calibrated` until phase F
 * step 41 has actually run the corpus and replaced the constants with measured
 * spreads.
 */
export type ToleranceProvenance = 'provisional' | 'calibrated';

/**
 * PROVISIONAL. These numbers are placeholders chosen to make the module
 * testable, not tolerances derived from anything. Section 12 requires
 * performance tolerances to be established empirically from the evaluation
 * corpus, and plan 059 phase F step 41 is where that happens: run the
 * heterogeneous saved-audit corpus, observe the run-to-run spread this host
 * actually produces per metric, and replace every value below with the
 * measured one.
 *
 * Until that calibration runs, treat a `stable` classification produced with
 * these defaults as unverified. Callers that care should pass their own
 * tolerances rather than inheriting these, which is why every entry point
 * takes them as an explicit parameter.
 */
export const PROVISIONAL_STABILITY_TOLERANCES: StabilityTolerances = {
  performanceScore: { maxRelativeRange: 0.1, negligibleAbsoluteRange: 0.03 },
  lcp: { maxRelativeRange: 0.2, negligibleAbsoluteRange: 150 },
  cls: { maxRelativeRange: 0.5, negligibleAbsoluteRange: 0.02 },
  tbt: { maxRelativeRange: 0.4, negligibleAbsoluteRange: 50 },
  fcp: { maxRelativeRange: 0.2, negligibleAbsoluteRange: 100 },
  speedIndex: { maxRelativeRange: 0.2, negligibleAbsoluteRange: 150 },
};

/**
 * PROVISIONAL. The multiple of a metric's tolerance past which its runs are
 * treated as materially contradictory rather than merely noisy - section 12's
 * "unexpectedly contradictory" and section 13's `unstable-result`. Guessed
 * like the tolerances above and replaced by the same phase F calibration.
 */
export const PROVISIONAL_CONTRADICTION_MULTIPLE = 3;

export type PerformanceConfidence = 'stable' | 'noisy' | 'insufficient';

export type ConfidenceReason =
  | 'no-measured-run'
  | 'single-measured-run'
  | 'runs-outstanding'
  | 'host-calibration-degraded'
  | 'tolerances-uncalibrated'
  | 'metric-single-sample'
  | 'metric-spread-exceeds-tolerance'
  | 'materially-contradictory-runs'
  | 'all-metrics-within-tolerance';

export interface ConfidenceAssessment {
  confidence: PerformanceConfidence;
  reasons: readonly ConfidenceReason[];
  unstableMetrics: readonly MeasuredMetricKey[];
  contradictoryMetrics: readonly MeasuredMetricKey[];
}

/** What a report may do with the accepted numbers. Binding decision 11: an
 *  important client-facing lab conclusion does not rest on one unexplained
 *  noisy run, so an `insufficient` set is not quotable at all and a `noisy`
 *  one is quotable only alongside its disclosure. */
export type ClientFacingUse = 'quotable' | 'quotable-with-disclosure' | 'not-quotable';

const CLIENT_FACING_USE: Record<PerformanceConfidence, ClientFacingUse> = {
  stable: 'quotable',
  noisy: 'quotable-with-disclosure',
  insufficient: 'not-quotable',
};

export interface AcceptedMetricValue {
  metric: MeasuredMetricKey;
  /** The representative statistic - the median of every run that reported
   *  this metric. Never the best, never the fastest, never the one that
   *  agrees with the rest of the report. */
  value: number;
  /** Fixed. There is no constructor for an accepted lab value that labels it
   *  anything else, which is what keeps a Lighthouse number from ever being
   *  presented as CrUX or field data. */
  source: 'lighthouse-lab';
  /** Every run that contributed a sample, in the order they were taken, so
   *  the representative can be recomputed from the record. */
  runIds: readonly string[];
  spread: MetricSpread;
}

export interface AcceptedPerformanceValues {
  source: 'lighthouse-lab';
  metrics: readonly AcceptedMetricValue[];
  clientFacingUse: ClientFacingUse;
}

export interface PerformanceMeasurementSetInput {
  url: string;
  profile: MeasurementProfile;
  pageClass: PerformancePageClass;
  /** Why this URL is measured - the planner's reason codes, carried verbatim
   *  so the set explains its own presence without a join back to the plan. */
  selectionReasons: readonly string[];
  runs: readonly LighthouseRunInput[];
  repeatTriggers?: readonly RepeatTrigger[];
  calibration?: CalibrationReference;
  tolerances: StabilityTolerances;
  /** Whether those tolerances were measured. Defaults to `provisional`, which
   *  caps the set at `noisy`: agreement judged against invented thresholds is
   *  not a verified measurement. */
  toleranceProvenance?: ToleranceProvenance;
  contradictionMultiple?: number;
}

export interface PerformanceMeasurementSet {
  version: typeof PERFORMANCE_MEASUREMENT_SET_VERSION;
  url: string;
  profile: MeasurementProfile;
  pageClass: PerformancePageClass;
  selectionReasons: readonly string[];
  /** All of them, measured and failed alike. Section 5.10 is explicit that
   *  the chosen run is not enough; the rejected and failed ones are the only
   *  proof that no cherry-picking took place. */
  runs: readonly LighthouseRunRecord[];
  allowance: RunAllowance;
  calibration: CalibrationReference;
  confidence: ConfidenceAssessment;
  accepted: AcceptedPerformanceValues;
  digest: string;
}

function valueAt(sorted: readonly number[], index: number): number {
  const value = sorted[index];
  if (value === undefined) {
    throw new Error(`performance-measurement-set: no value at index ${index}`);
  }
  return value;
}

/**
 * The median, with even-sized sets resolved to the worse of the two middle
 * values rather than to their mean. See the module comment: the representative
 * stays a value some run actually produced, and the tie breaks away from
 * flattering the site. Provisional in the same sense as the tolerances - phase
 * F may find that the mean is better behaved on the real corpus.
 */
function representativeValue(values: readonly number[], direction: MetricDirection): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return valueAt(sorted, middle);
  const lower = valueAt(sorted, middle - 1);
  const upper = valueAt(sorted, middle);
  return direction === 'lower-is-better' ? upper : lower;
}

function spreadOf(values: readonly number[], representative: number): MetricSpread {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return {
    runCount: values.length,
    min,
    max,
    range,
    relativeRange: representative === 0 ? null : range / Math.abs(representative),
  };
}

function isWithinTolerance(spread: MetricSpread, tolerance: MetricStabilityTolerance): boolean {
  if (spread.range <= tolerance.negligibleAbsoluteRange) return true;
  if (spread.relativeRange === null) return false;
  return spread.relativeRange <= tolerance.maxRelativeRange;
}

function isContradictory(
  spread: MetricSpread,
  tolerance: MetricStabilityTolerance,
  multiple: number,
): boolean {
  if (spread.range <= tolerance.negligibleAbsoluteRange) return false;
  if (spread.relativeRange === null) return true;
  return spread.relativeRange > tolerance.maxRelativeRange * multiple;
}

interface MetricSamples {
  values: readonly number[];
  runIds: readonly string[];
}

function collectSamples(
  runs: readonly LighthouseRunRecord[],
  metric: MeasuredMetricKey,
): MetricSamples {
  const values: number[] = [];
  const runIds: string[] = [];
  for (const run of runs) {
    if (run.outcome.kind !== 'measured') continue;
    const value = run.outcome.metrics[metric];
    if (value === undefined) continue;
    values.push(value);
    runIds.push(run.runId);
  }
  return { values, runIds };
}

/**
 * Classifies how much the runs agree, and therefore how far the accepted
 * values can be pushed.
 *
 * A single measured run is never `stable`, whatever it says. One run has no
 * observable spread, so calling it stable would be asserting something the
 * evidence cannot contain - which is precisely the unexamined-single-run
 * failure binding decision 11 names. It is `insufficient` instead, and so is
 * a set still owing runs, a set with no measurement at all, and a set taken
 * across a host whose calibration degraded.
 */
export function assessStability(input: {
  runs: readonly LighthouseRunRecord[];
  allowance: RunAllowance;
  calibration: CalibrationReference;
  tolerances: StabilityTolerances;
  /** Defaults to `provisional`: a caller that has not said its thresholds were
   *  measured is assumed not to have measured them. */
  toleranceProvenance?: ToleranceProvenance;
  contradictionMultiple?: number;
}): ConfidenceAssessment {
  const multiple = input.contradictionMultiple ?? PROVISIONAL_CONTRADICTION_MULTIPLE;
  const toleranceProvenance = input.toleranceProvenance ?? 'provisional';
  const measuredRuns = input.runs.filter((run) => run.outcome.kind === 'measured');
  const reasons: ConfidenceReason[] = [];
  const unstableMetrics: MeasuredMetricKey[] = [];
  const contradictoryMetrics: MeasuredMetricKey[] = [];

  let sawSingleSampleMetric = false;
  for (const metric of MEASURED_METRIC_KEYS) {
    const samples = collectSamples(input.runs, metric);
    if (samples.values.length === 0) continue;
    if (samples.values.length < 2) {
      sawSingleSampleMetric = true;
      continue;
    }
    const tolerance = input.tolerances[metric];
    const spread = spreadOf(
      samples.values,
      representativeValue(samples.values, METRIC_DIRECTION[metric]),
    );
    if (!isWithinTolerance(spread, tolerance)) unstableMetrics.push(metric);
    if (isContradictory(spread, tolerance, multiple)) contradictoryMetrics.push(metric);
  }

  if (measuredRuns.length === 0) reasons.push('no-measured-run');
  else if (measuredRuns.length === 1) reasons.push('single-measured-run');
  if (input.allowance.runsOutstanding > 0) reasons.push('runs-outstanding');
  if (input.calibration.drift === 'degraded') reasons.push('host-calibration-degraded');
  if (toleranceProvenance === 'provisional') reasons.push('tolerances-uncalibrated');
  if (sawSingleSampleMetric && measuredRuns.length > 1) reasons.push('metric-single-sample');
  if (unstableMetrics.length > 0) reasons.push('metric-spread-exceeds-tolerance');
  if (contradictoryMetrics.length > 0) reasons.push('materially-contradictory-runs');

  const insufficient =
    measuredRuns.length < 2 ||
    input.allowance.runsOutstanding > 0 ||
    input.calibration.drift === 'degraded';

  let confidence: PerformanceConfidence;
  if (insufficient) confidence = 'insufficient';
  else if (unstableMetrics.length > 0 || sawSingleSampleMetric) confidence = 'noisy';
  else if (toleranceProvenance === 'provisional') {
    // Every metric sat inside the tolerances, but the tolerances were invented,
    // so what has been established is that the runs agreed to within a guess.
    // That is worth reporting with its disclosure and is not worth quoting as
    // a verified measurement, which is what `noisy` already means here.
    confidence = 'noisy';
  } else {
    confidence = 'stable';
    reasons.push('all-metrics-within-tolerance');
  }

  return { confidence, reasons, unstableMetrics, contradictoryMetrics };
}

/**
 * Turns a finished set's own instability back into the repeat triggers section
 * 12 lists, so the measurement loop closes without the caller having to
 * interpret a spread. Severity and threshold proximity are not derivable here
 * and stay the caller's to supply: this module has no opinion about where a
 * grade boundary sits.
 */
export function repeatTriggersFromAssessment(
  assessment: ConfidenceAssessment,
): readonly RepeatTrigger[] {
  const triggers: RepeatTrigger[] = [];
  if (assessment.unstableMetrics.length > 0) triggers.push('environment-unstable');
  if (assessment.contradictoryMetrics.length > 0) triggers.push('contradictory');
  return triggers;
}

/**
 * Builds the immutable record for one URL and profile.
 *
 * Every run given is kept. Runs are never reordered, filtered or deduplicated
 * on the way in, because the set's evidential value is that it is complete:
 * a caller that could drop a run before calling this would reintroduce exactly
 * the cherry-picking the median rule exists to prevent, and the digest would
 * cover the pruned set without saying so.
 */
export function buildPerformanceMeasurementSet(
  input: PerformanceMeasurementSetInput,
): PerformanceMeasurementSet {
  const runs: readonly LighthouseRunRecord[] = input.runs.map((run) => ({
    runId: run.runId,
    observedAt: run.observedAt.toISOString(),
    environmentFingerprintRef: run.environmentFingerprintRef,
    outcome: run.outcome,
  }));

  const measuredRunCount = runs.filter((run) => run.outcome.kind === 'measured').length;
  const allowance = runsOwedForPage({
    pageClass: input.pageClass,
    measuredRunCount,
    ...(input.repeatTriggers === undefined ? {} : { repeatTriggers: input.repeatTriggers }),
  });
  const calibration: CalibrationReference = input.calibration ?? { drift: 'unknown' };
  const confidence = assessStability({
    runs,
    allowance,
    calibration,
    tolerances: input.tolerances,
    ...(input.toleranceProvenance === undefined
      ? {}
      : { toleranceProvenance: input.toleranceProvenance }),
    ...(input.contradictionMultiple === undefined
      ? {}
      : { contradictionMultiple: input.contradictionMultiple }),
  });

  const metrics: AcceptedMetricValue[] = [];
  for (const metric of MEASURED_METRIC_KEYS) {
    const samples = collectSamples(runs, metric);
    if (samples.values.length === 0) continue;
    const value = representativeValue(samples.values, METRIC_DIRECTION[metric]);
    metrics.push({
      metric,
      value,
      source: 'lighthouse-lab',
      runIds: samples.runIds,
      spread: spreadOf(samples.values, value),
    });
  }

  const body = {
    version: PERFORMANCE_MEASUREMENT_SET_VERSION,
    url: input.url,
    profile: input.profile,
    pageClass: input.pageClass,
    selectionReasons: input.selectionReasons,
    runs,
    allowance,
    calibration,
    confidence,
    accepted: {
      source: 'lighthouse-lab',
      metrics,
      clientFacingUse: CLIENT_FACING_USE[confidence.confidence],
    },
  } as const;

  return { ...body, digest: canonicalDigest(body) };
}

/**
 * CrUX reports at origin or URL granularity and at no other grain. Section 12
 * requires field data to stay labelled by the granularity actually obtained,
 * because an origin p75 answers a question about the whole site and must not
 * be quoted as though it described the page a finding is attached to.
 */
export type FieldDataGranularity = 'origin' | 'url';

export interface FieldMetricValue {
  metric: 'lcp' | 'cls' | 'inp';
  p75: number;
}

export interface FieldDataAttempt {
  attemptedAt: string;
  error: string;
}

/**
 * The three outcomes of asking CrUX, held apart on purpose.
 *
 * `no-public-data` is a fact about the site: CrUX has a minimum-traffic
 * threshold and most audited businesses sit under it, so the absence is
 * expected, permanent for the run, and reportable as "not enough real-user
 * traffic for a public record". `provider-failure` is a fact about us: a
 * transport error, an auth problem, a rate limit. Section 12 requires these to
 * be distinct and the second to be retried, and the reason is that collapsing
 * them turns our own outage into a published claim about the client's traffic.
 * The existing `CruxFieldDataResult` cannot express the difference - both land
 * on `available: false` - which is the defect this type replaces.
 */
export type FieldDataState =
  | { kind: 'available'; metrics: readonly FieldMetricValue[] }
  | { kind: 'no-public-data' }
  | { kind: 'provider-failure'; attempts: readonly FieldDataAttempt[] };

export interface OriginFieldDataRecord {
  version: typeof ORIGIN_FIELD_DATA_RECORD_VERSION;
  /** The exact origin or URL queried, so the record cannot be read as
   *  describing a broader or narrower scope than it does. */
  scope: string;
  granularity: FieldDataGranularity;
  state: FieldDataState;
  observedAt: string;
  digest: string;
}

export interface OriginFieldDataRecordInput {
  scope: string;
  granularity: FieldDataGranularity;
  state: FieldDataState;
  observedAt: Date;
}

export function buildOriginFieldDataRecord(
  input: OriginFieldDataRecordInput,
): OriginFieldDataRecord {
  const body = {
    version: ORIGIN_FIELD_DATA_RECORD_VERSION,
    scope: input.scope,
    granularity: input.granularity,
    state: input.state,
    observedAt: input.observedAt.toISOString(),
  } as const;
  return { ...body, digest: canonicalDigest(body) };
}

/**
 * PROVISIONAL. How many acquisition attempts a provider failure is worth
 * before the run stops asking. Chosen to be small enough not to hold up a
 * scan and large enough to survive a single transient error; nothing measured
 * supports the exact number, and phase F's corpus run is where it should be
 * replaced with an observed failure profile.
 */
export const PROVISIONAL_FIELD_DATA_MAX_ATTEMPTS = 3;

export interface FieldDataRetryDecision {
  retry: boolean;
  reason:
    | 'provider-failure-retryable'
    | 'provider-failure-attempts-exhausted'
    | 'no-public-data-is-final'
    | 'already-acquired';
}

/**
 * Whether the run owes CrUX another attempt. Only a provider failure is ever
 * retried: re-asking after `no-public-data` would put load on the API to be
 * told the same thing, since the site's traffic will not cross Google's
 * threshold during our scan. Exhausting the attempts leaves the record in
 * `provider-failure`, which is the honest terminal state - it never decays
 * into `no-public-data`.
 */
export function shouldRetryFieldDataAcquisition(
  record: OriginFieldDataRecord,
  options: { maxAttempts?: number } = {},
): FieldDataRetryDecision {
  const maxAttempts = options.maxAttempts ?? PROVISIONAL_FIELD_DATA_MAX_ATTEMPTS;
  if (record.state.kind === 'available') return { retry: false, reason: 'already-acquired' };
  if (record.state.kind === 'no-public-data') {
    return { retry: false, reason: 'no-public-data-is-final' };
  }
  if (record.state.attempts.length >= maxAttempts) {
    return { retry: false, reason: 'provider-failure-attempts-exhausted' };
  }
  return { retry: true, reason: 'provider-failure-retryable' };
}

/**
 * Reads the legacy `CruxFieldDataResult` into the two-state distinction.
 *
 * The mapping is lossy in one direction that callers need to know about: a
 * provider failure whose error message was empty is indistinguishable from a
 * genuine absence of public data in the legacy shape, and this function has no
 * choice but to read it as `no-public-data`. That is not a defect in the
 * adapter, it is the defect in the old shape that made this module necessary,
 * and it is why new acquisitions should build an `OriginFieldDataRecord`
 * directly rather than round-tripping through the manifest type.
 */
export function fieldDataStateFromCruxResult(
  result: CruxFieldDataResult,
  observedAt: Date,
): FieldDataState {
  if (result.fetchError !== undefined && result.fetchError !== '') {
    return {
      kind: 'provider-failure',
      attempts: [{ attemptedAt: observedAt.toISOString(), error: result.fetchError }],
    };
  }
  if (!result.available) return { kind: 'no-public-data' };
  const metrics: FieldMetricValue[] = [];
  if (result.lcp !== undefined) metrics.push({ metric: 'lcp', p75: result.lcp.p75 });
  if (result.cls !== undefined) metrics.push({ metric: 'cls', p75: result.cls.p75 });
  if (result.inp !== undefined) metrics.push({ metric: 'inp', p75: result.inp.p75 });
  return { kind: 'available', metrics };
}

/** The field half of a report-facing view. When no field data was obtained
 *  the branch carries a reason and no numbers - there is no shape here into
 *  which a lab value would fit. */
export type FieldEvidenceView =
  | {
      source: 'crux-field';
      granularity: FieldDataGranularity;
      scope: string;
      metrics: readonly FieldMetricValue[];
    }
  | { source: 'none'; reason: 'no-public-data' | 'provider-failure' | 'not-acquired' };

export interface PerformanceEvidenceView {
  url: string;
  profile: MeasurementProfile;
  lab: AcceptedPerformanceValues;
  field: FieldEvidenceView;
}

/**
 * The one place lab and field evidence appear together, and it keeps them
 * apart. Each half carries its own `source` tag and neither is reachable from
 * the other: a caller that wants a field number has to read `field.metrics`,
 * which only ever exists when CrUX actually answered. A Lighthouse value
 * cannot arrive there by any route, which is section 12's requirement that lab
 * values are never called CrUX or field data expressed as a shape rather than
 * as a rule someone has to remember.
 */
export function describePerformanceEvidence(
  set: PerformanceMeasurementSet,
  fieldRecord?: OriginFieldDataRecord,
): PerformanceEvidenceView {
  let field: FieldEvidenceView;
  if (fieldRecord === undefined) {
    field = { source: 'none', reason: 'not-acquired' };
  } else if (fieldRecord.state.kind === 'available') {
    field = {
      source: 'crux-field',
      granularity: fieldRecord.granularity,
      scope: fieldRecord.scope,
      metrics: fieldRecord.state.metrics,
    };
  } else {
    field = { source: 'none', reason: fieldRecord.state.kind };
  }
  return { url: set.url, profile: set.profile, lab: set.accepted, field };
}

/**
 * Looks up the set for exactly one URL and profile.
 *
 * There is no fallback to a sibling, a template representative or the origin.
 * Returning `undefined` for an unmeasured page is the correct answer under
 * binding decision 7, and a caller that wants a number for such a page has to
 * go and measure it.
 */
export function measurementForUrl(
  sets: readonly PerformanceMeasurementSet[],
  url: string,
  profile: MeasurementProfile,
): PerformanceMeasurementSet | undefined {
  return sets.find((set) => set.url === url && set.profile === profile);
}

export interface UnmeasuredFamilyMember {
  url: string;
  /** Fixed, and deliberately not a measurement. The coverage ledger needs to
   *  record that this page has no performance evidence; what it must not
   *  record is the representative's numbers under this page's name. */
  reason: 'no-performance-measurement-of-its-own';
}

/**
 * The sibling pages of a measured template-family representative, listed as
 * gaps.
 *
 * This is the whole of the module's family awareness, and it returns URLs
 * rather than values on purpose. Section 18's performance matrix asks for a
 * sampled family member that propagates nothing; the way to guarantee that is
 * to give the propagation no function to travel through, so the representative
 * is not even a parameter here. What the caller gets is the list of pages
 * whose performance is unknown, which is a limitation to disclose, not a
 * number to publish.
 */
export function unmeasuredFamilyMembers(input: {
  familyMemberUrls: readonly string[];
  sets: readonly PerformanceMeasurementSet[];
  profile: MeasurementProfile;
}): readonly UnmeasuredFamilyMember[] {
  const measured = new Set(
    input.sets.filter((set) => set.profile === input.profile).map((set) => set.url),
  );
  return input.familyMemberUrls
    .filter((url) => !measured.has(url))
    .map((url) => ({ url, reason: 'no-performance-measurement-of-its-own' }) as const);
}
