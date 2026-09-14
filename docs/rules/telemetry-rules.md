# Job telemetry rules

Canonical source for issue #253's Sentry pilot. Owns the job-queue
telemetry interface's data contract, its current pilot scope, and what
production enablement still requires.

## What this is

`packages/interface/src/telemetry/` is the only application seam that may
report job-execution telemetry. Application code calls
`captureJobTelemetry` (`job-telemetry.ts`); it never imports a telemetry
provider SDK directly.

The event shape (`events.ts`) is a closed, structured TypeScript type with
no free-text field wide enough to carry HTML, a full URL, a selector,
cookies, authorization headers, or page content:

- `stage-transition`: `jobId`, `jobType`, `buildId`, a coarse `stage`
  (`queue-wait | crawl | page-work | axe | lighthouse | normalize |
  model-analysis | report-render | persistence`), and optionally the
  previous stage plus how long the job spent there.
- `job-failed`: the same identifying fields, the last stage observed
  before the failure, and a coarse `errorKind` (`timeout | cancelled |
  validation | external-provider | unknown`) - never the error's own
  message.

`redactJobTelemetryEvent` rebuilds every event from that allowlist before
it reaches a sink, so a call-site bug that spreads an extra field onto an
event object still cannot leak it. This is defense in depth: the primary
safeguard is that the type itself has nowhere to put a URL or page
content.

## Sinks

- `NullTelemetrySink` - the default. Every environment without
  `SENTRY_DSN` set, including every test run, behaves exactly as it did
  before this pilot existed.
- `RecordingTelemetrySink` - test-only, captures events in order.
- `SentryTelemetrySink` (`sentry-sink.ts`) - wraps `@sentry/node`.
  `sendDefaultPii` is off, and `beforeSend` strips Sentry's own
  automatically-collected `request`/`user` data as a second layer on top
  of the closed event schema. Reports a breadcrumb for every event, plus
  `captureMessage` for a `job-failed` event.

`captureJobTelemetry` never lets a sink failure propagate: telemetry is
diagnostic, never load-bearing, so a misconfigured client or a
synchronous network error must not fail the job it describes.

## Pilot scope (current)

Only the full-audit and outreach-full-scan job types are instrumented,
through `packages/interface/src/queue/pipeline/report-job-phase.ts`, which
wraps store's `updateJobProgress` - already the single choke point every
phase transition in those two job types flows through (issue #243 found
this was the one live correlation seam in the pipeline, and chose not to
thread a logger through all seven runners individually; this pilot reuses
that same choke point for telemetry instead). Other job types
(prospecting, prospect-ingestion, hotel-prescan, the outreach batch jobs)
report no telemetry yet.

## Before enabling a production DSN

This issue's acceptance criteria require documenting the following before
`SENTRY_DSN` is set in production - none of it is decided yet:

- **Region**: Sentry's EU region if the hosted product is used, keyed by
  the DSN host at signup, not something this code chooses.
- **Retention**: use Sentry's project-level default unless a shorter
  period is agreed; document whatever is chosen here once decided.
- **Sampling**: `sampleRate` defaults to 1 (every event) in
  `createSentryTelemetrySink`, appropriate for this queue's inherently low
  event volume (one job at a time, by design) - revisit if that changes.
- **Access**: who on the operator side has Sentry project access.
- **Review gate**: a deliberate operator decision to set `SENTRY_DSN` in
  the deployment environment - not an automatic consequence of this pilot
  landing.

## Extending the pilot

A new job type gets telemetry by having its runner call
`reportJobPhase(connection, jobId, jobType, patch)` in place of store's
`updateJobProgress`, and adding its phase names to `PHASE_TO_STAGE` in
`report-job-phase.ts`. A phase with no entry there produces no telemetry
rather than an invented stage name.

`classifyJobError` (`events.ts`) is deliberately coarse and expected to
grow narrower cases as real pipeline failures are observed against it;
add a case there, never a raw error message anywhere in the telemetry
path.
