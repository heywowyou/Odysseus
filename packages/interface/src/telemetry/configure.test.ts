import { describe, expect, it, vi } from 'vitest';

const { createSentryTelemetrySink } = vi.hoisted(() => ({
  createSentryTelemetrySink: vi.fn(() => ({ capture: vi.fn() })),
}));
vi.mock('./sentry-sink.js', () => ({ createSentryTelemetrySink }));

import { configureTelemetryFromEnv } from './configure.js';
import { getJobTelemetrySink, NullTelemetrySink } from './job-telemetry.js';

describe('configureTelemetryFromEnv', () => {
  it('configures the NullTelemetrySink when SENTRY_DSN is unset, so an unconfigured deployment (and every test run) behaves unchanged', () => {
    configureTelemetryFromEnv({});

    expect(getJobTelemetrySink()).toBeInstanceOf(NullTelemetrySink);
    expect(createSentryTelemetrySink).not.toHaveBeenCalled();
  });

  it('configures the NullTelemetrySink when SENTRY_DSN is blank', () => {
    configureTelemetryFromEnv({ SENTRY_DSN: '  ' });

    expect(getJobTelemetrySink()).toBeInstanceOf(NullTelemetrySink);
    expect(createSentryTelemetrySink).not.toHaveBeenCalled();
  });

  it('creates a Sentry sink only when a DSN is present, never requiring one for the default path', () => {
    configureTelemetryFromEnv({ SENTRY_DSN: 'https://fake@fake.ingest.sentry.io/0' });

    expect(createSentryTelemetrySink).toHaveBeenCalledWith(
      expect.objectContaining({ dsn: 'https://fake@fake.ingest.sentry.io/0' }),
    );
  });
});
