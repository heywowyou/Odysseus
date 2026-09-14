/**
 * Issue #254: the one interface application code calls to report LLM call
 * telemetry. Same shape as packages/interface/src/telemetry/job-telemetry.ts
 * deliberately - metadata-only telemetry, disabled by default, never
 * load-bearing.
 */

import { redactLlmCallTelemetryEvent, type LlmCallTelemetryEvent } from './events.js';

export interface LlmTelemetrySink {
  capture(event: LlmCallTelemetryEvent): void;
}

/** Default sink: no telemetry provider is wired up in this evaluation -
 *  see docs/rules/telemetry-rules.md - so every caller behaves exactly as
 *  it did before this evaluation existed. */
export class NullLlmTelemetrySink implements LlmTelemetrySink {
  capture(): void {
    // deliberately empty
  }
}

/** Test-only sink: records events in order for assertions. */
export class RecordingLlmTelemetrySink implements LlmTelemetrySink {
  readonly events: LlmCallTelemetryEvent[] = [];

  capture(event: LlmCallTelemetryEvent): void {
    this.events.push(event);
  }
}

let activeSink: LlmTelemetrySink = new NullLlmTelemetrySink();

export function configureLlmTelemetrySink(sink: LlmTelemetrySink): void {
  activeSink = sink;
}

export function getLlmTelemetrySink(): LlmTelemetrySink {
  return activeSink;
}

/** Telemetry is diagnostic, never load-bearing: a sink that throws must
 *  never fail the analysis pass it is describing. */
export function captureLlmCallTelemetry(event: LlmCallTelemetryEvent): void {
  try {
    activeSink.capture(redactLlmCallTelemetryEvent(event));
  } catch {
    // swallowed deliberately - see doc comment above.
  }
}
