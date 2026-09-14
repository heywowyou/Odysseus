import { afterEach, describe, expect, it } from 'vitest';
import {
  captureJobTelemetry,
  configureJobTelemetrySink,
  NullTelemetrySink,
  RecordingTelemetrySink,
} from './job-telemetry.js';
import type { JobTelemetryEvent } from './events.js';

const event: JobTelemetryEvent = {
  kind: 'stage-transition',
  jobId: 'job-1',
  jobType: 'full-audit',
  buildId: 'abc123',
  stage: 'crawl',
};

afterEach(() => {
  configureJobTelemetrySink(new NullTelemetrySink());
});

describe('captureJobTelemetry', () => {
  it('is a silent no-op with the default NullTelemetrySink', () => {
    expect(() => captureJobTelemetry(event)).not.toThrow();
  });

  it('forwards a redacted copy of the event to the configured sink', () => {
    const sink = new RecordingTelemetrySink();
    configureJobTelemetrySink(sink);

    captureJobTelemetry(event);

    expect(sink.events).toEqual([event]);
  });

  it('never propagates a sink failure - telemetry must not fail the job it describes', () => {
    configureJobTelemetrySink({
      capture() {
        throw new Error('sink is down');
      },
    });

    expect(() => captureJobTelemetry(event)).not.toThrow();
  });
});
