/**
 * Issue #253: the one interface application code calls to report job
 * telemetry. Callers never import Sentry (or any other provider) directly
 * - only this module and ./events.ts.
 */

import { redactJobTelemetryEvent, type JobTelemetryEvent } from './events.js';

export interface TelemetrySink {
  capture(event: JobTelemetryEvent): void;
}

/** Default sink: every environment without an explicit opt-in (see
 *  ./configure.ts) behaves exactly as it did before this pilot existed. */
export class NullTelemetrySink implements TelemetrySink {
  capture(): void {
    // deliberately empty
  }
}

/** Test-only sink: records events in order for assertions instead of
 *  sending them anywhere. */
export class RecordingTelemetrySink implements TelemetrySink {
  readonly events: JobTelemetryEvent[] = [];

  capture(event: JobTelemetryEvent): void {
    this.events.push(event);
  }
}

let activeSink: TelemetrySink = new NullTelemetrySink();

export function configureJobTelemetrySink(sink: TelemetrySink): void {
  activeSink = sink;
}

export function getJobTelemetrySink(): TelemetrySink {
  return activeSink;
}

/** Telemetry is diagnostic, never load-bearing: a sink that throws (a
 *  misconfigured client, a synchronous network error) must never fail the
 *  job it is describing. */
export function captureJobTelemetry(event: JobTelemetryEvent): void {
  try {
    activeSink.capture(redactJobTelemetryEvent(event));
  } catch {
    // swallowed deliberately - see doc comment above.
  }
}
