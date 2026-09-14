/**
 * Issue #253: the exported event shape for job telemetry. Deliberately a
 * closed, structured type with no free-text field wide enough to carry
 * HTML, a full URL, a selector, or page content - the allowlist is the
 * type itself, not a redaction pass applied to arbitrary data afterwards.
 * redactJobTelemetryEvent below is defense in depth for a call site bug
 * (e.g. an accidental object spread), not the primary safeguard.
 */

/** Coarse, closed pipeline stages. Never the job document's own raw
 *  `phase` string (packages/store/src/schemas/job.schema.ts): a new phase
 *  value must be deliberately mapped here (see
 *  ../queue/pipeline/report-job-phase.ts) rather than silently exported. */
export type JobTelemetryStage =
  | 'queue-wait'
  | 'crawl'
  | 'page-work'
  | 'axe'
  | 'lighthouse'
  | 'normalize'
  | 'model-analysis'
  | 'report-render'
  | 'persistence';

/** A small, fixed classification of failure - never error.message, which
 *  can carry a URL, a selector, or provider response text. */
export type JobTelemetryErrorKind =
  'timeout' | 'cancelled' | 'validation' | 'external-provider' | 'unknown';

interface JobTelemetryEventBase {
  jobId: string;
  jobType: string;
  buildId: string;
}

export type JobTelemetryEvent =
  | (JobTelemetryEventBase & {
      kind: 'stage-transition';
      stage: JobTelemetryStage;
      previousStage?: JobTelemetryStage;
      previousStageDurationMs?: number;
    })
  | (JobTelemetryEventBase & {
      kind: 'job-failed';
      stage: JobTelemetryStage | 'unknown';
      errorKind: JobTelemetryErrorKind;
    });

const ALLOWED_KEYS = new Set<string>([
  'kind',
  'jobId',
  'jobType',
  'buildId',
  'stage',
  'previousStage',
  'previousStageDurationMs',
  'errorKind',
]);

/** A first-pass, deliberately coarse classification of a caught job error
 *  into the closed JobTelemetryErrorKind set - never the error's own
 *  message, which routinely carries a URL or provider response text.
 *  Expected to grow narrower cases as real pipeline failures are observed;
 *  everything unrecognized is 'unknown' rather than guessed. */
export function classifyJobError(error: unknown): JobTelemetryErrorKind {
  if (error instanceof Error) {
    if (error.name === 'AbortError' || error.name === 'TimeoutError') return 'timeout';
    if (error.constructor.name === 'ZodError') return 'validation';
  }
  return 'unknown';
}

/** Rebuilds the event from an allowlist of keys rather than trusting the
 *  input's own shape, so a bug that spreads an extra field onto an event
 *  object (e.g. `{ ...event, url }`) cannot smuggle it past the type
 *  system into a real sink. */
export function redactJobTelemetryEvent(event: JobTelemetryEvent): JobTelemetryEvent {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(event)) {
    if (ALLOWED_KEYS.has(key)) clean[key] = value;
  }
  return clean as unknown as JobTelemetryEvent;
}
