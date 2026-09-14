import { beforeEach, describe, expect, it, vi } from 'vitest';

const { init, addBreadcrumb, captureMessage } = vi.hoisted(() => ({
  init: vi.fn(),
  addBreadcrumb: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@sentry/node', () => ({ init, addBreadcrumb, captureMessage }));

import { createSentryTelemetrySink } from './sentry-sink.js';
import type { JobTelemetryEvent } from './events.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createSentryTelemetrySink', () => {
  it('initializes with no default PII collection and a redacting beforeSend', () => {
    createSentryTelemetrySink({ dsn: 'https://fake@fake.ingest.sentry.io/0', environment: 'test' });

    expect(init).toHaveBeenCalledTimes(1);
    const options = init.mock.calls[0]?.[0];
    expect(options.dsn).toBe('https://fake@fake.ingest.sentry.io/0');
    expect(options.environment).toBe('test');
    expect(options.sendDefaultPii).toBe(false);
    expect(typeof options.beforeSend).toBe('function');
  });

  it("beforeSend strips Sentry's own automatically-collected request and user data", () => {
    createSentryTelemetrySink({ dsn: 'https://fake@fake.ingest.sentry.io/0', environment: 'test' });
    const options = init.mock.calls[0]?.[0];

    const sentryEvent = {
      request: { url: 'https://client-site.example/secret', headers: { cookie: 'a=b' } },
      user: { ip_address: '1.2.3.4' },
      message: 'job full-audit failed at stage crawl',
    };

    const result = options.beforeSend(sentryEvent);

    expect(result.request).toBeUndefined();
    expect(result.user).toBeUndefined();
    expect(result.message).toBe('job full-audit failed at stage crawl');
  });

  it('reports a stage-transition event as an info breadcrumb only', () => {
    const sink = createSentryTelemetrySink({
      dsn: 'https://fake@fake.ingest.sentry.io/0',
      environment: 'test',
    });
    const event: JobTelemetryEvent = {
      kind: 'stage-transition',
      jobId: 'job-1',
      jobType: 'full-audit',
      buildId: 'abc123',
      stage: 'crawl',
    };

    sink.capture(event);

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'job-pipeline', level: 'info', data: event }),
    );
    expect(captureMessage).not.toHaveBeenCalled();
  });

  it('reports a job-failed event as both a breadcrumb and a captured message, with only allowlisted tags', () => {
    const sink = createSentryTelemetrySink({
      dsn: 'https://fake@fake.ingest.sentry.io/0',
      environment: 'test',
    });
    const event: JobTelemetryEvent = {
      kind: 'job-failed',
      jobId: 'job-1',
      jobType: 'full-audit',
      buildId: 'abc123',
      stage: 'crawl',
      errorKind: 'timeout',
    };

    sink.capture(event);

    expect(addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'job-pipeline', level: 'error', data: event }),
    );
    expect(captureMessage).toHaveBeenCalledWith(
      'job full-audit failed at stage crawl',
      expect.objectContaining({
        level: 'error',
        tags: { jobType: 'full-audit', stage: 'crawl', errorKind: 'timeout' },
      }),
    );
  });
});
